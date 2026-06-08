const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// helper — يحدد branch_id المناسب بناءً على دور المستخدم والـ header
const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id']
    ? null          // admin بدون فرع محدد = كل الفروع
    : req.user.branch_id;

// GET /api/customers
const getCustomers = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const branchId = getBranchId(req);

    const params = [];
    const conditions = [];

    if (branchId) {
      params.push(branchId);
      conditions.push(`c.branch_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(c.full_name ILIKE $${n} OR c.phone ILIKE $${n} OR c.email ILIKE $${n})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const count = await query(
      `SELECT COUNT(*) FROM customers c ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT c.*,
         COUNT(DISTINCT o.id) as total_orders,
         MAX(o.received_at) as last_visit
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(count.rows[0].count),
        page: Number(page),
        limit: Number(limit)
      }
    });
  } catch (err) { next(err); }
};

// GET /api/customers/:id
const getCustomerById = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);

    // branch isolation — admin بدون فرع محدد يرى أي عميل
    const { rows } = await query(
      `SELECT * FROM customers
       WHERE id = $1
         AND ($2::uuid IS NULL OR branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('العميل غير موجود', 404);

    const { rows: orders } = await query(
      `SELECT o.id, o.order_number, o.status, o.received_at,
              d.brand, d.model, i.total
       FROM orders o
       JOIN devices d ON d.id = o.device_id
       LEFT JOIN invoices i ON i.order_id = o.id
       WHERE o.customer_id = $1
       ORDER BY o.received_at DESC LIMIT 20`,
      [req.params.id]
    );

    const { rows: devices } = await query(
      'SELECT * FROM devices WHERE customer_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], orders, devices } });
  } catch (err) { next(err); }
};

// POST /api/customers
// Customer Identity Policy:
//   1. رقم جديد → عميل جديد
//   2. نفس الرقم + نفس الاسم → أرجع العميل الحالي (بدون إنشاء)
//   3. نفس الرقم + اسم مختلف → 409 Conflict
const createCustomer = async (req, res, next) => {
  try {
    const { full_name, phone, phone_alt, email, address, city, notes } = req.body;
    if (!full_name || !phone) throw new AppError('الاسم ورقم الجوال مطلوبان');

    // تحقق من وجود عميل بنفس الرقم في نفس الفرع
    const { rows: existing } = await query(
      'SELECT * FROM customers WHERE phone = $1 AND branch_id = $2',
      [phone, req.user.branch_id]
    );

    if (existing.length) {
      const found = existing[0];
      if (found.full_name.trim() === full_name.trim()) {
        // نفس الرقم + نفس الاسم → أرجع العميل الحالي
        return res.status(200).json({
          success: true,
          message: 'عميل موجود مسبقاً',
          data: found,
          existing: true
        });
      }
      // نفس الرقم + اسم مختلف → رفض
      throw new AppError(
        `رقم الجوال مسجّل باسم "${found.full_name}" — لا يمكن إنشاء عميل جديد بنفس الرقم`,
        409
      );
    }

    const { rows } = await query(
      `INSERT INTO customers (branch_id, full_name, phone, phone_alt, email, address, city, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.branch_id, full_name, phone, phone_alt, email, address, city, notes]
    );

    res.status(201).json({ success: true, message: 'تم إضافة العميل', data: rows[0] });
  } catch (err) { next(err); }
};

// PUT /api/customers/:id
const updateCustomer = async (req, res, next) => {
  try {
    const { full_name, phone, phone_alt, email, address, city, notes, is_vip } = req.body;
    const branchId = getBranchId(req);

    // branch isolation
    const { rows } = await query(
      `UPDATE customers SET
         full_name=$1, phone=$2, phone_alt=$3, email=$4,
         address=$5, city=$6, notes=$7, is_vip=$8
       WHERE id=$9
         AND ($10::uuid IS NULL OR branch_id = $10)
       RETURNING *`,
      [full_name, phone, phone_alt, email, address, city, notes, is_vip,
       req.params.id, branchId]
    );

    if (!rows.length) throw new AppError('العميل غير موجود', 404);
    res.json({ success: true, message: 'تم تحديث بيانات العميل', data: rows[0] });
  } catch (err) { next(err); }
};

module.exports = { getCustomers, getCustomerById, createCustomer, updateCustomer };
