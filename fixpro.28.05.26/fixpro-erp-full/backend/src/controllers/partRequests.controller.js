// backend/src/controllers/partRequests.controller.js
// بدون transactions — متوافق مع Supabase pooler
const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');
const { notifyRole } = require('../utils/notify');

// POST /api/part-requests
const createRequest = async (req, res, next) => {
  try {
    const { order_id, part_id, part_name, quantity = 1, notes } = req.body;
    if (!order_id) throw new AppError('رقم التذكرة مطلوب');
    if (!part_id && !part_name) throw new AppError('يجب تحديد القطعة');

    let pName = part_name, price = null;
    if (part_id) {
      const { rows } = await query('SELECT name, sell_price FROM parts WHERE id=$1', [part_id]);
      if (rows.length) { pName = rows[0].name; price = rows[0].sell_price; }
    }

    const { rows } = await query(
      `INSERT INTO part_requests (order_id, part_id, part_name, quantity, unit_price, notes, requested_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [order_id, part_id || null, pName, quantity, price, notes || null, req.user.id]
    );

    const { rows: ord } = await query('SELECT order_number FROM orders WHERE id=$1', [order_id]);
    const orderNum = ord[0]?.order_number || order_id;

    notifyRole({
      branchId: req.user.branch_id,
      roles: ['warehouse','admin','branch_manager'],
      type: 'part_request', orderId: order_id,
      message: `طلب قطعة: ${pName} (×${quantity}) للتذكرة ${orderNum}`
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'تم إرسال طلب القطعة للمخزن', data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/part-requests
const getRequests = async (req, res, next) => {
  try {
    const { status, order_id } = req.query;
    const params = [], conds = [];
    if (status)   { params.push(status);   conds.push(`pr.status = $${params.length}`); }
    if (order_id) { params.push(order_id); conds.push(`pr.order_id = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT pr.id, pr.order_id, pr.part_id, pr.part_name, pr.quantity,
              pr.unit_price, pr.notes, pr.status, pr.requested_by, pr.approved_by,
              pr.created_at, pr.approved_at,
              o.order_number,
              req.full_name as requested_by_name,
              app.full_name as approved_by_name,
              p.quantity as stock_available
       FROM part_requests pr
       JOIN orders o ON o.id = pr.order_id
       LEFT JOIN users req ON req.id = pr.requested_by
       LEFT JOIN users app ON app.id = pr.approved_by
       LEFT JOIN parts p ON p.id = pr.part_id
       ${where}
       ORDER BY pr.created_at DESC LIMIT 100`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/part-requests/:id/approve — المخزن يوافق ويحوّل القطعة
const approveRequest = async (req, res, next) => {
  try {
    // 1. المطالبة الذرّية بالحالة — يمنع موافقة مزدوجة
    const { rows: claimed } = await query(
      `UPDATE part_requests SET status='approved', approved_by=$1, approved_at=NOW()
       WHERE id=$2 AND status='pending'
       RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!claimed.length) {
      const { rows: pr } = await query('SELECT status FROM part_requests WHERE id=$1', [req.params.id]);
      if (!pr.length) throw new AppError('الطلب غير موجود', 404);
      throw new AppError('تم معالجة هذا الطلب مسبقاً', 409);
    }
    const pr = claimed[0];
    if (!pr.part_id) {
      // تراجع: القطعة غير مرتبطة بالمخزون
      await query(
        "UPDATE part_requests SET status='pending', approved_by=NULL, approved_at=NULL WHERE id=$1",
        [pr.id]
      ).catch(() => {});
      throw new AppError('هذه القطعة غير مرتبطة بالمخزون — أضفها يدوياً للتذكرة', 400);
    }

    // 2. تحقق المخزون والفرع — قراءة فقط
    const { rows: stock } = await query(
      `SELECT p.quantity, p.sell_price, p.name, p.branch_id
       FROM parts p
       JOIN orders o ON o.id = $2 AND o.branch_id = p.branch_id
       WHERE p.id = $1`,
      [pr.part_id, pr.order_id]
    );
    if (!stock.length) {
      await query(
        "UPDATE part_requests SET status='pending', approved_by=NULL, approved_at=NULL WHERE id=$1",
        [pr.id]
      ).catch(() => {});
      throw new AppError('القطعة غير موجودة أو لا تخص فرع هذه التذكرة', 403);
    }
    if (stock[0].quantity < pr.quantity) {
      await query(
        "UPDATE part_requests SET status='pending', approved_by=NULL, approved_at=NULL WHERE id=$1",
        [pr.id]
      ).catch(() => {});
      throw new AppError(`الكمية المتاحة ${stock[0].quantity} فقط — الطلب أُعيد للانتظار`);
    }

    const price = pr.unit_price || stock[0].sell_price;

    // 3. أضف القطعة للتذكرة — trigger يخصم المخزون تلقائياً
    await query(
      `INSERT INTO order_parts (order_id, part_id, quantity, unit_price, added_by, request_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [pr.order_id, pr.part_id, pr.quantity, price, req.user.id, pr.id]
    );

    // 4. سجل حركة الصرف
    await query(
      `INSERT INTO inventory_movements
         (part_id, movement_type, quantity, reference_id, notes, created_by)
       VALUES ($1,'issue',$2,$3,$4,$5)`,
      [pr.part_id, pr.quantity, pr.order_id,
       `صرف قطعة لتذكرة صيانة — ${stock[0].name}`, req.user.id]
    ).catch(() => {});

    // 5. تحويل حالة التذكرة إلى part_transferred ذرّياً
    await query(
      `UPDATE orders SET status='part_transferred', updated_at=NOW()
       WHERE id=$1 AND status='waiting_part'`,
      [pr.order_id]
    );

    // 6. إشعار الفني باسم موظف المخزون الذي وافق
    const { rows: ordRow } = await query(
      'SELECT order_number, technician_id FROM orders WHERE id=$1',
      [pr.order_id]
    );
    if (ordRow[0]?.technician_id) {
      const { notifyUser } = require('../utils/notify');
      notifyUser({
        userId:   ordRow[0].technician_id,
        type:     'part_request',
        priority: 'high',
        orderId:  pr.order_id,
        message:  `📦 وصلت القطعة: ${stock[0].name} للتذكرة ${ordRow[0].order_number} — بواسطة: ${req.user.full_name || 'موظف المخزون'} | أكّد الاستلام لبدء الإصلاح`
      }).catch(() => {});
    }

    res.json({ success: true, message: `تم تحويل ${stock[0].name} للتذكرة وخصمها من المخزون — التذكرة انتقلت لحالة "القطعة في الطريق"` });
  } catch (err) { next(err); }
};

// POST /api/part-requests/:id/reject
const rejectRequest = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const { rows } = await query(
      `UPDATE part_requests
       SET status='rejected', approved_by=$1, approved_at=NOW(),
           notes=COALESCE(notes,'') || ' | رفض: ' || $2
       WHERE id=$3 AND status='pending'
       RETURNING *`,
      [req.user.id, reason || 'غير متوفر', req.params.id]
    );
    if (!rows.length) throw new AppError('الطلب غير موجود أو تمت معالجته مسبقاً', 409);
    res.json({ success: true, message: 'تم رفض الطلب' });
  } catch (err) { next(err); }
};

module.exports = { createRequest, getRequests, approveRequest, rejectRequest };
