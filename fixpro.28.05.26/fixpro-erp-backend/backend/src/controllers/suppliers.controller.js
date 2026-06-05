const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/suppliers
const getSuppliers = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id || null;
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const params = [];
    let where = 's.is_active = true';
    if (search) { params.push(`%${search}%`); where += ` AND (s.name ILIKE $${params.length} OR s.phone ILIKE $${params.length})`; }

    params.push(parseInt(limit), offset);

    const { rows } = await query(
      `SELECT s.*,
         u.full_name as created_by_name,
         COUNT(DISTINCT pp.id)          as total_orders,
         COALESCE(SUM(pp.total_cost),0) as total_purchased,
         MAX(pp.purchased_at)           as last_delivery,
         COUNT(DISTINCT pp.part_id)     as parts_count
       FROM suppliers s
       LEFT JOIN users u ON u.id = s.created_by
       LEFT JOIN part_purchases pp ON pp.supplier_id = s.id
       WHERE ${where}
       GROUP BY s.id, u.full_name
       ORDER BY s.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const { rows: cnt } = await query(
      `SELECT COUNT(*) FROM suppliers s WHERE ${where}`, countParams
    );

    res.json({ success: true, data: rows,
      pagination: { total: parseInt(cnt[0].count), page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (err) { next(err); }
};

// GET /api/suppliers/:id
const getSupplierById = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, u.full_name as created_by_name
       FROM suppliers s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!rows.length) throw new AppError('المورد غير موجود', 404);

    // آخر المشتريات مع هذا المورد
    const { rows: purchases } = await query(
      `SELECT pp.*, p.name as part_name, p.sku, u.full_name as received_by_name
       FROM part_purchases pp
       LEFT JOIN parts p ON p.id = pp.part_id
       LEFT JOIN users u ON u.id = pp.received_by
       WHERE pp.supplier_id = $1
       ORDER BY pp.purchased_at DESC LIMIT 20`,
      [req.params.id]
    );

    // القطع التي يوفرها
    const { rows: parts } = await query(
      `SELECT DISTINCT p.id, p.name, p.sku, p.quantity, p.avg_cost, p.sell_price
       FROM parts p
       WHERE p.supplier_id = $1 AND p.is_active = true
       ORDER BY p.name`,
      [req.params.id]
    );

    // إجماليات
    const { rows: stats } = await query(
      `SELECT
         COUNT(DISTINCT pp.id)          as total_orders,
         COALESCE(SUM(pp.total_cost),0) as total_purchased,
         MAX(pp.purchased_at)           as last_delivery,
         COUNT(DISTINCT pp.part_id)     as parts_supplied
       FROM part_purchases pp WHERE pp.supplier_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], ...stats[0], purchases, parts } });
  } catch (err) { next(err); }
};

// POST /api/suppliers
const createSupplier = async (req, res, next) => {
  try {
    const { name, contact_name, phone, email, address, payment_terms, tax_number, notes } = req.body;
    if (!name) throw new AppError('اسم المورد مطلوب');

    const { rows } = await query(
      `INSERT INTO suppliers
         (name, contact_name, phone, email, address, payment_terms, tax_number, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, contact_name, phone, email, address, payment_terms, tax_number, notes, req.user.id]
    );
    res.status(201).json({ success: true, message: 'تم إضافة المورد', data: rows[0] });
  } catch (err) { next(err); }
};

// PUT /api/suppliers/:id
const updateSupplier = async (req, res, next) => {
  try {
    const { name, contact_name, phone, email, address, payment_terms, tax_number, notes } = req.body;
    const { rows } = await query(
      `UPDATE suppliers SET
         name=$1, contact_name=$2, phone=$3, email=$4,
         address=$5, payment_terms=$6, tax_number=$7, notes=$8,
         updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, contact_name, phone, email, address, payment_terms, tax_number, notes, req.params.id]
    );
    if (!rows.length) throw new AppError('المورد غير موجود', 404);
    res.json({ success: true, message: 'تم تحديث المورد', data: rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/suppliers/:id — soft delete
const deleteSupplier = async (req, res, next) => {
  try {
    const { rows: inUse } = await query(
      'SELECT COUNT(*) as cnt FROM parts WHERE supplier_id=$1 AND is_active=true',
      [req.params.id]
    );
    if (parseInt(inUse[0].cnt) > 0)
      throw new AppError(`لا يمكن حذف المورد — مرتبط بـ ${inUse[0].cnt} قطعة نشطة`, 400);

    await query('UPDATE suppliers SET is_active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'تم تعطيل المورد' });
  } catch (err) { next(err); }
};

module.exports = { getSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier };
