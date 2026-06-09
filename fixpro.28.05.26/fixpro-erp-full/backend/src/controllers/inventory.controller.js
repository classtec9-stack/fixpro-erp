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
            cost_price, sell_price, supplier_id, location, notes, force_create } = req.body;

    if (!name || !sell_price) throw new AppError('اسم القطعة وسعر البيع مطلوبان');

    const initQty  = parseInt(quantity)    || 0;
    const initCost = parseFloat(cost_price) || 0;

    // D4: بحث عن أصناف مشابهة قبل الإنشاء (إلا إذا force_create = true)
    if (!force_create) {
      const { rows: similar } = await query(
        `SELECT id, name, quantity, sell_price
         FROM parts
         WHERE branch_id = $1
           AND is_active = true
           AND similarity(LOWER(TRIM(name)), LOWER(TRIM($2))) > 0.4
         ORDER BY similarity(LOWER(TRIM(name)), LOWER(TRIM($2))) DESC
         LIMIT 5`,
        [req.user.branch_id, name]
      ).catch(() => ({ rows: [] })); // pg_trgm قد لا يكون مفعّلاً بعد

      const exactMatch = similar.find(
        s => s.name.trim().toLowerCase() === name.trim().toLowerCase()
      );
      if (exactMatch) {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_PART',
          message: `الصنف "${exactMatch.name}" موجود مسبقاً (الكمية: ${exactMatch.quantity}). استخدم Restock لزيادة الكمية.`,
          data: { existing: exactMatch }
        });
      }
      if (similar.length > 0) {
        return res.status(200).json({
          success: false,
          code: 'SIMILAR_PARTS_FOUND',
          message: 'وُجدت أصناف مشابهة — هل تقصد أحدها؟',
          data: { suggestions: similar }
        });
      }
    }

    const { rows } = await query(
      `INSERT INTO parts
         (branch_id, name, sku, barcode, category, brand_compat, quantity, min_quantity,
          cost_price, sell_price, avg_cost, supplier_id, location, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`,
      [req.user.branch_id, name, sku, barcode, category, brand_compat,
       initQty, min_quantity || 5, initCost, sell_price,
       initCost,  // avg_cost = cost_price عند الإنشاء
       supplier_id, location, notes, req.user.id]
    );

    // سجل الكمية الابتدائية إذا كانت أكبر من صفر
    if (initQty > 0) {
      await query(
        `INSERT INTO inventory_movements
           (part_id, branch_id, movement_type, quantity, quantity_before, quantity_after,
            unit_cost, reference_type, notes, created_by)
         VALUES ($1,$2,'purchase',$3,0,$4,$5,'initial','كمية ابتدائية عند إنشاء القطعة',$6)`,
        [rows[0].id, req.user.branch_id, initQty, initQty, initCost, req.user.id]
      ).catch(() => {});
    }

    res.status(201).json({ success: true, message: 'تم إضافة القطعة', data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/inventory/parts/:id/restock — add stock
const restock = async (req, res, next) => {
  try {
    const { quantity, unit_cost, supplier_id, invoice_ref, notes } = req.body;
    if (!quantity || quantity < 1) throw new AppError('الكمية يجب أن تكون أكبر من صفر');
    if (!unit_cost || unit_cost < 0) throw new AppError('تكلفة الوحدة مطلوبة');

    // جلب الكمية والمتوسط الحالي لحساب avg_cost الجديد
    const { rows: current } = await query(
      'SELECT quantity, avg_cost, cost_price FROM parts WHERE id = $1',
      [req.params.id]
    );
    if (!current.length) throw new AppError('القطعة غير موجودة', 404);

    const oldQty     = current[0].quantity || 0;
    const oldAvg     = parseFloat(current[0].avg_cost) || parseFloat(current[0].cost_price) || 0;
    const newAvg     = oldQty === 0
      ? parseFloat(unit_cost)
      : ((oldQty * oldAvg) + (quantity * parseFloat(unit_cost))) / (oldQty + quantity);

    await query(
      `INSERT INTO part_purchases
         (part_id, supplier_id, branch_id, received_by, quantity, unit_cost, total_cost, invoice_ref, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.params.id, supplier_id, req.user.branch_id, req.user.id,
       quantity, unit_cost, quantity * unit_cost, invoice_ref, notes]
    );

    const { rows } = await query(
      `UPDATE parts SET
         quantity   = quantity + $1,
         avg_cost   = $2,
         updated_by = $3,
         updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [quantity, newAvg.toFixed(2), req.user.id, req.params.id]
    );

    // سجل حركة الشراء — كاملة
    await query(
      `INSERT INTO inventory_movements
         (part_id, branch_id, movement_type, quantity, quantity_before, quantity_after,
          unit_cost, reference_type, notes, created_by)
       VALUES ($1,$2,'purchase',$3,$4,$5,$6,'purchase',$7,$8)`,
      [req.params.id, req.user.branch_id,
       quantity, oldQty, oldQty + quantity,
       unit_cost,
       `شراء من مورد${invoice_ref ? ' — ' + invoice_ref : ''}`,
       req.user.id]
    ).catch(() => {});

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

// DELETE /api/inventory/parts/:id — soft delete مع حماية
const deletePart = async (req, res, next) => {
  try {
    // تحقق هل القطعة مستخدمة في تذاكر أو طلبات
    const { rows: inUse } = await query(
      `SELECT COUNT(*) as cnt FROM (
         SELECT id FROM order_parts WHERE part_id = $1
         UNION ALL
         SELECT id FROM part_requests WHERE part_id = $1 AND status = 'pending'
       ) t`,
      [req.params.id]
    );

    if (parseInt(inUse[0].cnt) > 0) {
      // القطعة مستخدمة — soft delete فقط
      const { rows } = await query(
        `UPDATE parts SET is_active = false, updated_at = NOW()
         WHERE id = $1 AND branch_id = $2 RETURNING name`,
        [req.params.id, req.user.branch_id]
      );
      if (!rows.length) throw new AppError('القطعة غير موجودة', 404);
      return res.json({
        success: true,
        message: `تم إخفاء "${rows[0].name}" — لا يمكن حذفها لأنها مستخدمة في تذاكر`
      });
    }

    // القطعة غير مستخدمة — حذف نهائي
    const { rows } = await query(
      'DELETE FROM parts WHERE id = $1 AND branch_id = $2 RETURNING name',
      [req.params.id, req.user.branch_id]
    );
    if (!rows.length) throw new AppError('القطعة غير موجودة', 404);
    res.json({ success: true, message: `تم حذف "${rows[0].name}" نهائياً` });
  } catch (err) { next(err); }
};

// PUT /api/inventory/parts/:id — تعديل بيانات القطعة
const updatePart = async (req, res, next) => {
  try {
    const { name, category, brand_compat, min_quantity,
            cost_price, sell_price, location, notes, supplier_id } = req.body;

    const { rows } = await query(
      `UPDATE parts SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         brand_compat = COALESCE($3, brand_compat),
         min_quantity = COALESCE($4, min_quantity),
         cost_price = COALESCE($5, cost_price),
         sell_price = COALESCE($6, sell_price),
         location = COALESCE($7, location),
         notes = COALESCE($8, notes),
         supplier_id = COALESCE($9, supplier_id),
         updated_at = NOW()
       WHERE id = $10 AND branch_id = $11
       RETURNING *`,
      [name, category, brand_compat, min_quantity,
       cost_price, sell_price, location, notes, supplier_id,
       req.params.id, req.user.branch_id]
    );
    if (!rows.length) throw new AppError('القطعة غير موجودة', 404);
    res.json({ success: true, message: 'تم تحديث بيانات القطعة', data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/inventory/movements — سجل حركة المخزون
const getMovements = async (req, res, next) => {
  try {
    const { part_id, movement_type, date_from, date_to, page = 1, limit = 50 } = req.query;
    const branchId = req.user.branch_id || null;
    const offset   = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params     = [];

    // عزل الفرع
    if (branchId) {
      params.push(branchId);
      conditions.push(`im.branch_id = $${params.length}`);
    }
    if (part_id) {
      params.push(part_id);
      conditions.push(`im.part_id = $${params.length}`);
    }
    if (movement_type) {
      params.push(movement_type);
      conditions.push(`im.movement_type = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`im.created_at >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`im.created_at <= $${params.length}::date + interval '1 day'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(parseInt(limit));
    params.push(offset);

    const { rows } = await query(
      `SELECT
         im.*,
         p.name  as part_name,
         p.sku   as part_sku,
         u.full_name as performed_by_name,
         b.name  as branch_name,
         o.order_number
       FROM inventory_movements im
       LEFT JOIN parts   p ON p.id = im.part_id
       LEFT JOIN users   u ON u.id = im.created_by
       LEFT JOIN branches b ON b.id = im.branch_id
       LEFT JOIN orders  o ON o.id = im.reference_id AND im.reference_type = 'order'
       ${where}
       ORDER BY im.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // العدد الكلي
    const countParams = params.slice(0, params.length - 2);
    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM inventory_movements im ${where}`,
      countParams
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(countRows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRows[0].count / limit)
      }
    });
  } catch (err) { next(err); }
};

// GET /api/inventory/parts/:id — تفاصيل قطعة واحدة
const getPartById = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id || null;

    // بيانات القطعة الكاملة
    const { rows } = await query(
      `SELECT p.*,
         s.name        as supplier_name,
         s.phone       as supplier_phone,
         cb.full_name  as created_by_name,
         ub.full_name  as updated_by_name,
         b.name        as branch_name
       FROM parts p
       LEFT JOIN suppliers  s  ON s.id = p.supplier_id
       LEFT JOIN users      cb ON cb.id = p.created_by
       LEFT JOIN users      ub ON ub.id = p.updated_by
       LEFT JOIN branches   b  ON b.id = p.branch_id
       WHERE p.id = $1
         AND ($2::uuid IS NULL OR p.branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('القطعة غير موجودة', 404);

    // إجماليات الحركات
    const { rows: stats } = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN movement_type = 'purchase' THEN quantity ELSE 0 END), 0) as total_purchased,
         COALESCE(SUM(CASE WHEN movement_type = 'issue'    THEN quantity ELSE 0 END), 0) as total_issued,
         COALESCE(SUM(CASE WHEN movement_type = 'return'   THEN quantity ELSE 0 END), 0) as total_returned,
         MAX(CASE WHEN movement_type = 'purchase' THEN created_at END)                   as last_purchase,
         MAX(CASE WHEN movement_type = 'issue'    THEN created_at END)                   as last_issue
       FROM inventory_movements
       WHERE part_id = $1`,
      [req.params.id]
    );

    // آخر 30 حركة للـ Timeline — مع JOIN كامل للتتبع
    const { rows: movements } = await query(
      `SELECT
         im.*,
         u.full_name          as performed_by_name,
         -- بيانات التذكرة والعميل والجهاز والفني
         o.order_number,
         o.status             as order_status,
         o.created_at         as order_created_at,
         c.full_name          as customer_name,
         c.phone              as customer_phone,
         d.brand              as device_brand,
         d.model              as device_model,
         d.device_type,
         tech.full_name       as technician_name,
         -- بيانات المورد (للشراء)
         s.name               as supplier_name
       FROM inventory_movements im
       LEFT JOIN users   u    ON u.id    = im.created_by
       LEFT JOIN orders  o    ON o.id    = im.reference_id AND im.reference_type = 'order'
       LEFT JOIN customers c  ON c.id    = o.customer_id
       LEFT JOIN devices d    ON d.id    = o.device_id
       LEFT JOIN users tech   ON tech.id = o.technician_id
       LEFT JOIN part_purchases pp ON pp.id = im.reference_id AND im.reference_type = 'purchase'
       LEFT JOIN suppliers s  ON s.id    = pp.supplier_id
       WHERE im.part_id = $1
       ORDER BY im.created_at DESC
       LIMIT 30`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        ...rows[0],
        ...stats[0],
        inventory_value: parseFloat(rows[0].quantity) * parseFloat(rows[0].avg_cost || rows[0].cost_price || 0),
        movements
      }
    });
  } catch (err) { next(err); }
};

// GET /api/inventory/parts/:id/audit — سجل التعديلات على القطعة
const getPartAuditLog = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT al.*, u.full_name as performed_by_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.performed_by
       WHERE al.entity_type = 'part' AND al.entity_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );

    // تحسين عرض اسم الحقل بالعربي
    const FIELD_LABELS = {
      name: 'اسم القطعة', sell_price: 'سعر البيع', cost_price: 'سعر الشراء',
      min_quantity: 'الحد الأدنى', supplier_id: 'المورد',
      is_active: 'الحالة', category: 'الفئة', avg_cost: 'متوسط التكلفة'
    };

    const enriched = rows.map(r => ({
      ...r,
      field_label: FIELD_LABELS[r.action?.replace('update_', '')] || r.action
    }));

    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};


// ── Features الجديدة ──────────────────────────────────────

// POST /api/inventory/scan — Barcode Scanner
const scanBarcode = async (req, res, next) => {
  try {
    const { barcode } = req.body;
    if (!barcode) throw new AppError('الباركود مطلوب');
    const branchId = req.user.branch_id;

    const { rows } = await query(
      `SELECT p.*, s.name as supplier_name, cat.name as category_name,
              loc.name as location_name
       FROM parts p
       LEFT JOIN suppliers        s   ON s.id   = p.supplier_id
       LEFT JOIN part_categories  cat ON cat.id  = p.category_id
       LEFT JOIN storage_locations loc ON loc.id = p.location_id
       WHERE (p.barcode = $1 OR p.sku = $1)
         AND p.branch_id = $2
         AND p.is_active = true`,
      [barcode.trim(), branchId]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: `لم يُعثر على قطعة بالباركود: ${barcode}` });

    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/inventory/categories — التصنيفات الهرمية
const getCategories = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id;
    const { rows } = await query(
      `SELECT c.*,
         p.name as parent_name,
         (SELECT COUNT(*) FROM parts WHERE category_id = c.id AND is_active = true) as parts_count
       FROM part_categories c
       LEFT JOIN part_categories p ON p.id = c.parent_id
       WHERE c.branch_id = $1 AND c.is_active = true
       ORDER BY c.parent_id NULLS FIRST, c.sort_order, c.name`,
      [branchId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/inventory/categories
const createCategory = async (req, res, next) => {
  try {
    const { name, parent_id, color, icon } = req.body;
    if (!name) throw new AppError('اسم التصنيف مطلوب');

    const { rows } = await query(
      `INSERT INTO part_categories (branch_id, name, parent_id, color, icon)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.branch_id, name, parent_id || null, color || '#3B82F6', icon || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/inventory/locations — مواضع التخزين
const getLocations = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT l.*,
         (SELECT COUNT(*) FROM parts WHERE location_id = l.id AND is_active = true) as parts_count
       FROM storage_locations l
       WHERE l.branch_id = $1 AND l.is_active = true
       ORDER BY l.name`,
      [req.user.branch_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/inventory/locations
const createLocation = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) throw new AppError('اسم الموضع مطلوب');
    const { rows } = await query(
      `INSERT INTO storage_locations (branch_id, name, description)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.user.branch_id, name, description || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/inventory/reorder-rules
const getReorderRules = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id;
    const { rows } = await query(
      `SELECT r.*, p.name as part_name, p.quantity as current_qty,
              p.sku, s.name as supplier_name
       FROM reorder_rules r
       JOIN parts p ON p.id = r.part_id
       LEFT JOIN suppliers s ON s.id = r.supplier_id
       WHERE r.branch_id = $1 AND r.is_active = true
       ORDER BY (p.quantity <= r.trigger_qty) DESC, p.name`,
      [branchId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/inventory/reorder-rules
const createReorderRule = async (req, res, next) => {
  try {
    const { part_id, supplier_id, trigger_qty, reorder_qty } = req.body;
    if (!part_id || !trigger_qty || !reorder_qty)
      throw new AppError('القطعة وكميات إعادة الطلب مطلوبة');

    const { rows } = await query(
      `INSERT INTO reorder_rules (part_id, branch_id, supplier_id, trigger_qty, reorder_qty)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (part_id, branch_id) DO UPDATE SET
         supplier_id = EXCLUDED.supplier_id,
         trigger_qty = EXCLUDED.trigger_qty,
         reorder_qty = EXCLUDED.reorder_qty,
         is_active   = true
       RETURNING *`,
      [part_id, req.user.branch_id, supplier_id || null, trigger_qty, reorder_qty]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/inventory/reorder-rules/check — فحص وإنشاء POs تلقائية
const checkReorderRules = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id;

    const { rows: triggered } = await query(
      `SELECT r.*, p.name as part_name, p.quantity, s.name as supplier_name
       FROM reorder_rules r
       JOIN parts p ON p.id = r.part_id AND p.branch_id = r.branch_id
       LEFT JOIN suppliers s ON s.id = r.supplier_id
       WHERE r.branch_id = $1 AND r.is_active = true
         AND p.quantity <= r.trigger_qty
         AND (r.last_triggered IS NULL OR r.last_triggered < NOW() - INTERVAL '24 hours')`,
      [branchId]
    );

    const suggestions = triggered.map(r => ({
      part_id:      r.part_id,
      part_name:    r.part_name,
      current_qty:  r.quantity,
      trigger_qty:  r.trigger_qty,
      reorder_qty:  r.reorder_qty,
      supplier_id:  r.supplier_id,
      supplier_name: r.supplier_name,
    }));

    // تحديث last_triggered
    if (triggered.length > 0) {
      await query(
        `UPDATE reorder_rules SET last_triggered = NOW()
         WHERE id = ANY($1::uuid[])`,
        [triggered.map(r => r.id)]
      );
    }

    res.json({
      success: true,
      message: `${suggestions.length} صنف يحتاج إعادة طلب`,
      data: suggestions
    });
  } catch (err) { next(err); }
};


module.exports = {
  getParts, createPart, restock, getLowStockAlerts,
  deletePart, updatePart, getMovements, getPartById, getPartAuditLog,
  scanBarcode, getCategories, createCategory,
  getLocations, createLocation,
  getReorderRules, createReorderRule, checkReorderRules
};
