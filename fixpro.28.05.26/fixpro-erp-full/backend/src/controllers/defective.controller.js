const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/defective — قائمة القطع التالفة
const getDefectiveParts = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id || null;
    const { status = 'waiting' } = req.query;
    const { rows } = await query(
      `SELECT dp.*,
         p.name as part_name, p.sku,
         s.name as supplier_name, s.phone as supplier_phone,
         u.full_name as created_by_name,
         o.order_number as ticket_number
       FROM defective_parts dp
       LEFT JOIN parts    p ON p.id = dp.part_id
       LEFT JOIN suppliers s ON s.id = dp.supplier_id
       LEFT JOIN users    u ON u.id = dp.created_by
       LEFT JOIN orders   o ON o.id = dp.source_id AND dp.source_type = 'warranty_ticket'
       WHERE ($1::uuid IS NULL OR dp.branch_id = $1)
         AND dp.status = $2
       ORDER BY dp.created_at DESC`,
      [branchId, status]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/defective — إضافة قطعة تالفة
const addDefectivePart = async (req, res, next) => {
  try {
    const { part_id, quantity = 1, source_type, source_id, reason } = req.body;
    if (!part_id || !source_type) throw new AppError('القطعة والمصدر مطلوبان');

    // جلب supplier_id من آخر شراء للقطعة
    const { rows: purchase } = await query(
      `SELECT pp.supplier_id FROM part_purchases pp
       WHERE pp.part_id = $1 AND pp.branch_id = $2
       ORDER BY pp.purchased_at DESC LIMIT 1`,
      [part_id, req.user.branch_id]
    );

    const { rows } = await query(
      `INSERT INTO defective_parts
         (part_id, branch_id, supplier_id, quantity, source_type, source_id, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [part_id, req.user.branch_id,
       purchase[0]?.supplier_id || null,
       quantity, source_type, source_id || null, reason, req.user.id]
    );

    // سجل حركة خروج من المخزون إذا من المخزون مباشرة
    if (source_type === 'stock') {
      const { rows: part } = await query(
        'SELECT quantity, avg_cost, cost_price FROM parts WHERE id=$1', [part_id]
      );
      const qtyBefore = part[0]?.quantity || 0;
      await query(
        `INSERT INTO inventory_movements
           (part_id, branch_id, movement_type, quantity, quantity_before, quantity_after,
            unit_cost, reference_type, notes, created_by)
         VALUES ($1,$2,'adjustment_sub',$3,$4,$5,$6,'adjustment','نقل لمنطقة التوالف',$7)`,
        [part_id, req.user.branch_id, quantity, qtyBefore, qtyBefore - quantity,
         parseFloat(part[0]?.avg_cost) || parseFloat(part[0]?.cost_price) || 0,
         req.user.id]
      ).catch(() => {});

      await query(
        'UPDATE parts SET quantity = quantity - $1, updated_by=$2, updated_at=NOW() WHERE id=$3',
        [quantity, req.user.id, part_id]
      );
    }

    res.status(201).json({ success: true, message: 'تم إضافة القطعة لمنطقة التوالف', data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/defective/return — إنشاء طلب إرجاع للمورد
const createSupplierReturn = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { supplier_id, defective_ids, notes } = req.body;
    if (!supplier_id || !defective_ids?.length) throw new AppError('المورد والقطع مطلوبة');

    const returnNum = `SRN-${Date.now().toString().slice(-6)}`;

    // إنشاء طلب الإرجاع
    const { rows: ret } = await client.query(
      `INSERT INTO supplier_returns (branch_id, supplier_id, return_number, notes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.branch_id, supplier_id, returnNum, notes, req.user.id]
    );

    // إضافة البنود
    for (const defId of defective_ids) {
      const { rows: def } = await client.query(
        'SELECT * FROM defective_parts WHERE id=$1 AND status=$2',
        [defId, 'waiting']
      );
      if (!def.length) continue;

      await client.query(
        `INSERT INTO supplier_return_items
           (return_id, defective_part_id, part_id, quantity_sent)
         VALUES ($1,$2,$3,$4)`,
        [ret[0].id, defId, def[0].part_id, def[0].quantity]
      );

      await client.query(
        "UPDATE defective_parts SET status='sent_to_supplier' WHERE id=$1",
        [defId]
      );
    }

    await client.query(
      "UPDATE supplier_returns SET status='sent' WHERE id=$1",
      [ret[0].id]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: `تم إرسال طلب إرجاع ${returnNum}`, data: ret[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// GET /api/defective/returns — قائمة طلبات الإرجاع
const getSupplierReturns = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id || null;
    const { rows } = await query(
      `SELECT sr.*,
         s.name as supplier_name, s.phone as supplier_phone,
         u.full_name as created_by_name,
         COUNT(sri.id) as items_count
       FROM supplier_returns sr
       LEFT JOIN suppliers s ON s.id = sr.supplier_id
       LEFT JOIN users     u ON u.id = sr.created_by
       LEFT JOIN supplier_return_items sri ON sri.return_id = sr.id
       WHERE ($1::uuid IS NULL OR sr.branch_id = $1)
       GROUP BY sr.id, s.name, s.phone, u.full_name
       ORDER BY sr.created_at DESC`,
      [branchId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// GET /api/defective/returns/:id — تفاصيل طلب إرجاع
const getSupplierReturnById = async (req, res, next) => {
  try {
    const { rows: ret } = await query(
      `SELECT sr.*, s.name as supplier_name, s.phone as supplier_phone
       FROM supplier_returns sr
       LEFT JOIN suppliers s ON s.id = sr.supplier_id
       WHERE sr.id = $1`,
      [req.params.id]
    );
    if (!ret.length) throw new AppError('طلب الإرجاع غير موجود', 404);

    const { rows: items } = await query(
      `SELECT sri.*, p.name as part_name, p.sku,
              dp.reason as defect_reason, dp.source_type
       FROM supplier_return_items sri
       LEFT JOIN parts p ON p.id = sri.part_id
       LEFT JOIN defective_parts dp ON dp.id = sri.defective_part_id
       WHERE sri.return_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...ret[0], items } });
  } catch (err) { next(err); }
};

// POST /api/defective/returns/:id/resolve — استلام رد المورد
const resolveSupplierReturn = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { items } = req.body;
    // items: [{ item_id, quantity_replaced, quantity_rejected, notes }]

    for (const item of items) {
      const { rows: sri } = await client.query(
        'SELECT * FROM supplier_return_items WHERE id=$1', [item.item_id]
      );
      if (!sri.length) continue;

      const replaced = parseInt(item.quantity_replaced) || 0;
      const rejected = parseInt(item.quantity_rejected) || 0;
      const resolution = replaced > 0 && rejected > 0 ? 'partial' :
                         replaced > 0 ? 'replaced' :
                         rejected > 0 ? 'rejected' : 'pending';

      // تحديث البند
      await client.query(
        `UPDATE supplier_return_items
         SET quantity_replaced=$1, quantity_rejected=$2, resolution=$3, notes=$4
         WHERE id=$5`,
        [replaced, rejected, resolution, item.notes || null, item.item_id]
      );

      // القطع المستبدلة → تدخل المخزون
      if (replaced > 0) {
        const { rows: part } = await client.query(
          'SELECT quantity, avg_cost, cost_price, branch_id FROM parts WHERE id=$1',
          [sri[0].part_id]
        );
        const qtyBefore = part[0]?.quantity || 0;
        await client.query(
          'UPDATE parts SET quantity=quantity+$1, updated_by=$2, updated_at=NOW() WHERE id=$3',
          [replaced, req.user.id, sri[0].part_id]
        );
        await client.query(
          `INSERT INTO inventory_movements
             (part_id, branch_id, movement_type, quantity, quantity_before, quantity_after,
              unit_cost, reference_type, notes, created_by)
           VALUES ($1,$2,'purchase',$3,$4,$5,$6,'purchase','استبدال ضمان من مورد',$7)`,
          [sri[0].part_id, part[0]?.branch_id, replaced, qtyBefore, qtyBefore + replaced,
           parseFloat(part[0]?.avg_cost) || parseFloat(part[0]?.cost_price) || 0,
           req.user.id]
        ).catch(() => {});
        await client.query(
          "UPDATE defective_parts SET status='returned' WHERE id=$1",
          [sri[0].defective_part_id]
        );
      }

      // القطع المرفوضة → تنتظر الشطب
      if (rejected > 0) {
        await client.query(
          `UPDATE defective_parts SET status='waiting', reason=CONCAT(reason, ' — رفضها المورد')
           WHERE id=$1`,
          [sri[0].defective_part_id]
        );
      }
    }

    // أغلق طلب الإرجاع
    await client.query(
      "UPDATE supplier_returns SET status='resolved', approved_by=$1, resolved_at=NOW() WHERE id=$2",
      [req.user.id, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'تم تسجيل رد المورد' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// POST /api/defective/:id/writeoff — شطب قطعة تالفة
const writeOffPart = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { reason } = req.body;
    const { rows: def } = await client.query(
      'SELECT * FROM defective_parts WHERE id=$1 AND status=$2',
      [req.params.id, 'waiting']
    );
    if (!def.length) throw new AppError('القطعة غير موجودة أو ليست في انتظار الشطب', 404);

    await client.query(
      "UPDATE defective_parts SET status='written_off' WHERE id=$1",
      [req.params.id]
    );

    // سجل في audit_log
    await query(
      `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
       VALUES ('part', $1, 'write_off',
         $2::jsonb, $3::jsonb, $4)`,
      [def[0].part_id,
       JSON.stringify({ status: 'waiting', quantity: def[0].quantity }),
       JSON.stringify({ status: 'written_off', reason: reason || 'شطب بموافقة المدير' }),
       req.user.id]
    ).catch(() => {});

    await client.query('COMMIT');
    res.json({ success: true, message: 'تم شطب القطعة من النظام' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

module.exports = {
  getDefectiveParts, addDefectivePart,
  createSupplierReturn, getSupplierReturns, getSupplierReturnById,
  resolveSupplierReturn, writeOffPart
};
