const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');
const { events } = require('../utils/notify');
const whatsapp = require('../services/whatsapp.service');

// ── GET /api/appointments/branches — الفروع للعملاء ──────
const getPublicBranches = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.id, b.name, b.city, b.address, b.phone,
              s.shop_name, s.phone as shop_phone, s.logo_url
       FROM branches b
       LEFT JOIN shop_settings s ON s.branch_id = b.id
       WHERE b.is_active = true
       ORDER BY b.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// ── GET /api/appointments/availability — المواعيد المتاحة ─
const getAvailability = async (req, res, next) => {
  try {
    const { branch_id, date } = req.query;
    if (!branch_id || !date) throw new AppError('branch_id و date مطلوبان');

    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();

    // جلب ساعات العمل لهذا اليوم
    const { rows: wh } = await query(
      `SELECT * FROM working_hours
       WHERE branch_id = $1 AND day_of_week = $2`,
      [branch_id, dayOfWeek]
    );

    if (!wh.length || !wh[0].is_open) {
      return res.json({ success: true, data: [], message: 'الفرع مغلق هذا اليوم' });
    }

    const hours = wh[0];
    const slotDuration = hours.slot_duration || 30;
    const maxPerSlot   = hours.max_per_slot  || 3;

    // توليد كل الـ slots
    const slots = [];
    const [openH, openM]   = hours.open_time.split(':').map(Number);
    const [closeH, closeM] = hours.close_time.split(':').map(Number);
    let currentMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    while (currentMinutes + slotDuration <= closeMinutes) {
      const h = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
      const m = (currentMinutes % 60).toString().padStart(2, '0');
      slots.push(`${h}:${m}`);
      currentMinutes += slotDuration;
    }

    // جلب الحجوزات الموجودة
    const { rows: existing } = await query(
      `SELECT appointment_time, COUNT(*) as count
       FROM appointments
       WHERE branch_id = $1 AND appointment_date = $2
         AND status NOT IN ('cancelled')
       GROUP BY appointment_time`,
      [branch_id, date]
    );

    const bookedMap = {};
    existing.forEach(e => { bookedMap[e.appointment_time] = parseInt(e.count); });

    // حساب المتاح
    const now = new Date();
    const isToday = dateObj.toDateString() === now.toDateString();
    const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

    const availability = slots.map(slot => {
      const [sh, sm] = slot.split(':').map(Number);
      const slotMinutes = sh * 60 + sm;
      const booked = bookedMap[slot] || 0;
      const available = maxPerSlot - booked;
      const isPast = isToday && slotMinutes <= nowMinutes + 30; // +30 دقيقة buffer

      return {
        time:      slot,
        available: Math.max(0, available),
        booked,
        max:       maxPerSlot,
        disabled:  isPast || available <= 0,
      };
    }).filter(s => !s.disabled || s.available > 0); // أظهر slots المتاحة فقط

    res.json({ success: true, data: availability, working_hours: hours });
  } catch (err) { next(err); }
};

