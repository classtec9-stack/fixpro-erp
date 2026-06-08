const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// helper — نفس نمط customers.controller
const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id']
    ? null
    : req.user.branch_id;

// POST /api/invoices — create from order
const createInvoice = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { order_id, labor_cost = 0, discount = 0, discount_reason, notes, due_date } = req.body;
    if (!order_id) throw new AppError('رقم الأوردر مطلوب');

    // Get order — مع التحقق من الفرع
    const { rows: orderRows } = await client.query(
      'SELECT customer_id, branch_id FROM orders WHERE id = $1',
      [order_id]
    );
    if (!orderRows.length) throw new AppError('الأوردر غير موجود', 404);

    // branch isolation
    const branchId = getBranchId(req);
    if (branchId && orderRows[0].branch_id !== branchId)
      throw new AppError('ليس لديك صلاحية لإنشاء فاتورة لهذا الأوردر', 403);

    // Get parts cost
    const { rows: partsRows } = await client.query(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) as total FROM order_parts WHERE order_id = $1',
      [order_id]
    );
    const parts_cost = parseFloat(partsRows[0].total);

    const subtotal   = parseFloat(labor_cost) + parts_cost - parseFloat(discount);
    const vat_rate   = 15;
    const vat_amount = +(subtotal * vat_rate / 100).toFixed(2);
    const total      = +(subtotal + vat_amount).toFixed(2);

    const { rows } = await client.query(
      `INSERT INTO invoices
         (order_id, customer_id, branch_id, created_by,
          labor_cost, parts_cost, subtotal, discount, discount_reason,
          vat_rate, vat_amount, total, balance_due, notes, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        order_id, orderRows[0].customer_id, req.user.branch_id, req.user.id,
        labor_cost, parts_cost, subtotal, discount, discount_reason,
        vat_rate, vat_amount, total, total, notes, due_date
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'تم إنشاء الفاتورة', data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// POST /api/invoices/:id/pay — record a payment
const recordPayment = async (req, res, next) => {
  try {
    const { amount, method = 'cash', reference_no, notes } = req.body;
    if (!amount || amount <= 0) throw new AppError('المبلغ غير صالح');

    // جلب الفاتورة مع التحقق من الفرع
    const branchId = getBranchId(req);
    const { rows: inv } = await query(
      `SELECT * FROM invoices
       WHERE id = $1
         AND ($2::uuid IS NULL OR branch_id = $2)`,
      [req.params.id, branchId]
    );

    if (!inv.length) throw new AppError('الفاتورة غير موجودة', 404);
    if (inv[0].status === 'paid') throw new AppError('الفاتورة مدفوعة بالكامل مسبقاً');
    if (amount > inv[0].balance_due)
      throw new AppError(`المبلغ أكبر من الرصيد المتبقي (${inv[0].balance_due})`);

    const { rows } = await query(
      `INSERT INTO payments (invoice_id, received_by, amount, method, reference_no, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, req.user.id, amount, method, reference_no, notes]
    );

    // Trigger يحدّث invoice balance & status تلقائياً
    const { rows: updated } = await query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'تم تسجيل الدفعة', payment: rows[0], invoice: updated[0] });
  } catch (err) { next(err); }
};

// GET /api/invoices
const getInvoices = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const branchId = getBranchId(req);

    const params = [];
    const conditions = [];

    if (branchId) {
      params.push(branchId);
      conditions.push(`i.branch_id = $${params.length}`);
    }

    if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(i.invoice_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const count = await query(
      `SELECT COUNT(*) FROM invoices i JOIN customers c ON c.id=i.customer_id ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT i.*, c.full_name as customer_name, c.phone as customer_phone, o.order_number
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN orders o ON o.id = i.order_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total: parseInt(count.rows[0].count), page: Number(page), limit: Number(limit) }
    });
  } catch (err) { next(err); }
};

module.exports = { createInvoice, recordPayment, getInvoices };
