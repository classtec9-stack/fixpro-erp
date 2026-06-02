const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

const DEVICE_TYPES = ['smartphone','laptop','tablet','desktop','watch','other'];

// GET /api/service-prices
const getServicePrices = async (req, res, next) => {
  try {
    const { device_type, brand, active_only = 'true' } = req.query;
    const params = [req.user.branch_id];
    const conds  = ['branch_id = $1'];

    if (active_only === 'true') conds.push('is_active = true');
    if (device_type) { params.push(device_type); conds.push(`device_type = $${params.length}`); }
    if (brand) {
      params.push(brand);
      conds.push(`(device_brand = $${params.length} OR device_brand = 'ALL')`);
    }

    const { rows } = await query(
      `SELECT * FROM service_prices
       WHERE ${conds.join(' AND ')}
       ORDER BY device_type, device_brand, service_name`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/service-prices
const createServicePrice = async (req, res, next) => {
  try {
    const {
      device_type, device_brand = 'ALL',
      service_name, description,
      base_price, min_price, max_price, warranty_days = 30
    } = req.body;

    if (!service_name) throw new AppError('اسم الخدمة مطلوب');
    if (!base_price || base_price <= 0) throw new AppError('السعر يجب أن يكون أكبر من صفر');

    const { rows } = await query(
      `INSERT INTO service_prices
         (branch_id, device_type, device_brand, service_name, description,
          base_price, min_price, max_price, warranty_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.branch_id, device_type || 'ALL', device_brand,
       service_name, description || null,
       base_price, min_price || null, max_price || null, warranty_days]
    );
    res.status(201).json({ success: true, message: 'تم إضافة الخدمة', data: rows[0] });
  } catch (err) { next(err); }
};

// PUT /api/service-prices/:id
const updateServicePrice = async (req, res, next) => {
  try {
    const {
      service_name, description, base_price,
      min_price, max_price, warranty_days, is_active, device_type, device_brand
    } = req.body;

    const { rows } = await query(
      `UPDATE service_prices SET
         service_name = COALESCE($1, service_name),
         description  = COALESCE($2, description),
         base_price   = COALESCE($3, base_price),
         min_price    = $4, max_price = $5,
         warranty_days = COALESCE($6, warranty_days),
         is_active    = COALESCE($7, is_active),
         device_type  = COALESCE($8, device_type),
         device_brand = COALESCE($9, device_brand)
       WHERE id = $10 AND branch_id = $11 RETURNING *`,
      [service_name, description, base_price, min_price || null, max_price || null,
       warranty_days, is_active, device_type, device_brand,
       req.params.id, req.user.branch_id]
    );
    if (!rows.length) throw new AppError('الخدمة غير موجودة', 404);
    res.json({ success: true, message: 'تم التحديث', data: rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/service-prices/:id  → soft delete
const deleteServicePrice = async (req, res, next) => {
  try {
    await query(
      'UPDATE service_prices SET is_active=false WHERE id=$1 AND branch_id=$2',
      [req.params.id, req.user.branch_id]
    );
    res.json({ success: true, message: 'تم تعطيل الخدمة' });
  } catch (err) { next(err); }
};

module.exports = { getServicePrices, createServicePrice, updateServicePrice, deleteServicePrice };