// ── POST /api/appointments — حجز موعد (عام - بدون auth) ──
const createAppointment = async (req, res, next) => {
  try {
    const {
      branch_id, customer_name, customer_phone,
      device_type, device_brand, problem_desc,
      appointment_date, appointment_time, notes
    } = req.body;

    // Validation
    if (!branch_id || !customer_name || !customer_phone || !appointment_date || !appointment_time)
      throw new AppError('جميع الحقول المطلوبة يجب إدخالها');

    // تحقق من التوفر
    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM appointments
       WHERE branch_id=$1 AND appointment_date=$2 AND appointment_time=$3
         AND status NOT IN ('cancelled')`,
      [branch_id, appointment_date, appointment_time]
    );

    const { rows: wh } = await query(
      `SELECT max_per_slot FROM working_hours
       WHERE branch_id=$1 AND day_of_week=EXTRACT(DOW FROM $2::date)`,
      [branch_id, appointment_date]
    );
    const maxPerSlot = wh[0]?.max_per_slot || 3;

    if (parseInt(countRows[0].count) >= maxPerSlot)
      throw new AppError('هذا الموعد ممتلئ، يرجى اختيار موعد آخر');

    // إنشاء الحجز
    const { rows } = await query(
      `INSERT INTO appointments
         (branch_id, customer_name, customer_phone, device_type, device_brand,
          problem_desc, appointment_date, appointment_time, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       RETURNING *`,
      [branch_id, customer_name, customer_phone.trim(),
       device_type || null, device_brand || null,
       problem_desc || null, appointment_date, appointment_time, notes || null]
    );
    const appt = rows[0];

    // جلب بيانات الفرع
    const { rows: shopRows } = await query(
      `SELECT s.shop_name, s.phone, b.name as branch_name
       FROM shop_settings s JOIN branches b ON b.id=s.branch_id
       WHERE s.branch_id=$1`, [branch_id]
    );
    const shop = shopRows[0] || {};

    // إرسال تأكيد واتساب للعميل
    const dateFormatted = new Date(appointment_date).toLocaleDateString('ar-SA', {
      weekday:'long', year:'numeric', month:'long', day:'numeric'
    });

    whatsapp.sendText(customer_phone,
      `مرحباً ${customer_name} 👋\n\n` +
      `✅ *تم استلام طلب حجزك*\n\n` +
      `📅 التاريخ: ${dateFormatted}\n` +
      `🕐 الوقت: ${appointment_time}\n` +
      `📍 الفرع: ${shop.branch_name || ''}\n` +
      `${device_brand ? `📱 الجهاز: ${device_brand} ${device_type || ''}` : ''}\n\n` +
      `رقم الحجز: *#${appt.id.slice(0,8).toUpperCase()}*\n\n` +
      `سنتواصل معك لتأكيد الموعد.\n` +
      `📞 ${shop.phone || ''}\n${shop.shop_name || 'FixPro للصيانة'}`
    ).catch(() => {});

    // إشعار الحجز الجديد
    const apptDate = `${appointment_date} ${appointment_time}`;
    events.newAppointment(branch_id, customer_name, apptDate, customer_phone).catch(()=>{});

    // إشعار داخلي للاستقبال
    await query(
      `INSERT INTO notifications (channel, message, type, is_read)
       VALUES ('internal', $1, 'appointment', false)`,
      [`حجز جديد: ${customer_name} — ${dateFormatted} ${appointment_time}`]
    ).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'تم تسجيل حجزك بنجاح',
      data: { id: appt.id, ref: appt.id.slice(0,8).toUpperCase() }
    });
  } catch (err) { next(err); }
};

