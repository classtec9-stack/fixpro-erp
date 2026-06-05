const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');
const { notifyRole } = require('../utils/notify');

// POST /api/part-requests — الفني يطلب قطعة (بدون خصم)
const createRequest = async (req, res, next) => {
  try {
    const { order_id, part_id, part_name, quantity = 1, notes } = req.body;
    if (!order_id) throw new AppError('رقم التذكرة مطلوب');
    if (!part_id && !part_name) throw new AppError('يجب تحديد القطعة');

    // جلب اسم القطعة والسعر إذا كانت من المخزون
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

    // جلب رقم التذكرة
    const { rows: ord } = await query('SELECT order_number FROM orders WHERE id=$1', [order_id]);
    const orderNum = ord[0]?.order_number || order_id;

    // إشعار المخزن
    await notifyRole({
      branchId: req.user.branch_id,
      roles: ['warehouse','admin','branch_manager'],
      type: 'part_request',
      orderId: order_id,
      message: `طلب قطعة: ${pName} (×${quantity}) للتذكرة ${orderNum}`
    });

    res.status(201).json({ success: true, message: 'تم إرسال طلب القطعة للمخزن', data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/part-requests — قائمة الطلبات
const getRequests = async (req, res, next) => {
  try {
    const { status, order_id } = req.query;
    const params = [];
    const conds = [];
    if (status)   { params.push(status);   conds.push(`pr.status = $${params.length}`); }
    if (order_id) { params.push(order_id); conds.push(`pr.order_id = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT pr.*, o.order_number,
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

// POST /api/part-requests/:id/approve — المخزن يوافق ويحوّل القطعة (الخصم الوحيد)
const approveRequest = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: reqRows } = await client.query(
      'SELECT * FROM part_requests WHERE id=$1 FOR UPDATE', [req.params.id]
    );
    if (!reqRows.length) throw new AppError('الطلب غير موجود', 404);
    const pr = reqRows[0];
    if (pr.status !== 'pending') throw new AppError('تم معالجة هذا الطلب مسبقاً', 409);
    if (!pr.part_id) throw new AppError('هذه القطعة غير مرتبطة بالمخزون — أضفها يدوياً', 400);

    // تحقق من المخزون — مع التحقق أن القطعة من نفس فرع التذكرة
    const { rows: stock } = await client.query(
      `SELECT p.quantity, p.sell_price, p.name
       FROM parts p
       JOIN orders o ON o.id = $2
       WHERE p.id = $1
         AND p.branch_id = o.branch_id
       FOR UPDATE`,
      [pr.part_id, pr.order_id]
    );
    if (!stock.length) throw new AppError('القطعة غير موجودة أو لا تخص فرع هذه التذكرة', 403);
    if (stock[0].quantity < pr.quantity)
      throw new AppError(`الكمية المتاحة ${stock[0].quantity} فقط`);

    const price = pr.unit_price || stock[0].sell_price;

    // 1. أضف القطعة للتذكرة (مربوطة بالطلب)
    await client.query(
      `INSERT INTO order_parts (order_id, part_id, quantity, unit_price, added_by, request_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [pr.order_id, pr.part_id, pr.quantity, price, req.user.id, pr.id]
    );
    // trg_deduct_inventory يخصم تلقائياً عند INSERT — لا خصم يدوي هنا

    // 3. سجل حركة المخزون (issue)
    await client.query(
      `INSERT INTO inventory_movements (part_id, movement_type, quantity, reference_id, notes, created_by)
       VALUES ($1, 'issue', $2, $3, $4, $5)`,
      [pr.part_id, pr.quantity, pr.order_id,
       `صرف قطعة لتذكرة صيانة — ${stock[0].name}`, req.user.id]
    ).catch(() => {});

    // 4. حدّث حالة الطلب
    await client.query(
      `UPDATE part_requests SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2`,
      [req.user.id, pr.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: `تم تحويل ${stock[0].name} للتذكرة وخصمها من المخزون` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// POST /api/part-requests/:id/reject — رفض الطلب
const rejectRequest = async (req, res, next) => {
  try {
    const { reason } = req.body;
    await query(
      `UPDATE part_requests SET status='rejected', approved_by=$1, approved_at=NOW(),
        notes=COALESCE(notes,'') || ' | رفض: ' || $2 WHERE id=$3`,
      [req.user.id, reason || 'غير متوفر', req.params.id]
    );
    res.json({ success: true, message: 'تم رفض الطلب' });
  } catch (err) { next(err); }
};

module.exports = { createRequest, getRequests, approveRequest, rejectRequest };
