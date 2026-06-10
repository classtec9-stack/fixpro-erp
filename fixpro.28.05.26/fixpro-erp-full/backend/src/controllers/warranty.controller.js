// backend/src/controllers/warranty.controller.js
const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// ── POST /api/warranty ────────────────────────────────────
const createWarrantyClaim = async (req, res, next) => {
  try {
    const {
      original_order_id, claim_type, notes,
      is_free = true, technician_fault = false,
      supplier_defect = false, same_technician = true,
      new_technician_id = null
    } = req.body;

    if (!original_order_id || !claim_type)
      throw new AppError('التذكرة الأصلية ونوع الضمان مطلوبان');

    const { rows: orig } = await query(
      `SELECT o.*,
              c.full_name as customer_name, c.phone as customer_phone,
              d.device_type, d.brand, d.model, d.color, d.imei,
              u.full_name as technician_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users     u ON u.id = o.technician_id
       WHERE o.id = $1`,
      [original_order_id]
    );
    if (!orig.length) throw new AppError('التذكرة الأصلية غير موجودة', 404);
    if (orig[0].status !== 'delivered')
      throw new AppError(`التذكرة يجب أن تكون مُسلَّمة — حالتها: ${orig[0].status}`);

    const o = orig[0];
    const techId = same_technician ? o.technician_id : (new_technician_id || null);
    const isInWarranty = o.warranty_expires_at
      ? new Date(o.warranty_expires_at) > new Date() : true;

    let resultOrder;

    if (is_free) {
      const problem = `[ضمان] ${
        claim_type === 'same_defect'      ? 'نفس المشكلة عادت' :
        claim_type === 'part_replacement' ? 'قطعة معيبة — استبدال' :
        claim_type === 'technician_fault' ? 'خطأ فني — إعادة إصلاح' :
                                            'إصلاح تحت الضمان'
      }${notes ? ': ' + notes : ''}`;

      await query(
        `UPDATE orders SET
           status            = 'new',
           problem_desc      = $1,
           technician_id     = $2,
           delivered_at      = NULL,
           ticket_category   = 'warranty',
           original_order_id = $3,
           updated_at        = NOW()
         WHERE id = $4`,
        [problem, techId, original_order_id, original_order_id]
      );

      await query(
        `INSERT INTO order_status_log (order_id, changed_by, old_status, new_status, note)
         VALUES ($1,$2,'delivered','new',$3)`,
        [original_order_id, req.user.id, `إعادة فتح بسبب ضمان — ${claim_type}`]
      ).catch(() => {});

      resultOrder = { ...o, status: 'new', id: original_order_id };

    } else {
      const { rows: newDev } = await query(
        `INSERT INTO devices (customer_id, device_type, brand, model, color, imei)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [o.customer_id, o.device_type, o.brand, o.model, o.color, o.imei]
      );

      const orderNum = `WRN-${Date.now().toString().slice(-6)}`;
      const problem  = `[صيانة مدفوعة] مرتبط بتذكرة ${o.order_number}${notes ? ': ' + notes : ''}`;

      const { rows: newOrder } = await query(
        `INSERT INTO orders
           (branch_id, customer_id, device_id, created_by, technician_id,
            order_number, problem_desc, status, ticket_category, original_order_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'new','repair',$8) RETURNING *`,
        [o.branch_id, o.customer_id, newDev[0].id,
         req.user.id, techId, orderNum, problem, original_order_id]
      );
      resultOrder = newOrder[0];
    }

    await query(
      `INSERT INTO warranty_claims
         (original_order_id, warranty_order_id, branch_id, claim_type,
          is_free, technician_fault, supplier_defect, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [original_order_id,
       is_free ? original_order_id : resultOrder.id,
       o.branch_id, claim_type, is_free,
       technician_fault, supplier_defect, notes || null, req.user.id]
    );

    res.status(201).json({
      success: true,
      message: is_free
        ? `تم إعادة فتح التذكرة ${o.order_number} تحت الضمان ✅`
        : `تم فتح تذكرة جديدة ${resultOrder.order_number} ✅`,
      data: { order: resultOrder, is_free, is_in_warranty: isInWarranty }
    });
  } catch (err) { next(err); }
};

// ── GET /api/warranty/check/:orderId ─────────────────────
const checkWarranty = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.warranty_days, o.warranty_expires_at,
              o.delivered_at, o.status, o.ticket_category,
              o.technician_id, o.original_order_id,
              u.full_name  as technician_name,
              c.full_name  as customer_name,
              c.phone      as customer_phone,
              d.brand, d.model, d.device_type,
              (SELECT COUNT(*) FROM warranty_claims wc
               WHERE wc.original_order_id = o.id) as warranty_count
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users     u ON u.id = o.technician_id
       WHERE o.id = $1`,
      [req.params.orderId]
    );
    if (!rows.length) throw new AppError('التذكرة غير موجودة', 404);

    const o = rows[0];
    const isInWarranty = o.warranty_expires_at
      ? new Date(o.warranty_expires_at) > new Date() : false;

    res.json({
      success: true,
      data: {
        ...o,
        is_in_warranty: isInWarranty,
        days_remaining: isInWarranty
          ? Math.ceil((new Date(o.warranty_expires_at) - new Date()) / 86400000)
          : 0
      }
    });
  } catch (err) { next(err); }
};

// ── GET /api/warranty ─────────────────────────────────────
const getWarrantyClaims = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id;
    const { page = 1, limit = 20, claim_type, is_free } = req.query;
    const offset = (page - 1) * limit;
    const params = [branchId];
    const conds  = ['wc.branch_id = $1'];

    if (claim_type) { params.push(claim_type); conds.push(`wc.claim_type = $${params.length}`); }
    if (is_free !== undefined && is_free !== '') {
      params.push(is_free === 'true');
      conds.push(`wc.is_free = $${params.length}`);
    }

    const where = `WHERE ${conds.join(' AND ')}`;
    const countRes = await query(
      `SELECT COUNT(*) FROM warranty_claims wc ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT wc.*,
              o.order_number  as original_order_number,
              wo.order_number as warranty_order_number,
              c.full_name     as customer_name,
              c.phone         as customer_phone,
              d.brand, d.model,
              u.full_name     as created_by_name
       FROM warranty_claims wc
       LEFT JOIN orders    o  ON o.id  = wc.original_order_id
       LEFT JOIN orders    wo ON wo.id = wc.warranty_order_id
       LEFT JOIN customers c  ON c.id  = o.customer_id
       LEFT JOIN devices   d  ON d.id  = o.device_id
       LEFT JOIN users     u  ON u.id  = wc.created_by
       ${where}
       ORDER BY wc.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(parseInt(countRes.rows[0].count) / limit)
      }
    });
  } catch (err) { next(err); }
};

