const { query, getClient } = require('../config/database');
const { events } = require('../utils/notify');
const whatsapp = require('../services/whatsapp.service');
const { AppError } = require('../middleware/error.middleware');

// الحالات المسموحة وترتيبها المنطقي
const VALID_STATUSES = [
  'new',              // تم الاستلام
  'quick_check',      // فحص سريع
  'diagnosing',       // قيد الفحص التفصيلي
  'waiting_approval', // انتظار موافقة العميل
  'in_repair',        // داخل ورشة الصيانة
  'waiting_part',     // يحتاج قطعة غيار
  'part_transferred', // القطعة في الطريق للفني ← جديد
  'ready',            // جاهز للتسليم
  'delivered',        // تم التسليم
  'rejected',         // مرفوض / لم يتم الإصلاح
  'cancelled'         // ملغي
];

// GET /api/tickets  — قائمة التذاكر مع فلترة
const getTickets = async (req, res, next) => {
  try {
    const { status, priority, technician_id, search, page = 1, limit = 20, date_from, date_to, my_tickets } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    // الفني يرى تذاكره فقط
    if (req.user.role === 'technician' || my_tickets === 'true') {
      params.push(req.user.id);
      conditions.push(`o.technician_id = $${params.length}`);
    }

    // موظف المخزن يرى فقط التذاكر التي تحتاج قطع
    if (req.user.role === 'warehouse') {
      conditions.push(`o.status = 'waiting_part'`);
    }

    // فلترة الفرع:
    // - Admin بدون X-Branch-ID → يرى كل الفروع
    // - Admin مع X-Branch-ID  → يرى الفرع المحدد فقط
    // - باقي الأدوار         → يرون فرعهم دائماً
    const isAdminViewingAll = req.user.role === 'admin' && !req.headers['x-branch-id'];
    if (!isAdminViewingAll && req.user.branch_id) {
      params.push(req.user.branch_id);
      conditions.push(`o.branch_id = $${params.length}`);
    }

    if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`o.priority = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`o.technician_id = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`o.received_at >= $${params.length}`); }
    if (date_to) { params.push(date_to + ' 23:59:59'); conditions.push(`o.received_at <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(o.order_number ILIKE $${n} OR c.full_name ILIKE $${n} OR c.phone ILIKE $${n} OR d.model ILIKE $${n} OR d.imei ILIKE $${n})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*) FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT
         o.id, o.order_number, o.status, o.priority,
         o.problem_desc, o.diagnosis_notes, o.estimated_cost,
         o.received_at, o.promised_at, o.completed_at, o.delivered_at,
         o.warranty_days,
         c.id as customer_id, c.full_name as customer_name, c.phone as customer_phone,
         d.id as device_id, d.brand, d.model, d.device_type, d.color, d.imei,
         t.full_name as technician_name, t.id as technician_id,
         cb.full_name as created_by_name,
         (SELECT COUNT(*) FROM order_parts op WHERE op.order_id = o.id) as parts_count
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       LEFT JOIN users t ON t.id = o.technician_id
       LEFT JOIN users cb ON cb.id = o.created_by
       ${where}
       ORDER BY
         CASE o.priority WHEN 'vip' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
         o.received_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = parseInt(countRes.rows[0].count);
    res.json({
      success: true,
      data: rows,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
};

// GET /api/tickets/:id  — تفاصيل تذكرة كاملة
const getTicketById = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.*,
         c.full_name as customer_name, c.phone as customer_phone, c.email as customer_email,
         d.brand, d.model, d.device_type, d.imei, d.serial_no, d.color,
         t.full_name as technician_name, t.phone as technician_phone,
         cb.full_name as created_by_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       LEFT JOIN users t ON t.id = o.technician_id
       LEFT JOIN users cb ON cb.id = o.created_by
       WHERE o.id = $1
         AND ($2::uuid IS NULL OR o.branch_id = $2)`,
      [req.params.id, req.user.branch_id || null]
    );
    if (!rows.length) throw new AppError('التذكرة غير موجودة', 404);

    const [partsRes, historyRes, imagesRes] = await Promise.all([
      query(`SELECT op.*, p.name as part_name, p.sku, p.category
             FROM order_parts op JOIN parts p ON p.id = op.part_id
             WHERE op.order_id = $1`, [req.params.id]),
      query(`SELECT sl.*, u.full_name as changed_by_name, u.role as changed_by_role
             FROM order_status_log sl
             LEFT JOIN users u ON u.id = sl.changed_by
             WHERE sl.order_id = $1 ORDER BY sl.created_at ASC`, [req.params.id]),
      query(`SELECT * FROM order_images WHERE order_id = $1 ORDER BY created_at`, [req.params.id])
    ]);

    res.json({
      success: true,
      data: { ...rows[0], parts: partsRes.rows, history: historyRes.rows, images: imagesRes.rows }
    });
  } catch (err) { next(err); }
};

