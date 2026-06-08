const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/inventory/parts
const getParts = async (req, res, next) => {
  try {
    const { search, category, low_stock, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.branch_id];
    const conditions = ['p.branch_id = $1'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`);
    }
    if (category) { params.push(category); conditions.push(`p.category = $${params.length}`); }
    if (low_stock === 'true') conditions.push('p.quantity <= p.min_quantity');

    const where = `WHERE ${conditions.join(' AND ')}`;
    const count = await query(`SELECT COUNT(*) FROM parts p ${where}`, params);

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT p.*, s.name as supplier_name
       FROM parts p LEFT JOIN suppliers s ON s.id = p.supplier_id
       ${where}
       ORDER BY p.quantity <= p.min_quantity DESC, p.name ASC
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

// POST /api/inventory/parts
const createPart = async (req, res, next) => {
  try {
    const { name, sku, barcode, category, brand_compat, quantity, min_quantity,
            cost_price, sell_price, supplier_id, location, notes } = req.body;

    if (!name || !sell_price) throw new AppError('اسم القطعة وسعر البيع مطلوبان');

    const { rows } = await query(
      `INSERT INTO parts
         (branch_id, name, sku, barcode, category, brand_compat, quantity, min_quantity,
          cost_price, sell_price, supplier_id, location, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.branch_id, name, sku, barcode, category, brand_compat,
       quantity || 0, min_quantity || 5, cost_price || 0, sell_price,
       supplier_id, location, notes]
    );

    res.status(201).json({ success: true, message: 'تم إضافة القطعة', data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/inventory/parts/:id/restock — add stock
const restock = async (req, res, next) => {
  try {
    const { quantity, unit_cost, supplier_id, invoice_ref, notes } = req.body;
    if (!quantity || quantity < 1) throw new AppError('الكمية يجب أن تكون أكبر من صفر');

    await query(
      `INSERT INTO part_purchases
         (part_id, supplier_id, branch_id, received_by, quantity, unit_cost, total_cost, invoice_ref, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.params.id, supplier_id, req.user.branch_id, req.user.id,
       quantity, unit_cost, quantity * unit_cost, invoice_ref, notes]
    );

    const { rows } = await query(
      'UPDATE parts SET quantity = quantity + $1 WHERE id = $2 RETURNING *',
      [quantity, req.params.id]
    );

    if (!rows.length) throw new AppError('القطعة غير موجودة', 404);
    res.json({ success: true, message: `تم إضافة ${quantity} وحدة للمخزون`, data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/inventory/alerts — low stock items
const getLowStockAlerts = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, s.name as supplier_name, s.phone as supplier_phone
       FROM parts p LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.branch_id = $1 AND p.quantity <= p.min_quantity AND p.is_active = true
       ORDER BY p.quantity ASC`,
      [req.user.branch_id]
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) { next(err); }
};

module.exports = { getParts, createPart, restock, getLowStockAlerts };
