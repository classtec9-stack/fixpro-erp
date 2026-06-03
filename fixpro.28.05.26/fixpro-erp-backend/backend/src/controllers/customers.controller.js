const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/customers
const getCustomers = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.branch_id];

    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      searchClause = `AND (c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
    }

    const count = await query(
      `SELECT COUNT(*) FROM customers c WHERE c.branch_id = $1 ${searchClause}`, params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT c.*,
         COUNT(DISTINCT o.id) as total_orders,
         MAX(o.received_at) as last_visit
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
       WHERE c.branch_id = $1 ${searchClause}
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
    const branchId = req.user.branch_id || null;

    // 1. تحقق من الفرع عند جلب العميل
    const { rows } = await query(
      `SELECT * FROM customers
       WHERE id = $1
         AND ($2::uuid IS NULL OR branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('العميل غير موجود', 404);

    // 2. تذاكر الفرع فقط
    const { rows: orders } = await query(
      `SELECT o.id, o.order_number, o.status, o.received_at,
              d.brand, d.model, i.total
       FROM orders o
       JOIN devices d ON d.id = o.device_id
       LEFT JOIN invoices i ON i.order_id = o.id
       WHERE o.customer_id = $1
         AND ($2::uuid IS NULL OR o.branch_id = $2)
       ORDER BY o.received_at DESC LIMIT 20`,
      [req.params.id, branchId]
    );

    // 3. أجهزة مرتبطة بتذاكر الفرع فقط
    const { rows: devices } = await query(
      `SELECT DISTINCT d.*
       FROM devices d
       JOIN orders o ON o.device_id = d.id
       WHERE d.customer_id = $1
         AND ($2::uuid IS NULL OR o.branch_id = $2)
       ORDER BY d.created_at DESC`,
      [req.params.id, branchId]
    );

    res.json({ success: true, data: { ...rows[0], orders, devices } });
  } catch (err) { next(err); }
};

// POST /api/customers
const createCustomer = async (req, res, next) => {
  try {
    const { full_name, phone, phone_alt, email, address, city, notes } = req.body;
    if (!full_name || !phone) throw new AppError('الاسم ورقم الجوال مطلوبان');

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
    const branchId = req.user.branch_id || null;

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
    if (!rows.length) throw new AppError('العميل غير موجود أو لا يخص فرعك', 404);
    res.json({ success: true, message: 'تم تحديث بيانات العميل', data: rows[0] });
  } catch (err) { next(err); }
};

module.exports = { getCustomers, getCustomerById, createCustomer, updateCustomer };
