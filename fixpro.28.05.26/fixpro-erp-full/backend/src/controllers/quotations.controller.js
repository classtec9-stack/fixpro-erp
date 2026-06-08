const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');
const whatsapp = require('../services/whatsapp.service');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id'] ? null : req.user.branch_id;

// GET /api/quotations
const getQuotations = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const branchId = getBranchId(req);
    const params = [];
    const conds = [];

    if (branchId) { params.push(branchId); conds.push(`q.branch_id = $${params.length}`); }
    if (status)   { params.push(status);   conds.push(`q.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(q.quotation_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const count = await query(
      `SELECT COUNT(*) FROM quotations q JOIN customers c ON c.id=q.customer_id ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT q.*, c.full_name as customer_name, c.phone as customer_phone,
              o.order_number, u.full_name as created_by_name
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       JOIN orders    o ON o.id = q.order_id
       LEFT JOIN users u ON u.id = q.created_by
       ${where}
       ORDER BY q.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(count.rows[0].count), page: Number(page), limit: Number(limit) }
    });
  } catch (err) { next(err); }
};

// GET /api/quotations/:id
const getQuotationById = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT q.*, c.full_name as customer_name, c.phone as customer_phone,
              o.order_number, o.problem_desc, d.brand, d.model,
              u.full_name as created_by_name
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       JOIN orders    o ON o.id = q.order_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = q.created_by
       WHERE q.id = $1
         AND ($2::uuid IS NULL OR q.branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('عرض السعر غير موجود', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/quotations — إنشاء عرض سعر من تذكرة
const createQuotation = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { order_id, labor_cost = 0, discount = 0, notes, valid_hours = 48 } = req.body;
    if (!order_id) throw new AppError('رقم التذكرة مطلوب');

    // تحقق من التذكرة
    const { rows: orderRows } = await client.query(
      `SELECT o.*, c.full_name as customer_name, c.phone as customer_phone
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND ($2::uuid IS NULL OR o.branch_id = $2)`,
      [order_id, getBranchId(req)]
    );
    if (!orderRows.length) throw new AppError('التذكرة غير موجودة', 404);
    const o = orderRows[0];

    // حساب تكلفة القطع
    const { rows: partsRows } = await client.query(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) as total FROM order_parts WHERE order_id = $1',
      [order_id]
    );
    const parts_cost = parseFloat(partsRows[0].total);
    const subtotal   = parseFloat(labor_cost) + parts_cost - parseFloat(discount);
    const vat_amount = +(subtotal * 0.15).toFixed(2);
    const total      = +(subtotal + vat_amount).toFixed(2);
    const valid_until = new Date(Date.now() + valid_hours * 3600000);

    const { rows } = await client.query(
      `INSERT INTO quotations
         (order_id, customer_id, branch_id, created_by,
          labor_cost, parts_cost, subtotal, discount, vat_amount, total,
          notes, valid_until, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
       RETURNING *`,
      [order_id, o.customer_id, req.user.branch_id, req.user.id,
       labor_cost, parts_cost, subtotal, discount, vat_amount, total,
       notes, valid_until]
    );

    // ربط الـ quotation بالأوردر
    await client.query(
      'UPDATE orders SET quotation_id=$1 WHERE id=$2',
      [rows[0].id, order_id]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'تم إنشاء عرض السعر', data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// POST /api/quotations/:id/send — إرسال للعميل عبر واتساب
const sendQuotation = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT q.*, c.full_name as customer_name, c.phone,
              o.order_number, d.brand, d.model,
              s.shop_name, s.phone as shop_phone
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       JOIN orders    o ON o.id = q.order_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN shop_settings s ON s.branch_id = q.branch_id
       WHERE q.id = $1 AND ($2::uuid IS NULL OR q.branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('عرض السعر غير موجود', 404);
    const q = rows[0];

    if (q.status === 'approved' || q.status === 'rejected')
      throw new AppError('لا يمكن إرسال عرض سعر تمت معالجته');

    // رسالة واتساب
    const msg =
      `مرحباً ${q.customer_name} 👋\n\n` +
      `📋 *عرض سعر إصلاح جهازك*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📱 الجهاز: ${q.brand} ${q.model}\n` +
      `🔖 رقم التذكرة: ${q.order_number}\n\n` +
      `💰 *تفاصيل التكلفة:*\n` +
      `• أجرة العمل: ${q.labor_cost} ر.س\n` +
      `• قطع الغيار: ${q.parts_cost} ر.س\n` +
      (q.discount > 0 ? `• خصم: -${q.discount} ر.س\n` : '') +
      `• ضريبة 15%: ${q.vat_amount} ر.س\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💵 *الإجمالي: ${q.total} ر.س*\n\n` +
      `⏳ العرض صالح حتى: ${new Date(q.valid_until).toLocaleDateString('ar-SA')}\n\n` +
      `للموافقة أو الرفض يرجى التواصل:\n📞 ${q.shop_phone || ''}\n${q.shop_name || 'FixPro للصيانة'}`;

    await whatsapp.sendText(q.phone, msg).catch(() => {});

    await query(
      `UPDATE quotations SET status='sent', sent_at=NOW(), sent_via='whatsapp' WHERE id=$1`,
      [req.params.id]
    );

    res.json({ success: true, message: 'تم إرسال عرض السعر عبر واتساب' });
  } catch (err) { next(err); }
};

// PATCH /api/quotations/:id/respond — استجابة العميل
const respondToQuotation = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { response, rejection_reason } = req.body; // approved | rejected
    if (!['approved', 'rejected'].includes(response))
      throw new AppError('الاستجابة يجب أن تكون approved أو rejected');

    const branchId = getBranchId(req);
    const { rows: qRows } = await client.query(
      `SELECT q.*, o.status as order_status
       FROM quotations q JOIN orders o ON o.id = q.order_id
       WHERE q.id = $1 AND ($2::uuid IS NULL OR q.branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!qRows.length) throw new AppError('عرض السعر غير موجود', 404);
    const q = qRows[0];

    if (q.status !== 'sent' && q.status !== 'draft')
      throw new AppError('هذا العرض تمت معالجته مسبقاً');

    // تحديث الـ quotation
    await client.query(
      `UPDATE quotations SET
         status=$1, customer_response=$1, response_at=NOW(),
         rejection_reason=$2, updated_at=NOW()
       WHERE id=$3`,
      [response, rejection_reason || null, req.params.id]
    );

    // تحديث حالة التذكرة
    if (response === 'approved') {
      await client.query(
        `UPDATE orders SET status='in_repair', updated_at=NOW() WHERE id=$1`,
        [q.order_id]
      );
    } else {
      // رفض → انتظار قرار الفني
      await client.query(
        `UPDATE orders SET status='awaiting_technician_rejection', updated_at=NOW() WHERE id=$1`,
        [q.order_id]
      );
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: response === 'approved' ? 'تمت الموافقة — بدأ الإصلاح' : 'تم تسجيل الرفض'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

module.exports = { getQuotations, getQuotationById, createQuotation, sendQuotation, respondToQuotation };
