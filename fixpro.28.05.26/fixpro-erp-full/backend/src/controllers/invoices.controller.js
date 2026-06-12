// backend/src/controllers/invoices.controller.js
// نسخة بدون transactions — متوافقة مع Supabase pooler
// الحماية من الـ race conditions عبر شروط ذرّية داخل الـ SQL نفسه
const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id']
    ? null : req.user.branch_id;

// ── GET /api/invoices ────────────────────────────────────
const getInvoices = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, search, date_from, date_to } = req.query;
    const offset = (page - 1) * limit;
    const branchId = getBranchId(req);
    const params = [], conds = [];

    if (branchId) { params.push(branchId);  conds.push(`i.branch_id = $${params.length}`); }
    if (status)   { params.push(status);    conds.push(`i.status = $${params.length}`); }
    if (date_from){ params.push(date_from); conds.push(`i.created_at >= $${params.length}`); }
    if (date_to)  { params.push(date_to);   conds.push(`i.created_at <= $${params.length}::date + interval '1 day'`); }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(i.invoice_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR o.order_number ILIKE $${params.length})`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const count = await query(
      `SELECT COUNT(*) FROM invoices i
       JOIN customers c ON c.id=i.customer_id
       JOIN orders o ON o.id=i.order_id
       ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT i.*,
              c.full_name as customer_name, c.phone as customer_phone,
              o.order_number, o.status as order_status,
              d.brand, d.model
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN orders    o ON o.id = i.order_id
       JOIN devices   d ON d.id = o.device_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(count.rows[0].count), page: Number(page), limit: Number(limit), pages: Math.ceil(count.rows[0].count / limit) }
    });
  } catch (err) { next(err); }
};

// ── GET /api/invoices/stats ──────────────────────────────
const getInvoiceStats = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const p = branchId ? [branchId] : [];
    const bc = branchId ? `AND branch_id = $1` : '';

    const { rows } = await query(
      `SELECT
         COALESCE(SUM(total) FILTER (WHERE status='paid' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())),0) as month_revenue,
         COALESCE(SUM(balance_due) FILTER (WHERE status IN ('pending','partial')), 0) as total_pending,
         COUNT(*) FILTER (WHERE status='paid') as paid_count,
         COUNT(*) FILTER (WHERE status IN ('pending','partial')) as pending_count,
         COUNT(*) FILTER (WHERE status='cancelled') as cancelled_count,
         COUNT(*) FILTER (WHERE status='refunded') as refunded_count,
         COUNT(*) as total_count
       FROM invoices
       WHERE TRUE ${bc}`, p
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// ── GET /api/invoices/ticket/:orderId ────────────────────
const getTicketInvoiceData = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows: orderRows } = await query(
      `SELECT o.*, c.full_name as customer_name, c.phone as customer_phone,
              d.brand, d.model, d.device_type, d.imei, d.serial_no,
              u.full_name as technician_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = o.technician_id
       WHERE o.id = $1 AND ($2::uuid IS NULL OR o.branch_id = $2)`,
      [req.params.orderId, branchId]
    );
    if (!orderRows.length) throw new AppError('التذكرة غير موجودة', 404);

    const { rows: parts } = await query(
      `SELECT op.*, p.name as part_name, p.sku
       FROM order_parts op JOIN parts p ON p.id = op.part_id
       WHERE op.order_id = $1`,
      [req.params.orderId]
    );

    const { rows: shopRows } = await query(
      'SELECT * FROM shop_settings WHERE branch_id = $1',
      [orderRows[0].branch_id]
    );

    const { rows: invRows } = await query(
      `SELECT i.*, COALESCE(
         (SELECT json_agg(p ORDER BY p.created_at) FROM payments p WHERE p.invoice_id = i.id),
         '[]'
       ) as payments_list
       FROM invoices i
       WHERE i.order_id = $1 AND i.status NOT IN ('cancelled','refunded')
       ORDER BY i.created_at DESC LIMIT 1`,
      [req.params.orderId]
    );

    const parts_cost = parts.reduce((s, p) =>
      s + parseFloat(p.quantity) * parseFloat(p.unit_price), 0);

    res.json({
      success: true,
      data: {
        order: orderRows[0], parts, shop: shopRows[0] || {},
        invoice: invRows[0] || null,
        parts_cost: +parts_cost.toFixed(2),
      }
    });
  } catch (err) { next(err); }
};

