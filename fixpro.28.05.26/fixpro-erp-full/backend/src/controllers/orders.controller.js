// backend/src/controllers/orders.controller.js
// بدون transactions — متوافق مع Supabase pooler
const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id'] ? null : req.user.branch_id;

// GET /api/orders
const getOrders = async (req, res, next) => {
  try {
    const { status, priority, technician_id, search, page = 1, limit = 20, date_from, date_to } = req.query;
    const offset = (page - 1) * limit;
    const params = [], conditions = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.branch_id);
      conditions.push(`o.branch_id = $${params.length}`);
    } else if (req.headers['x-branch-id']) {
      params.push(req.user.branch_id);
      conditions.push(`o.branch_id = $${params.length}`);
    }

    if (req.user.role === 'technician') {
      params.push(req.user.id);
      conditions.push(`o.technician_id = $${params.length}`);
    }

    if (status)        { params.push(status);       conditions.push(`o.status = $${params.length}`); }
    if (priority)      { params.push(priority);      conditions.push(`o.priority = $${params.length}`); }
    if (technician_id) { params.push(technician_id); conditions.push(`o.technician_id = $${params.length}`); }
    if (date_from)     { params.push(date_from);     conditions.push(`o.received_at >= $${params.length}`); }
    if (date_to)       { params.push(date_to);       conditions.push(`o.received_at <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(o.order_number ILIKE $${n} OR c.full_name ILIKE $${n} OR c.phone ILIKE $${n} OR d.model ILIKE $${n})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countQ = await query(
      `SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id JOIN devices d ON d.id=o.device_id ${where}`, params
    );
    const total = parseInt(countQ.rows[0].count);

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.status, o.priority,
              o.problem_desc, o.estimated_cost, o.received_at, o.promised_at,
              c.id as customer_id, c.full_name as customer_name, c.phone as customer_phone,
              d.id as device_id, d.brand, d.model, d.device_type,
              u.full_name as technician_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = o.technician_id
       ${where}
       ORDER BY CASE o.priority WHEN 'vip' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, o.received_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: rows,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
};

// GET /api/orders/:id
const getOrderById = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT o.*, c.full_name as customer_name, c.phone as customer_phone, c.email as customer_email,
              d.brand, d.model, d.device_type, d.imei, d.serial_no, d.color,
              u.full_name as technician_name, cb.full_name as created_by_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u  ON u.id  = o.technician_id
       LEFT JOIN users cb ON cb.id = o.created_by
       WHERE o.id = $1 AND ($2::uuid IS NULL OR o.branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('الأوردر غير موجود', 404);

    const [parts, history, images] = await Promise.all([
      query(`SELECT op.*, p.name as part_name, p.sku FROM order_parts op JOIN parts p ON p.id=op.part_id WHERE op.order_id=$1`, [req.params.id]),
      query(`SELECT sl.*, u.full_name as changed_by_name FROM order_status_log sl LEFT JOIN users u ON u.id=sl.changed_by WHERE sl.order_id=$1 ORDER BY sl.created_at ASC`, [req.params.id]),
      query(`SELECT * FROM order_images WHERE order_id=$1 ORDER BY created_at`, [req.params.id]),
    ]);

    res.json({ success: true, data: { ...rows[0], parts: parts.rows, history: history.rows, images: images.rows } });
  } catch (err) { next(err); }
};

// POST /api/orders
const createOrder = async (req, res, next) => {
  try {
    const {
      customer_id, device_id, problem_desc, customer_notes,
      priority = 'normal', technician_id, estimated_cost, estimated_days,
      has_password = false, password_hint, physical_condition, accessories, promised_at
    } = req.body;

    if (!customer_id || !device_id || !problem_desc)
      throw new AppError('بيانات العميل والجهاز وصف المشكلة مطلوبة');

    const { rows } = await query(
      `INSERT INTO orders
         (branch_id, customer_id, device_id, created_by, technician_id,
          problem_desc, customer_notes, priority, estimated_cost, estimated_days,
          has_password, password_hint, physical_condition, accessories, promised_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [req.user.branch_id, customer_id, device_id, req.user.id, technician_id || null,
       problem_desc, customer_notes, priority, estimated_cost, estimated_days,
       has_password, password_hint, physical_condition, accessories, promised_at]
    );

    res.status(201).json({ success: true, message: 'تم إنشاء الأوردر بنجاح', data: rows[0] });
  } catch (err) { next(err); }
};

