const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// POST /api/warranty
const createWarrantyClaim = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { original_order_id, claim_type, notes, is_free = true,
            technician_fault = false, supplier_defect = false,
            same_technician = true, new_technician_id = null } = req.body;

    if (!original_order_id || !claim_type) throw new AppError('البيانات الأساسية مطلوبة');

    // جلب التذكرة الأصلية
    const { rows: orig } = await client.query(
      `SELECT o.*, c.full_name as customer_name, c.phone as customer_phone,
              d.device_type, d.brand, d.model, d.color, d.imei,
              u.full_name as technician_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN devices d   ON d.id = o.device_id
       LEFT JOIN users u     ON u.id = o.technician_id
       WHERE o.id = $1`,
      [original_order_id]
    );
    if (!orig.length) throw new AppError('التذكرة الأصلية غير موجودة', 404);
    if (orig[0].status !== 'delivered')
      throw new AppError(`حالة التذكرة: ${orig[0].status} — يجب أن تكون delivered`, 400);

    const o = orig[0];
    const techId = same_technician ? o.technician_id : (new_technician_id || null);
    const warrantyExpires = o.warranty_expires_at;
    const isInWarranty = !warrantyExpires || new Date(warrantyExpires) > new Date();

    let resultOrder;

    if (is_free) {
      // ── إصلاح مجاني: أعد فتح نفس التذكرة ──────────────
      const problem = `[ضمان] ${
        claim_type === 'same_defect'      ? 'نفس المشكلة عادت' :
        claim_type === 'part_replacement' ? 'قطعة معيبة - استبدال' :
        claim_type === 'technician_fault' ? 'خطأ فني - إعادة إصلاح' :
                                            'إصلاح تحت الضمان'
      }${notes ? ': ' + notes : ''}`;

      await client.query(
        `UPDATE orders SET
           status = 'new',
           problem_desc = $1,
           technician_id = $2,
           delivered_at = NULL,
           ticket_category = 'warranty',
           original_order_id = $3,
           updated_at = NOW()
         WHERE id = $4`,
        [problem, techId, original_order_id, original_order_id]
      );

      // سجل في status log
      await client.query(
        `INSERT INTO order_status_log (order_id, changed_by, old_status, new_status, note)
         VALUES ($1, $2, 'delivered', 'new', $3)`,
        [original_order_id, req.user.id, `إعادة فتح بسبب ضمان — ${claim_type}`]
      ).catch(() => {});

      resultOrder = { ...o, status: 'new', id: original_order_id };
    } else {
      // ── إصلاح مدفوع: تذكرة جديدة ──────────────────────
      const { rows: newDev } = await client.query(
        `INSERT INTO devices (customer_id, device_type, brand, model, color, imei)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [o.customer_id, o.device_type, o.brand, o.model, o.color, o.imei]
      );

      const orderNum = `WRN-${Date.now().toString().slice(-6)}`;
      const problem  = `[صيانة مدفوعة] مرتبط بـ ${o.order_number}${notes ? ': ' + notes : ''}`;

      const { rows: newOrder } = await client.query(
        `INSERT INTO orders
           (branch_id, customer_id, device_id, created_by, technician_id,
            order_number, problem_desc, status, ticket_category, original_order_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'new','repair',$8) RETURNING *`,
        [o.branch_id, o.customer_id, newDev[0].id, req.user.id, techId,
         orderNum, problem, original_order_id]
      );
      resultOrder = newOrder[0];
    }

    // سجل في warranty_claims
    await client.query(
      `INSERT INTO warranty_claims
         (original_order_id, warranty_order_id, branch_id, claim_type,
          is_free, technician_fault, supplier_defect, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [original_order_id,
       is_free ? original_order_id : resultOrder.id,
       o.branch_id, claim_type, is_free,
       technician_fault, supplier_defect, notes, req.user.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: is_free
        ? `تم إعادة فتح التذكرة ${o.order_number} تحت الضمان`
        : `تم فتح تذكرة جديدة ${resultOrder.order_number}`,
      data: { order: resultOrder, is_free, is_in_warranty: isInWarranty }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// GET /api/warranty/check/:orderId
const checkWarranty = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.warranty_days, o.warranty_expires_at,
              o.delivered_at, o.status, o.ticket_category,
              o.technician_id,
              u.full_name as technician_name,
              c.full_name as customer_name,
              d.brand, d.model,
              (SELECT COUNT(*) FROM warranty_claims wc WHERE wc.original_order_id = o.id) as warranty_count
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN devices d   ON d.id = o.device_id
       LEFT JOIN users u     ON u.id = o.technician_id
       WHERE o.id = $1`,
      [req.params.orderId]
    );
    if (!rows.length) throw new AppError('التذكرة غير موجودة', 404);

    const o = rows[0];
    const isInWarranty = o.warranty_expires_at && new Date(o.warranty_expires_at) > new Date();

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

module.exports = { createWarrantyClaim, checkWarranty };