// ── POST /api/invoices/ticket/:orderId/finalize ──────────
// بدون transaction: القراءات منفصلة والكتابة عملية واحدة ذرّية
const finalizeInvoice = async (req, res, next) => {
  try {
    const { labor_cost = 0, discount = 0, discount_reason, notes, due_date } = req.body;
    const branchId = getBranchId(req);

    const { rows: orderRows } = await query(
      `SELECT * FROM orders WHERE id = $1 AND ($2::uuid IS NULL OR branch_id = $2)`,
      [req.params.orderId, branchId]
    );
    if (!orderRows.length) throw new AppError('التذكرة غير موجودة', 404);
    const o = orderRows[0];

    const { rows: partsRows } = await query(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) as total FROM order_parts WHERE order_id = $1',
      [req.params.orderId]
    );
    const parts_cost = parseFloat(partsRows[0].total);
    const subtotal   = parseFloat(labor_cost) + parts_cost - parseFloat(discount);
    const vat_amount = +(subtotal * 0.15).toFixed(2);
    const total      = +(subtotal + vat_amount).toFixed(2);

    const { rows: existing } = await query(
      `SELECT id, paid_amount FROM invoices
       WHERE order_id=$1 AND status NOT IN ('cancelled','refunded') LIMIT 1`,
      [req.params.orderId]
    );

    let rows;
    if (existing.length) {
      const paid = parseFloat(existing[0].paid_amount || 0);
      ({ rows } = await query(
        `UPDATE invoices SET
           labor_cost=$1, parts_cost=$2, subtotal=$3, discount=$4, discount_reason=$5,
           vat_amount=$6, total=$7,
           balance_due = $7 - $8,
           status = CASE
             WHEN $8 >= $7 THEN 'paid'::invoice_status
             WHEN $8 > 0   THEN 'partial'::invoice_status
             ELSE 'pending'::invoice_status END,
           notes=COALESCE($9,notes), updated_at=NOW()
         WHERE id=$10 RETURNING *`,
        [labor_cost, parts_cost, subtotal, discount, discount_reason,
         vat_amount, total, paid, notes, existing[0].id]
      ));
    } else {
      // INSERT محمي بـ WHERE NOT EXISTS — ذرّي ضد السباق
      ({ rows } = await query(
        `INSERT INTO invoices
           (order_id, customer_id, branch_id, created_by,
            labor_cost, parts_cost, subtotal, discount, discount_reason,
            vat_rate, vat_amount, total, balance_due, notes, due_date)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,15,$10,$11,$12,$13,$14
         WHERE NOT EXISTS (
           SELECT 1 FROM invoices
           WHERE order_id = $1 AND status NOT IN ('cancelled','refunded')
         )
         RETURNING *`,
        [req.params.orderId, o.customer_id, o.branch_id, req.user.id,
         labor_cost, parts_cost, subtotal, discount, discount_reason,
         vat_amount, total, total, notes, due_date]
      ));
      if (!rows.length)
        throw new AppError('أُنشئت فاتورة لهذه التذكرة للتو — أعد تحميل الصفحة', 409);
    }

    res.json({ success: true, message: 'تم حفظ الفاتورة', data: rows[0] });
  } catch (err) { next(err); }
};

// ── GET /api/invoices/:id ────────────────────────────────
const getInvoiceById = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT i.*,
              c.full_name as customer_name, c.phone as customer_phone,
              o.order_number, o.status as order_status,
              d.brand, d.model,
              u.full_name as created_by_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN orders    o ON o.id = i.order_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.id = $1 AND ($2::uuid IS NULL OR i.branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('الفاتورة غير موجودة', 404);

    const { rows: payments } = await query(
      `SELECT p.*, u.full_name as received_by_name
       FROM payments p LEFT JOIN users u ON u.id=p.received_by
       WHERE p.invoice_id = $1 ORDER BY p.created_at`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], payments } });
  } catch (err) { next(err); }
};

// ── POST /api/invoices ───────────────────────────────────
const createInvoice = async (req, res, next) => {
  try {
    const { order_id, labor_cost = 0, discount = 0, discount_reason, notes, due_date } = req.body;
    if (!order_id) throw new AppError('رقم الأوردر مطلوب');

    const { rows: orderRows } = await query(
      'SELECT customer_id, branch_id FROM orders WHERE id = $1',
      [order_id]
    );
    if (!orderRows.length) throw new AppError('الأوردر غير موجود', 404);

    const branchId = getBranchId(req);
    if (branchId && orderRows[0].branch_id !== branchId)
      throw new AppError('ليس لديك صلاحية لإنشاء فاتورة لهذا الأوردر', 403);

    const { rows: partsRows } = await query(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) as total FROM order_parts WHERE order_id = $1',
      [order_id]
    );
    const parts_cost = parseFloat(partsRows[0].total);
    const subtotal   = parseFloat(labor_cost) + parts_cost - parseFloat(discount);
    const vat_amount = +(subtotal * 0.15).toFixed(2);
    const total      = +(subtotal + vat_amount).toFixed(2);

    // INSERT ذرّي محمي ضد التكرار — لا حاجة لفحص منفصل
    const { rows } = await query(
      `INSERT INTO invoices
         (order_id, customer_id, branch_id, created_by,
          labor_cost, parts_cost, subtotal, discount, discount_reason,
          vat_rate, vat_amount, total, balance_due, notes, due_date)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,15,$10,$11,$12,$13,$14
       WHERE NOT EXISTS (
         SELECT 1 FROM invoices
         WHERE order_id = $1 AND status NOT IN ('cancelled','refunded')
       )
       RETURNING *`,
      [order_id, orderRows[0].customer_id, req.user.branch_id, req.user.id,
       labor_cost, parts_cost, subtotal, discount, discount_reason,
       vat_amount, total, total, notes, due_date]
    );

    if (!rows.length)
      throw new AppError('يوجد فاتورة نشطة لهذه التذكرة مسبقاً — استخدم التعديل أو ألغِها أولاً', 409);

    res.status(201).json({ success: true, message: 'تم إنشاء الفاتورة', data: rows[0] });
  } catch (err) { next(err); }
};