// PATCH /api/orders/:id/status
const updateStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['new','diagnosing','in_repair','waiting_part','ready','delivered','cancelled'];
    if (!validStatuses.includes(status)) throw new AppError('حالة غير صالحة');

    const branchId = getBranchId(req);
    const { rows: current } = await query(
      'SELECT id, status, technician_id, branch_id FROM orders WHERE id=$1',
      [req.params.id]
    );
    if (!current.length) throw new AppError('الأوردر غير موجود', 404);

    if (branchId && current[0].branch_id !== branchId)
      throw new AppError('ليس لديك صلاحية لتعديل هذا الأوردر', 403);
    if (req.user.role === 'technician' && current[0].technician_id !== req.user.id)
      throw new AppError('لا يمكنك تعديل هذا الأوردر', 403);

    const oldStatus = current[0].status;
    const { rows } = await query(
      `UPDATE orders SET status=$1,
         completed_at = CASE WHEN $1='ready'     THEN NOW() ELSE completed_at END,
         delivered_at = CASE WHEN $1='delivered' THEN NOW() ELSE delivered_at END
       WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );

    if (note) {
      await query(
        `INSERT INTO order_status_log (order_id, changed_by, old_status, new_status, note)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, req.user.id, oldStatus, status, note]
      ).catch(() => {});
    }

    res.json({ success: true, message: 'تم تحديث الحالة', data: rows[0] });
  } catch (err) { next(err); }
};

// PATCH /api/orders/:id/assign
const assignTechnician = async (req, res, next) => {
  try {
    const { technician_id } = req.body;
    const branchId = getBranchId(req);

    const { rows: current } = await query('SELECT branch_id FROM orders WHERE id=$1', [req.params.id]);
    if (!current.length) throw new AppError('الأوردر غير موجود', 404);
    if (branchId && current[0].branch_id !== branchId)
      throw new AppError('ليس لديك صلاحية لتعديل هذا الأوردر', 403);

    const { rows } = await query(
      'UPDATE orders SET technician_id=$1 WHERE id=$2 RETURNING *',
      [technician_id, req.params.id]
    );

    res.json({ success: true, message: 'تم إسناد الأوردر للفني', data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/orders/:id/parts
const addPart = async (req, res, next) => {
  try {
    const { part_id, quantity, unit_price } = req.body;
    const branchId = getBranchId(req);

    const { rows: order } = await query('SELECT branch_id FROM orders WHERE id=$1', [req.params.id]);
    if (!order.length) throw new AppError('الأوردر غير موجود', 404);
    if (branchId && order[0].branch_id !== branchId)
      throw new AppError('ليس لديك صلاحية لتعديل هذا الأوردر', 403);

    // تحقق من المخزون + خصم ذرّي في خطوة واحدة
    const { rows: stock } = await query(
      'SELECT quantity, sell_price, branch_id FROM parts WHERE id=$1',
      [part_id]
    );
    if (!stock.length) throw new AppError('القطعة غير موجودة', 404);
    if (branchId && stock[0].branch_id !== branchId)
      throw new AppError('هذه القطعة لا تنتمي لفرعك', 403);
    if (stock[0].quantity < quantity)
      throw new AppError(`الكمية المتاحة ${stock[0].quantity} فقط`);

    const price = unit_price || stock[0].sell_price;

    // INSERT — الـ trigger يخصم المخزون تلقائياً عند الإضافة
    const { rows } = await query(
      `INSERT INTO order_parts (order_id, part_id, quantity, unit_price)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, part_id, quantity, price]
    );

    res.status(201).json({ success: true, message: 'تم إضافة القطعة', data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/orders/:id/parts
const getOrderParts = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT op.*, p.name as part_name, p.sku, p.barcode
       FROM order_parts op JOIN parts p ON p.id=op.part_id
       WHERE op.order_id=$1`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// DELETE /api/orders/:id/parts/:partId
const removePart = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);

    const { rows: op } = await query(
      `SELECT op.*, o.branch_id FROM order_parts op
       JOIN orders o ON o.id=op.order_id
       WHERE op.id=$1 AND op.order_id=$2`,
      [req.params.partId, req.params.id]
    );
    if (!op.length) throw new AppError('القطعة غير موجودة في هذا الأوردر', 404);
    if (branchId && op[0].branch_id !== branchId)
      throw new AppError('ليس لديك صلاحية لتعديل هذا الأوردر', 403);

    // الحذف — الـ trigger يعيد الكمية للمخزون تلقائياً
    await query('DELETE FROM order_parts WHERE id=$1', [req.params.partId]);

    res.json({ success: true, message: 'تم حذف القطعة وإعادة الكمية للمخزون' });
  } catch (err) { next(err); }
};

module.exports = {
  getOrders, getOrderById, createOrder,
  updateStatus, assignTechnician,
  addPart, getOrderParts, removePart
};