// POST /api/tickets  — إنشاء تذكرة جديدة
const createTicket = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      // بيانات العميل
      customer_id, customer_name, customer_phone, customer_email,
      // بيانات الجهاز
      device_id, device_type, device_brand, device_model, device_color, device_imei, device_serial,
      // بيانات التذكرة
      ticket_type = 'repair',  // repair | quick_check
      problem_desc, customer_notes,
      priority = 'normal', technician_id,
      estimated_cost, estimated_days, promised_at,
      // حالة الجهاز عند الاستلام
      physical_condition, accessories, has_password = false, password_hint,
      // ضمان
      warranty_days = 30
    } = req.body;

    if (!problem_desc) throw new AppError('وصف المشكلة مطلوب');

    let cust_id = customer_id;
    let dev_id = device_id;

    // إنشاء عميل جديد أو جلبه إذا كان موجوداً (بدون ON CONFLICT)
    if (!cust_id) {
      if (!customer_name || !customer_phone) throw new AppError('اسم العميل ورقم الجوال مطلوبان');
      
      // ابحث عن العميل أولاً برقم الجوال
      const existingCust = await client.query(
        'SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 LIMIT 1',
        [customer_phone, req.user.branch_id]
      );
      
      if (existingCust.rows.length > 0) {
        // العميل موجود — استخدم نفس ID
        cust_id = existingCust.rows[0].id;
        // تحديث الاسم إذا تغيّر
        await client.query(
          'UPDATE customers SET full_name = $1 WHERE id = $2',
          [customer_name, cust_id]
        );
      } else {
        // عميل جديد — أنشئه
        const custRes = await client.query(
          `INSERT INTO customers (branch_id, full_name, phone, email)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [req.user.branch_id, customer_name, customer_phone, customer_email || null]
        );
        cust_id = custRes.rows[0].id;
      }
    }

    // إنشاء جهاز جديد إذا لم يكن موجوداً
    // للفحص السريع: الجهاز اختياري — نستخدم قيم افتراضية إذا لم تُذكر
    if (!dev_id) {
      if (ticket_type !== 'quick_check' && (!device_brand || !device_model))
        throw new AppError('ماركة الجهاز وموديله مطلوبان لتذاكر الصيانة');
      
      const brand = device_brand || 'غير محدد';
      const model = device_model || 'غير محدد';
      
      const devRes = await client.query(
        `INSERT INTO devices (customer_id, device_type, brand, model, color, imei, serial_no)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [cust_id, device_type || 'smartphone', brand, model,
         device_color || null, device_imei || null, device_serial || null]
      );
      dev_id = devRes.rows[0].id;
    }

    const initial_status = ticket_type === 'quick_check' ? 'quick_check' : 'new';

    const { rows } = await client.query(
      `INSERT INTO orders
         (branch_id, customer_id, device_id, created_by, technician_id,
          status, priority, problem_desc, customer_notes,
          estimated_cost, estimated_days, promised_at,
          physical_condition, accessories, has_password, password_hint,
          warranty_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        req.user.branch_id, cust_id, dev_id, req.user.id,
        technician_id || null, initial_status, priority,
        problem_desc, customer_notes,
        estimated_cost || null, estimated_days || null, promised_at || null,
        physical_condition, accessories, has_password, password_hint,
        warranty_days
      ]
    );

    // سجل الإنشاء
    await client.query(
      `INSERT INTO order_status_log (order_id, changed_by, new_status, note)
       VALUES ($1,$2,$3,$4)`,
      [rows[0].id, req.user.id, initial_status, 'تم إنشاء التذكرة']
    );

    // إشعار الفني المعين عند إنشاء التذكرة
    if (technician_id) {
      query(
        `INSERT INTO notifications
           (order_id, channel, recipient, message, status, type, is_read)
         VALUES ($1,'internal',$2::uuid,$3,'pending','status_change',false)`,
        [rows[0].id, technician_id,
         `تم إسناد تذكرة جديدة إليك: ${rows[0].order_number}`]
      ).catch(e => console.warn('notif err:', e.message));
    }

    await client.query('COMMIT');

    // جلب التذكرة كاملة
    const full = await query(
      `SELECT o.*, c.full_name as customer_name, c.phone as customer_phone,
              d.brand, d.model, d.device_type, d.imei,
              t.full_name as technician_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       LEFT JOIN users t ON t.id = o.technician_id
       WHERE o.id = $1`, [rows[0].id]
    );

    res.status(201).json({ success: true, message: 'تم إنشاء التذكرة بنجاح', data: full.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// PATCH /api/tickets/:id/status  — تحديث الحالة مع سجل كامل
const updateTicketStatus = async (req, res, next) => {
  try {
    const { status, note, rejection_reason } = req.body;
    if (!VALID_STATUSES.includes(status)) throw new AppError('حالة غير صالحة');

    // الفني لا يستطيع تسليم أو إلغاء
    if (req.user.role === 'technician' && ['delivered', 'cancelled'].includes(status))
      throw new AppError('ليس لديك صلاحية هذه العملية', 403);

    const current = await query('SELECT status, technician_id FROM orders WHERE id=$1', [req.params.id]);
    if (!current.rows.length) throw new AppError('التذكرة غير موجودة', 404);

    // الفني يعدّل تذاكره فقط
    if (req.user.role === 'technician' && current.rows[0].technician_id !== req.user.id)
      throw new AppError('يمكنك تعديل تذاكرك فقط', 403);

    const old_status = current.rows[0].status;

    // حالات خاصة
    const extra = {};
    if (status === 'ready') extra.completed_at = 'NOW()';
    if (status === 'delivered') extra.delivered_at = 'NOW()';

    // نبني الـ query بدون CASE لتجنب inconsistent types
    const isReady     = status === 'ready';
    const isDelivered = status === 'delivered';

    // عيّن user_id للـ trigger حتى يسجّل الاسم الصحيح
    await query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [req.user.id.toString()]
    ).catch(() => {});

    const { rows } = await query(
      `UPDATE orders SET
         status           = $1::order_status,
         completed_at     = CASE WHEN $2 THEN NOW() ELSE completed_at END,
         delivered_at     = CASE WHEN $3 THEN NOW() ELSE delivered_at END,
         diagnosis_notes  = COALESCE($4, diagnosis_notes)
       WHERE id = $5
       RETURNING *`,
      [status, isReady, isDelivered, rejection_reason || null, req.params.id]
    );

    // سجل التغيير مع اسم الموظف
    await query(
      `INSERT INTO order_status_log (order_id, changed_by, old_status, new_status, note)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, req.user.id, old_status, status,
       note || rejection_reason || null]
    );

    // ── إشعارات داخلية تلقائية ──────────────────────────────
    try {
      // جلب رقم الأوردر والفرع
      const { rows: ordRow } = await query(
        'SELECT order_number, branch_id FROM orders WHERE id=$1', [req.params.id]
      );
      const orderNum  = ordRow[0]?.order_number || req.params.id;
      const branchId  = ordRow[0]?.branch_id || req.user.branch_id;

      // إشعار موظفي المخزن عند طلب قطعة
      events.statusChanged(
        branchId, req.params.id, rows[0]?.order_number || '',
        status, req.user?.full_name || req.user?.fullName || ''
      ).catch(()=>{});
      if (status === 'ready') {
        events.deviceReady(
          branchId, req.params.id, rows[0]?.order_number || '',
          rows[0]?.customer_name || '', rows[0]?.customer_phone || ''
        ).catch(()=>{});
      }
      if (status === 'waiting_part') {
        const notifMsg = note
          ? `تذكرة ${orderNum} — طلب قطعة: ${note}`
          : `تذكرة ${orderNum} تحتاج قطعة غيار`;

        // ✅ FIX BE-002: Single INSERT...SELECT replaces N+1 loop
        await query(
          `INSERT INTO notifications (order_id, channel, recipient, message, status, type, is_read)
           SELECT $1, 'internal', u.id, $2, 'pending', 'part_request', false
           FROM users u
           WHERE u.branch_id = $3 AND u.role = 'warehouse' AND u.is_active = true`,
          [req.params.id, notifMsg, branchId]
        ).catch(e => console.warn('notif warehouse err:', e.message));
      }

      // إشعار موظفي خدمة العملاء عند انتظار موافقة
      if (status === 'waiting_approval') {
        const notifMsg = note
          ? `تذكرة ${orderNum} — رسالة للعميل: ${note}`
          : `تذكرة ${orderNum} تحتاج التواصل مع العميل`;

        // ✅ FIX BE-002: Single INSERT...SELECT replaces N+1 loop
        await query(
          `INSERT INTO notifications (order_id, channel, recipient, message, status, type, is_read)
           SELECT $1, 'internal', u.id, $2, 'pending', 'customer_review', false
           FROM users u
           WHERE u.branch_id = $3 AND u.role = 'customer_service' AND u.is_active = true`,
          [req.params.id, notifMsg, branchId]
        ).catch(e => console.warn('notif cs err:', e.message));
      }

      // إشعار الفني عند إسناد تذكرة جديدة
      if (['new','diagnosing'].includes(status) && rows[0]?.technician_id) {
        await query(
          `INSERT INTO notifications
             (order_id, channel, recipient, message, status, type, is_read)
           VALUES ($1,'internal',$2::uuid,$3,'pending','status_change',false)`,
          [req.params.id, rows[0].technician_id,
           `تم تحديث تذكرة ${orderNum} إلى: ${status}`]
        ).catch(e => console.warn('notif err:', e.message));
      }

    } catch (notifErr) {
      console.warn('Notification block warning:', notifErr.message);
    }

    // إرسال واتساب تلقائي عند الحالات المهمة
    try {
      const { rows: shopRows } = await query(
        'SELECT shop_name, track_url FROM shop_settings WHERE branch_id = $1',
        [req.user.branch_id]
      );
      const shop = shopRows[0] || {};
      const trackUrl = `https://${shop.track_url || 'fixpro.sa/track'}/${rows[0].order_number}`;

      if (status === 'ready') {
        const t = { ...rows[0], customer_name: rows[0].customer_name, customer_phone: rows[0].customer_phone, brand: rows[0].brand, model: rows[0].model };
        const msg = whatsapp.MESSAGES.device_ready(t, shop.shop_name || 'FixPro');
        whatsapp.sendText(msg.to, msg.text).catch(e => console.warn('WA send err:', e.message));
      }
    } catch (waErr) {
      console.warn('WhatsApp auto-send warning:', waErr.message);
    }

    res.json({ success: true, message: 'تم تحديث الحالة', data: rows[0] });
  } catch (err) { next(err); }
};