// ── POST /api/invoices/:id/pay ───────────────────────────
const recordPayment = async (req, res, next) => {
  try {
    const { amount, method = 'cash', reference_no, notes } = req.body;
    if (!amount || amount <= 0) throw new AppError('المبلغ غير صالح');

    const branchId = getBranchId(req);

    // INSERT ذرّي: الدفعة تُسجَّل فقط إذا الفاتورة صالحة والرصيد كافٍ
    // الشرط داخل نفس الجملة = لا سباق بين الفحص والكتابة
    const { rows } = await query(
      `INSERT INTO payments (invoice_id, received_by, amount, method, reference_no, notes)
       SELECT $1, $2, $3, $4, $5, $6
       WHERE EXISTS (
         SELECT 1 FROM invoices
         WHERE id = $1
           AND ($7::uuid IS NULL OR branch_id = $7)
           AND status IN ('pending','partial')
           AND balance_due >= $3
       )
       RETURNING *`,
      [req.params.id, req.user.id, amount, method,
       reference_no || null, notes || null, branchId]
    );

    if (!rows.length) {
      // شخّص السبب لرسالة دقيقة
      const { rows: inv } = await query(
        `SELECT status, balance_due FROM invoices
         WHERE id = $1 AND ($2::uuid IS NULL OR branch_id = $2)`,
        [req.params.id, branchId]
      );
      if (!inv.length)                   throw new AppError('الفاتورة غير موجودة', 404);
      if (inv[0].status === 'paid')      throw new AppError('الفاتورة مدفوعة بالكامل مسبقاً');
      if (inv[0].status === 'cancelled') throw new AppError('لا يمكن تسجيل دفعة على فاتورة ملغاة');
      if (inv[0].status === 'refunded')  throw new AppError('لا يمكن تسجيل دفعة على فاتورة مستردة');
      throw new AppError(`المبلغ (${amount}) أكبر من الرصيد المتبقي (${inv[0].balance_due})`);
    }

    // Trigger حدّث balance & status — اقرأ النتيجة
    const { rows: updated } = await query(
      `SELECT i.*, COALESCE(
         (SELECT json_agg(p ORDER BY p.created_at) FROM payments p WHERE p.invoice_id=i.id),
         '[]'
       ) as payments_list FROM invoices i WHERE i.id = $1`,
      [req.params.id]
    );

    // نقاط الولاء التلقائية عند اكتمال الدفع
    if (updated[0]?.status === 'paid') {
      const points = Math.floor(updated[0].total / 10);
      if (points > 0) {
        query(`SELECT loyalty_points FROM customers WHERE id=$1`, [updated[0].customer_id])
          .then(({ rows: cust }) => {
            const newBalance = (cust[0]?.loyalty_points || 0) + points;
            return Promise.all([
              query(`UPDATE customers SET loyalty_points=$1 WHERE id=$2`, [newBalance, updated[0].customer_id]),
              query(
                `INSERT INTO loyalty_transactions
                   (customer_id,branch_id,order_id,invoice_id,transaction_type,points,balance_after,description,expires_at)
                 VALUES ($1,$2,$3,$4,'earn',$5,$6,$7,NOW()+INTERVAL '1 year')`,
                [updated[0].customer_id, updated[0].branch_id, updated[0].order_id,
                 req.params.id, points, newBalance, `نقاط من فاتورة ${updated[0].invoice_number}`]
              )
            ]);
          }).catch(() => {});
      }
    }

    // audit_log — تسجيل العملية المالية
    query(
      `INSERT INTO audit_log
         (user_id, branch_id, action, table_name, record_id, new_values)
       VALUES ($1,$2,'payment','payments',$3,$4)`,
      [req.user.id, req.user.branch_id, rows[0].id,
       JSON.stringify({ invoice_id: req.params.id, amount, method })]
    ).catch(() => {});

    res.json({ success: true, message: 'تم تسجيل الدفعة', payment: rows[0], invoice: updated[0] });
  } catch (err) { next(err); }
};

