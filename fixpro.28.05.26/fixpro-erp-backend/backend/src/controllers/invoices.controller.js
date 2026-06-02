const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');
const { events } = require('../utils/notify');

// POST /api/invoices — create from order
const createInvoice = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { order_id, labor_cost = 0, discount = 0, discount_reason, notes, due_date } = req.body;
    if (!order_id) throw new AppError('رقم الأوردر مطلوب');

    // Get parts cost for this order
    const { rows: partsRows } = await client.query(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) as total FROM order_parts WHERE order_id = $1',
      [order_id]
    );
    const parts_cost = parseFloat(partsRows[0].total);

    const subtotal    = parseFloat(labor_cost) + parts_cost - parseFloat(discount);
    const vat_rate    = 15;
    const vat_amount  = +(subtotal * vat_rate / 100).toFixed(2);
    const total       = +(subtotal + vat_amount).toFixed(2);

    // Get customer_id from order
    const { rows: orderRows } = await client.query(
      'SELECT customer_id FROM orders WHERE id = $1', [order_id]
    );
    if (!orderRows.length) throw new AppError('الأوردر غير موجود', 404);

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
    events.newInvoice(req.user.branch_id, order_id, rows[0].invoice_number || rows[0].id, total).catch(()=>{});
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

    const { rows: inv } = await query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (!inv.length) throw new AppError('الفاتورة غير موجودة', 404);
    if (inv[0].status === 'paid') throw new AppError('الفاتورة مدفوعة بالكامل مسبقاً');
    if (amount > inv[0].balance_due)
      throw new AppError(`المبلغ أكبر من الرصيد المتبقي (${inv[0].balance_due})`);

    const { rows } = await query(
      `INSERT INTO payments (invoice_id, received_by, amount, method, reference_no, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, req.user.id, amount, method, reference_no, notes]
    );

    // Trigger auto-updates invoice balance & status
    const { rows: updated } = await query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    events.paymentReceived(req.user.branch_id, null, amount, method).catch(()=>{});
    // إشعار الدفعة
    const { rows: invInfo } = await query(
      `SELECT c.full_name FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.id=$1`,
      [req.params.id]
    ).catch(()=>({rows:[]}));
    events.paymentReceived(
      req.user.branch_id, null, amount, method, invInfo[0]?.full_name || ''
    ).catch(()=>{});
    res.json({ success: true, message: 'تم تسجيل الدفعة', payment: rows[0], invoice: updated[0] });
  } catch (err) { next(err); }
};

// GET /api/invoices
const getInvoices = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.branch_id];
    const conditions = ['i.branch_id = $1'];

    if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(i.invoice_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
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


// GET /api/invoices/:id
const getInvoiceById = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT i.*, c.full_name as customer_name, c.phone as customer_phone,
              o.order_number
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN orders o ON o.id = i.order_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows.length) throw new AppError('الفاتورة غير موجودة', 404);
    res.json({ success: true, data: rows[0] });
  } catch(err) { next(err); }
};


// GET /api/invoices/ticket/:orderId — جلب كل بيانات التذكرة للفاتورة
const getTicketInvoiceData = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    // بيانات التذكرة الكاملة
    const { rows: orderRows } = await query(
      `SELECT o.*, o.problem_desc, o.diagnosis_notes, o.estimated_cost,
              c.full_name as customer_name, c.phone as customer_phone, c.email as customer_email,
              d.brand, d.model, d.color, d.imei, d.device_type,
              u.full_name as technician_name,
              b.name as branch_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = o.technician_id
       LEFT JOIN branches b ON b.id = o.branch_id
       WHERE o.id = $1`, [orderId]
    );
    if (!orderRows.length) throw new AppError('التذكرة غير موجودة', 404);

    // القطع المستخدمة
    const { rows: parts } = await query(
      `SELECT op.*, p.name as part_name, p.sku
       FROM order_parts op
       LEFT JOIN parts p ON p.id = op.part_id
       WHERE op.order_id = $1
       ORDER BY op.created_at ASC NULLS LAST`, [orderId]
    );

    // الفاتورة الحالية إن وجدت
    const { rows: invoices } = await query(
      `SELECT i.*, COALESCE(SUM(ip.amount), 0) as paid_amount
       FROM invoices i
       LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
       WHERE i.order_id = $1
       GROUP BY i.id
       ORDER BY i.created_at DESC LIMIT 1`, [orderId]
    );

    // إعدادات المحل
    const { rows: shopRows } = await query(
      `SELECT s.*, b.name as branch_name
       FROM shop_settings s
       LEFT JOIN branches b ON b.id = s.branch_id
       WHERE s.branch_id = $1`, [orderRows[0].branch_id || req.user.branch_id]
    );

    const partsCost = parts.reduce((s, p) => s + (Number(p.unit_price) * Number(p.quantity)), 0);

    res.json({
      success: true,
      data: {
        order:    orderRows[0],
        parts,
        parts_cost: partsCost,
        invoice:  invoices[0] || null,
        shop:     shopRows[0] || {},
      }
    });
  } catch (err) { next(err); }
};

// POST /api/invoices/ticket/:orderId/finalize — إنشاء/تحديث الفاتورة
const finalizeInvoice = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { orderId } = req.params;
    const { labor_cost = 0, discount = 0, discount_reason, notes, warranty_days = 30 } = req.body;

    // احسب تكلفة القطع
    const { rows: partsRows } = await client.query(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) as total FROM order_parts WHERE order_id=$1',
      [orderId]
    );
    const parts_cost = parseFloat(partsRows[0].total);
    const subtotal   = parts_cost + parseFloat(labor_cost) - parseFloat(discount);
    const vat_amount = +(subtotal * 0.15).toFixed(2);
    const total      = +(subtotal + vat_amount).toFixed(2);

    const { rows: ord } = await client.query(
      'SELECT customer_id, branch_id FROM orders WHERE id=$1', [orderId]
    );
    if (!ord.length) throw new AppError('التذكرة غير موجودة', 404);

    // تحقق هل توجد فاتورة سابقة
    const { rows: existing } = await client.query(
      'SELECT id FROM invoices WHERE order_id=$1', [orderId]
    );

    let invoiceRow;
    if (existing.length) {
      // تحديث الفاتورة
      const { rows } = await client.query(
        `UPDATE invoices SET
           labor_cost=$1, parts_cost=$2, subtotal=$3, discount=$4, discount_reason=$5,
           vat_amount=$6, total=$7, balance_due=(total - COALESCE((
             SELECT SUM(amount) FROM invoice_payments WHERE invoice_id=invoices.id
           ), 0)),
           notes=$8, updated_at=NOW()
         WHERE order_id=$9 RETURNING *`,
        [labor_cost, parts_cost, subtotal, discount, discount_reason,
         vat_amount, total, notes, orderId]
      );
      invoiceRow = rows[0];
    } else {
      // إنشاء فاتورة جديدة
      const { rows } = await client.query(
        `INSERT INTO invoices
           (order_id, customer_id, branch_id, created_by,
            labor_cost, parts_cost, subtotal, discount, discount_reason,
            vat_rate, vat_amount, total, balance_due, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,15,$10,$11,$12,$13)
         RETURNING *`,
        [orderId, ord[0].customer_id, ord[0].branch_id || req.user.branch_id, req.user.id,
         labor_cost, parts_cost, subtotal, discount, discount_reason,
         vat_amount, total, total, notes]
      );
      invoiceRow = rows[0];
      events.newInvoice(req.user.branch_id, orderId, total).catch(() => {});
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'تم حفظ الفاتورة', data: invoiceRow });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
};

module.exports = { createInvoice, finalizeInvoice, getTicketInvoiceData, recordPayment, getInvoices, getInvoiceById };