// PATCH /api/tickets/:id/assign  — إسناد لفني
const assignTechnician = async (req, res, next) => {
  try {
    const { technician_id, note } = req.body;
    const { rows } = await query(
      'UPDATE orders SET technician_id=$1 WHERE id=$2 RETURNING *',
      [technician_id, req.params.id]
    );
    if (!rows.length) throw new AppError('التذكرة غير موجودة', 404);

    await query(
      `INSERT INTO order_status_log (order_id, changed_by, old_status, new_status, note)
       VALUES ($1,$2,$3,$3,$4)`,
      [req.params.id, req.user.id, rows[0].status,
       `تم إسناد التذكرة للفني ${note || ''}`]
    );

    res.json({ success: true, message: 'تم إسناد التذكرة', data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/tickets/:id/convert-to-repair  — تحويل فحص سريع لتذكرة صيانة
const convertToRepair = async (req, res, next) => {
  try {
    const { technician_id, estimated_cost, note } = req.body;
    const current = await query('SELECT status FROM orders WHERE id=$1', [req.params.id]);
    if (!current.rows.length) throw new AppError('التذكرة غير موجودة', 404);
    if (current.rows[0].status !== 'quick_check')
      throw new AppError('يمكن التحويل فقط من حالة الفحص السريع');

    const { rows } = await query(
      `UPDATE orders SET status='new', technician_id=COALESCE($1,technician_id),
       estimated_cost=COALESCE($2,estimated_cost)
       WHERE id=$3 RETURNING *`,
      [technician_id, estimated_cost, req.params.id]
    );

    await query(
      `INSERT INTO order_status_log (order_id, changed_by, old_status, new_status, note)
       VALUES ($1,$2,'quick_check','new',$3)`,
      [req.params.id, req.user.id, note || 'تم تحويل الفحص السريع إلى تذكرة صيانة بموافقة العميل']
    );

    res.json({ success: true, message: 'تم التحويل إلى تذكرة صيانة', data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/tickets/status-board  — لوحة الحالات لعرض الأجهزة
const getStatusBoard = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const isTech  = req.user.role === 'technician';

    let boardQuery, params;

    if (isAdmin) {
      boardQuery = `SELECT o.id, o.order_number, o.status, o.priority, o.received_at,
              c.full_name as customer_name, c.phone as customer_phone,
              d.brand, d.model, d.color,
              t.full_name as technician_name,
              EXTRACT(EPOCH FROM (NOW() - o.received_at))/3600 as hours_in_shop
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       LEFT JOIN users t ON t.id = o.technician_id
       WHERE o.status NOT IN ('delivered','cancelled','rejected')
       ORDER BY CASE o.priority WHEN 'vip' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, o.received_at ASC`;
      params = [];
    } else if (isTech) {
      boardQuery = `SELECT o.id, o.order_number, o.status, o.priority, o.received_at,
              c.full_name as customer_name, c.phone as customer_phone,
              d.brand, d.model, d.color,
              t.full_name as technician_name,
              EXTRACT(EPOCH FROM (NOW() - o.received_at))/3600 as hours_in_shop
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       LEFT JOIN users t ON t.id = o.technician_id
       WHERE o.branch_id=$1 AND o.technician_id=$2
         AND o.status NOT IN ('delivered','cancelled','rejected')
       ORDER BY CASE o.priority WHEN 'vip' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, o.received_at ASC`;
      params = [req.user.branch_id, req.user.id];
    } else {
      boardQuery = `SELECT o.id, o.order_number, o.status, o.priority, o.received_at,
              c.full_name as customer_name, c.phone as customer_phone,
              d.brand, d.model, d.color,
              t.full_name as technician_name,
              EXTRACT(EPOCH FROM (NOW() - o.received_at))/3600 as hours_in_shop
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       LEFT JOIN users t ON t.id = o.technician_id
       WHERE o.branch_id=$1
         AND o.status NOT IN ('delivered','cancelled','rejected')
       ORDER BY CASE o.priority WHEN 'vip' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, o.received_at ASC`;
      params = [req.user.branch_id];
    }

    const { rows } = await query(boardQuery, params);

    // تجميع حسب الحالة
    const board = {};
    VALID_STATUSES.filter(s => !['delivered','cancelled'].includes(s)).forEach(s => board[s] = []);
    rows.forEach(r => { if (board[r.status]) board[r.status].push(r); });

    res.json({ success: true, data: board, total: rows.length });
  } catch (err) { next(err); }
};

// GET /api/tickets/abandoned  — أجهزة متروكة +5 أيام
const getAbandonedTickets = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.status, o.received_at,
              c.full_name as customer_name, c.phone as customer_phone,
              d.brand, d.model,
              EXTRACT(EPOCH FROM (NOW() - o.received_at))/86400 as days_in_shop
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       WHERE o.status IN ('ready','waiting_approval')
         AND o.received_at < NOW() - INTERVAL '5 days'
         AND (o.branch_id = $1 OR $2 = 'admin')
       ORDER BY o.received_at ASC`,
      [req.user.branch_id, req.user.role]
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) { next(err); }
};

// GET /api/tickets/public/:order_number  — بوابة العميل (بدون تسجيل دخول)
const getPublicStatus = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.order_number, o.status, o.received_at, o.promised_at,
              o.completed_at, o.delivered_at, o.warranty_days,
              o.diagnosis_notes, o.estimated_cost,
              c.full_name as customer_name,
              d.brand, d.model, d.device_type, d.color
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices d ON d.id = o.device_id
       WHERE o.order_number = $1`,
      [req.params.order_number.toUpperCase()]
    );
    if (!rows.length) throw new AppError('رقم التذكرة غير موجود', 404);

    const historyRes = await query(
      `SELECT new_status, note, created_at
       FROM order_status_log WHERE order_id = (
         SELECT id FROM orders WHERE order_number=$1
       ) ORDER BY created_at ASC`,
      [req.params.order_number.toUpperCase()]
    );

    res.json({ success: true, data: { ...rows[0], history: historyRes.rows } });
  } catch (err) { next(err); }
};

const getDevicesBoard = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id;
    const { status, priority, search } = req.query;

    const params = [];
    const conds  = ['o.status NOT IN ($1, $2)'];
    params.push('delivered', 'cancelled');

    if (req.user.role !== 'admin' && branchId) {
      params.push(branchId);
      conds.push(`o.branch_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conds.push(`o.status = $${params.length}`);
    }
    if (priority) {
      params.push(priority);
      conds.push(`o.priority = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(c.full_name ILIKE $${params.length} OR d.brand ILIKE $${params.length} OR o.order_number ILIKE $${params.length})`);
    }

    const { rows } = await query(
      `SELECT
         o.id, o.order_number, o.status, o.priority,
         o.received_at, o.estimated_cost,
         EXTRACT(EPOCH FROM (NOW()-o.received_at))/3600 as hours_in_shop,
         c.full_name as customer_name, c.phone as customer_phone,
         d.brand, d.model, d.color, d.device_type,
         u.full_name as technician_name,
         b.name as branch_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = o.technician_id
       LEFT JOIN branches b ON b.id = o.branch_id
       WHERE ${conds.join(' AND ')}
       ORDER BY
         CASE o.priority WHEN 'vip' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
         o.received_at ASC`,
      params
    );

    // تجميع بالحالة
    const board = {};
    const STATUS_ORDER = ['new','quick_check','diagnosing','waiting_approval','in_repair','waiting_part','part_transferred','ready','rejected'];
    STATUS_ORDER.forEach(s => board[s] = []);
    rows.forEach(r => {
      if (board[r.status]) board[r.status].push(r);
      else board[r.status] = [r];
    });

    res.json({
      success: true,
      data:    rows,
      board,
      counts:  Object.fromEntries(Object.entries(board).map(([k,v])=>[k,v.length])),
      total:   rows.length
    });
  } catch(err) { next(err); }
};

// PATCH /api/tickets/:id — تعديل بيانات التذكرة (العطل، نوع الجهاز، التكلفة)
const updateTicket = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { problem_desc, device_type, device_brand, device_model,
            device_color, device_imei, estimated_cost, diagnosis_notes, priority } = req.body;

    // جلب التذكرة الحالية
    const { rows: current } = await client.query(
      'SELECT o.*, d.id as device_id FROM orders o JOIN devices d ON d.id=o.device_id WHERE o.id=$1',
      [req.params.id]
    );
    if (!current.length) throw new AppError('التذكرة غير موجودة', 404);
    const old = current[0];

    // تحديث بيانات الجهاز
    await client.query(
      `UPDATE devices SET
         device_type = COALESCE($1, device_type),
         brand = COALESCE($2, brand),
         model = COALESCE($3, model),
         color = COALESCE($4, color),
         imei  = COALESCE($5, imei)
       WHERE id = $6`,
      [device_type, device_brand, device_model, device_color, device_imei, old.device_id]
    );

    // تحديث بيانات الطلب
    const { rows } = await client.query(
      `UPDATE orders SET
         problem_desc    = COALESCE($1, problem_desc),
         diagnosis_notes = COALESCE($2, diagnosis_notes),
         estimated_cost  = COALESCE($3, estimated_cost),
         priority        = COALESCE($4, priority),
         updated_at      = NOW()
       WHERE id = $5 RETURNING *`,
      [problem_desc, diagnosis_notes, estimated_cost, priority, req.params.id]
    );

    // سجل التغيير في التاريخ إذا تغيّر العطل
    if (problem_desc && problem_desc !== old.problem_desc) {
      await client.query(
        `INSERT INTO order_status_history (order_id, old_status, new_status, note, changed_by)
         VALUES ($1, $2, $2, $3, $4)`,
        [req.params.id, old.status, `تعديل العطل: ${old.problem_desc} ← ${problem_desc}`, req.user.id]
      ).catch(() => {});
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'تم تحديث التذكرة', data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

module.exports = {
  getTickets, updateTicket, getTicketById, createTicket,
  updateTicketStatus, assignTechnician,
  convertToRepair, getStatusBoard,
  getAbandonedTickets, getPublicStatus,
  getDevicesBoard
};