// ── POST /api/invoices/:id/cancel ───────────────────────
const cancelInvoice = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) throw new AppError('سبب الإلغاء مطلوب');

    const branchId = getBranchId(req);

    // UPDATE ذرّي: الشروط داخل WHERE — لا سباق
    const { rows } = await query(
      `UPDATE invoices SET status='cancelled', notes=COALESCE($1, notes), updated_at=NOW()
       WHERE id=$2
         AND ($3::uuid IS NULL OR branch_id = $3)
         AND status IN ('pending','partial')
       RETURNING *`,
      [reason, req.params.id, branchId]
    );

    if (!rows.length) {
      const { rows: inv } = await query(
        `SELECT status FROM invoices
         WHERE id = $1 AND ($2::uuid IS NULL OR branch_id = $2)`,
        [req.params.id, branchId]
      );
      if (!inv.length)                   throw new AppError('الفاتورة غير موجودة', 404);
      if (inv[0].status === 'paid')      throw new AppError('لا يمكن إلغاء فاتورة مدفوعة — استخدم الاسترداد');
      if (inv[0].status === 'cancelled') throw new AppError('الفاتورة ملغاة مسبقاً');
      if (inv[0].status === 'refunded')  throw new AppError('الفاتورة مستردة مسبقاً');
      throw new AppError('تعذر إلغاء الفاتورة');
    }

    // audit_log
    query(
      `INSERT INTO audit_log
         (user_id, branch_id, action, table_name, record_id, new_values)
       VALUES ($1,$2,'cancel','invoices',$3,$4)`,
      [req.user.id, req.user.branch_id, req.params.id,
       JSON.stringify({ reason })]
    ).catch(() => {});

    res.json({ success: true, message: 'تم إلغاء الفاتورة', data: rows[0] });
  } catch (err) { next(err); }
};

// ── POST /api/invoices/:id/refund ────────────────────────
const refundInvoice = async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || amount <= 0)  throw new AppError('مبلغ الاسترداد غير صالح');
    if (!reason?.trim())         throw new AppError('سبب الاسترداد مطلوب');

    const branchId = getBranchId(req);

    // INSERT ذرّي: الاسترداد يُسجَّل فقط إذا المدفوع يكفي — لا سباق
    const { rows: payRow } = await query(
      `INSERT INTO payments (invoice_id, received_by, amount, method, notes)
       SELECT $1, $2, $3, 'refund', $4
       WHERE EXISTS (
         SELECT 1 FROM invoices
         WHERE id = $1
           AND ($5::uuid IS NULL OR branch_id = $5)
           AND status IN ('paid','partial')
           AND paid_amount >= $6
       )
       RETURNING *`,
      [req.params.id, req.user.id, -Math.abs(amount), reason,
       branchId, Math.abs(amount)]
    );

    if (!payRow.length) {
      const { rows: inv } = await query(
        `SELECT status, paid_amount FROM invoices
         WHERE id = $1 AND ($2::uuid IS NULL OR branch_id = $2)`,
        [req.params.id, branchId]
      );
      if (!inv.length) throw new AppError('الفاتورة غير موجودة', 404);
      if (!['paid','partial'].includes(inv[0].status))
        throw new AppError('يمكن الاسترداد فقط للفواتير المدفوعة أو المدفوعة جزئياً');
      throw new AppError(`لا يمكن استرداد أكثر من المدفوع (${inv[0].paid_amount} ر.س)`);
    }

    // Trigger حدّث status تلقائياً
    const { rows } = await query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);

    // audit_log — الاسترداد عملية حساسة
    query(
      `INSERT INTO audit_log
         (user_id, branch_id, action, table_name, record_id, new_values)
       VALUES ($1,$2,'refund','payments',$3,$4)`,
      [req.user.id, req.user.branch_id, payRow[0].id,
       JSON.stringify({ invoice_id: req.params.id, amount: -Math.abs(amount), reason })]
    ).catch(() => {});

    res.json({
      success: true,
      message: `تم استرداد ${amount} ر.س`,
      refund: payRow[0],
      invoice: rows[0]
    });
  } catch (err) { next(err); }
};

module.exports = {
  getInvoices, getInvoiceStats,
  getTicketInvoiceData, finalizeInvoice,
  getInvoiceById, createInvoice,
  recordPayment, cancelInvoice, refundInvoice
};