// ── POST /api/warranty/return-part ───────────────────────
const returnWarrantyPart = async (req, res, next) => {
  try {
    const { order_id, part_id, quantity = 1, condition, reason } = req.body;
    if (!order_id || !part_id || !condition)
      throw new AppError('التذكرة والقطعة والحالة مطلوبة');

    // ── منع الإرجاع المتكرر لنفس القطعة من نفس التذكرة ──
    // فحص التوالف
    const { rows: existsDefective } = await query(
      `SELECT id FROM defective_parts
       WHERE part_id = $1 AND source_id = $2 AND source_type = 'warranty_ticket'
       LIMIT 1`,
      [part_id, order_id]
    );
    if (existsDefective.length)
      throw new AppError('هذه القطعة أُرجعت مسبقاً من هذه التذكرة — لا يمكن تكرار الإجراء');

    // فحص المخزون (عبر inventory_movements)
    const { rows: existsReturn } = await query(
      `SELECT id FROM inventory_movements
       WHERE part_id = $1 AND reference_type = 'warranty_return'
         AND notes LIKE '%' || $2 || '%'
       LIMIT 1`,
      [part_id, order_id]
    );
    if (existsReturn.length)
      throw new AppError('هذه القطعة أُعيدت للمخزون مسبقاً من هذه التذكرة — لا يمكن تكرار الإجراء');

    if (condition === 'good') {
      const { rows: part } = await query(
        'SELECT id, quantity, branch_id FROM parts WHERE id = $1', [part_id]
      );
      if (!part.length) throw new AppError('القطعة غير موجودة');
      const qtyBefore = parseInt(part[0].quantity || 0);

      await query(
        'UPDATE parts SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
        [quantity, part_id]
      );

      await query(
        `INSERT INTO inventory_movements
           (part_id, branch_id, movement_type, quantity, quantity_before, quantity_after,
            reference_type, notes, created_by)
         VALUES ($1,$2,'return',$3,$4,$5,'warranty_return','إرجاع قطعة ضمان سليمة — تذكرة: ' || $6,$7)`,
        [part_id, part[0].branch_id, quantity,
         qtyBefore, qtyBefore + quantity, order_id, req.user.id]
      );

      res.json({
        success: true,
        message: 'تم إعادة القطعة للمخزون ✅',
        action: 'returned_to_stock'
      });

    } else {
      await query(
        `INSERT INTO defective_parts
           (part_id, branch_id, quantity, source_type, source_id, reason, created_by)
         VALUES ($1,$2,$3,'warranty_ticket',$4,$5,$6)`,
        [part_id, req.user.branch_id, quantity, order_id,
         reason || 'قطعة مُرجَعة من عميل ضمان', req.user.id]
      );

      res.json({
        success: true,
        message: 'تم إرسال القطعة للتوالف ⚠️',
        action: 'sent_to_defective'
      });
    }
  } catch (err) { next(err); }
};


// ── GET /api/warranty/return-status/:orderId ─────────────
// هل اتُخذ إجراء إرجاع على قطع هذه التذكرة؟ ومن نفّذه؟
const getReturnStatus = async (req, res, next) => {
  try {
    const orderId = req.params.orderId;

    // فحص التوالف
    const { rows: defectiveRows } = await query(
      `SELECT dp.part_id, dp.quantity, dp.created_at,
              u.full_name as action_by_name,
              p.name as part_name
       FROM defective_parts dp
       LEFT JOIN users u ON u.id = dp.created_by
       LEFT JOIN parts p ON p.id = dp.part_id
       WHERE dp.source_id = $1 AND dp.source_type = 'warranty_ticket'`,
      [orderId]
    );

    // فحص الإرجاع للمخزون
    const { rows: returnRows } = await query(
      `SELECT im.part_id, im.quantity, im.created_at,
              u.full_name as action_by_name,
              p.name as part_name
       FROM inventory_movements im
       LEFT JOIN users u ON u.id = im.created_by
       LEFT JOIN parts p ON p.id = im.part_id
       WHERE im.reference_type = 'warranty_return'
         AND im.notes LIKE '%' || $1 || '%'`,
      [orderId]
    );

    const actions = [
      ...defectiveRows.map(r => ({ ...r, action: 'defective',  action_label: 'أُرسلت للتوالف' })),
      ...returnRows.map(r =>   ({ ...r, action: 'stock',      action_label: 'أُعيدت للمخزون' })),
    ];

    res.json({
      success: true,
      data: {
        action_taken: actions.length > 0,
        actions
      }
    });
  } catch (err) { next(err); }
};

module.exports = {
  createWarrantyClaim,
  checkWarranty,
  getWarrantyClaims,
  returnWarrantyPart,
  getReturnStatus
};