// ── GET /api/appointments — قائمة الحجوزات (للمدير) ─────
const getAppointments = async (req, res, next) => {
  try {
    const { date, status, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conds  = [];

    // Admin يرى كل الفروع — باقي الأدوار يرون فرعهم فقط
    if (req.user.role !== 'admin' && req.user.branch_id) {
      params.push(req.user.branch_id);
      conds.push(`a.branch_id = $${params.length}`);
    }

    if (date)   { params.push(date);   conds.push(`a.appointment_date = $${params.length}`); }
    if (status) { params.push(status); conds.push(`a.status = $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await query(
      `SELECT a.*, b.name as branch_name
       FROM appointments a
       JOIN branches b ON b.id = a.branch_id
       ${where}
       ORDER BY a.appointment_date DESC, a.appointment_time ASC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM appointments a ${where.replace(/LIMIT.*/, '')}`,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(countRows[0].count),
        page: Number(page),
        pages: Math.ceil(countRows[0].count / limit)
      }
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/appointments/:id/status — تحديث الحالة ────
const updateAppointmentStatus = async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const VALID = ['pending','confirmed','cancelled','completed'];
    if (!VALID.includes(status)) throw new AppError('حالة غير صحيحة');

    const { rows } = await query(
      `UPDATE appointments SET status=$1, notes=COALESCE($2,notes),
        confirmed_by=CASE WHEN $1='confirmed' THEN $3 ELSE confirmed_by END,
        updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [status, notes || null, req.user.id, req.params.id]
    );
    if (!rows.length) throw new AppError('الحجز غير موجود', 404);

    const appt = rows[0];

    // إشعار واتساب عند التأكيد أو الإلغاء
    const { rows: shopRows } = await query(
      'SELECT shop_name, phone FROM shop_settings WHERE branch_id=$1',
      [appt.branch_id]
    );
    const shop = shopRows[0] || {};
    const dateFormatted = new Date(appt.appointment_date).toLocaleDateString('ar-SA', {
      weekday:'long', year:'numeric', month:'long', day:'numeric'
    });

    if (status === 'confirmed') {
      whatsapp.sendText(appt.customer_phone,
        `مرحباً ${appt.customer_name} 😊\n\n` +
        `✅ *تم تأكيد موعدك*\n\n` +
        `📅 ${dateFormatted}\n🕐 ${appt.appointment_time}\n\n` +
        `في انتظارك!\n📞 ${shop.phone || ''}\n${shop.shop_name || 'FixPro للصيانة'}`
      ).catch(() => {});
    } else if (status === 'cancelled') {
      whatsapp.sendText(appt.customer_phone,
        `مرحباً ${appt.customer_name}\n\n` +
        `❌ للأسف تم إلغاء موعدك\n` +
        `📅 ${dateFormatted} — ${appt.appointment_time}\n\n` +
        `${notes ? `السبب: ${notes}\n\n` : ''}` +
        `يمكنك حجز موعد جديد عبر موقعنا.\n📞 ${shop.phone || ''}`
      ).catch(() => {});
    }

    res.json({ success: true, message: 'تم تحديث الحجز', data: appt });
  } catch (err) { next(err); }
};

// ── POST /api/appointments/:id/convert — تحويل لتذكرة ────
const convertToTicket = async (req, res, next) => {
  try {
    const { rows: apptRows } = await query(
      'SELECT * FROM appointments WHERE id=$1', [req.params.id]
    );
    if (!apptRows.length) throw new AppError('الحجز غير موجود', 404);
    const appt = apptRows[0];

    // تحقق/إنشاء العميل
    let customerId;
    const { rows: custRows } = await query(
      'SELECT id FROM customers WHERE phone=$1 AND branch_id=$2',
      [appt.customer_phone, appt.branch_id]
    );

    if (custRows.length) {
      customerId = custRows[0].id;
    } else {
      const { rows: newCust } = await query(
        'INSERT INTO customers (branch_id, full_name, phone) VALUES ($1,$2,$3) RETURNING id',
        [appt.branch_id, appt.customer_name, appt.customer_phone]
      );
      customerId = newCust[0].id;
    }

    // إنشاء جهاز مؤقت
    const { rows: devRows } = await query(
      `INSERT INTO devices (customer_id, brand, model, device_type)
       VALUES ($1,$2,'غير محدد',$3) RETURNING id`,
      [customerId, appt.device_brand || 'غير محدد', appt.device_type || 'smartphone']
    );

    // إنشاء الأوردر
    const year = new Date().getFullYear();
    const { rows: countRows } = await query(
      'SELECT COUNT(*)+1 as seq FROM orders WHERE branch_id=$1', [appt.branch_id]
    );
    const orderNumber = `ORD-${year}-${String(countRows[0].seq).padStart(4,'0')}`;

    const { rows: orderRows } = await query(
      `INSERT INTO orders (branch_id, customer_id, device_id, order_number, status,
         problem_desc, created_by)
       VALUES ($1,$2,$3,$4,'new',$5,$6) RETURNING id, order_number`,
      [appt.branch_id, customerId, devRows[0].id, orderNumber,
       appt.problem_desc || 'حجز موعد', req.user.id]
    );

    // ربط الحجز بالتذكرة
    await query(
      'UPDATE appointments SET order_id=$1, status=$2 WHERE id=$3',
      [orderRows[0].id, 'completed', appt.id]
    );

    res.json({
      success: true,
      message: 'تم تحويل الحجز لتذكرة صيانة',
      data: { order_id: orderRows[0].id, order_number: orderRows[0].order_number }
    });
  } catch (err) { next(err); }
};

// ── GET /api/appointments/working-hours — أوقات العمل ────
const getWorkingHours = async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || req.user?.branch_id;
    const { rows } = await query(
      'SELECT * FROM working_hours WHERE branch_id=$1 ORDER BY day_of_week',
      [branchId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// ── PUT /api/appointments/working-hours — تحديث أوقات ────
const updateWorkingHours = async (req, res, next) => {
  try {
    const { hours } = req.body; // array of day configs

    for (const h of hours) {
      await query(
        `INSERT INTO working_hours (branch_id, day_of_week, open_time, close_time, is_open, slot_duration, max_per_slot)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (branch_id, day_of_week) DO UPDATE SET
           open_time=EXCLUDED.open_time, close_time=EXCLUDED.close_time,
           is_open=EXCLUDED.is_open, slot_duration=EXCLUDED.slot_duration,
           max_per_slot=EXCLUDED.max_per_slot`,
        [req.user.branch_id, h.day_of_week, h.open_time, h.close_time,
         h.is_open, h.slot_duration || 30, h.max_per_slot || 3]
      );
    }

    res.json({ success: true, message: 'تم حفظ أوقات العمل' });
  } catch (err) { next(err); }
};

module.exports = {
  getPublicBranches, getAvailability, createAppointment,
  getAppointments, updateAppointmentStatus, convertToTicket,
  getWorkingHours, updateWorkingHours,
};
