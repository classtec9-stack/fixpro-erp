const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id']
    ? null : req.user.branch_id;

// GET /api/defective
const getDefectiveParts = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { status = 'waiting', supplier_id } = req.query;
    const params = [status];
    const conds  = ['dp.status = $1'];

    if (branchId)    { params.push(branchId);    conds.push(`dp.branch_id = $${params.length}`); }
    if (supplier_id) { params.push(supplier_id); conds.push(`dp.supplier_id = $${params.length}`); }

    const { rows } = await query(
      `SELECT dp.*,
         p.name   as part_name, p.sku, p.barcode,
         p.supplier_id as part_default_supplier,
         s.name   as supplier_name, s.phone as supplier_phone,
         u.full_name as created_by_name,
         o.order_number as ticket_number
       FROM defective_parts dp
       LEFT JOIN parts     p ON p.id   = dp.part_id
       LEFT JOIN suppliers s ON s.id   = dp.supplier_id
       LEFT JOIN users     u ON u.id   = dp.created_by
       LEFT JOIN orders    o ON o.id   = dp.source_id AND dp.source_type = 'warranty_ticket'
       WHERE ${conds.join(' AND ')}
       ORDER BY dp.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) { next(err); }
};

// POST /api/defective
const addDefectivePart = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { part_id, quantity = 1, source_type, source_id, reason, supplier_id } = req.body;
    if (!part_id || !source_type) throw new AppError('القطعة والمصدر مطلوبان');

    // البحث عن المورد: يدوي أولاً، ثم من جدول parts مباشرة
    let resolvedSupplierId = supplier_id || null;
    if (!resolvedSupplierId) {
      const { rows: partRows } = await client.query(
        'SELECT supplier_id FROM parts WHERE id = $1',
        [part_id]
      );
      resolvedSupplierId = partRows[0]?.supplier_id || null;
    }

    const { rows } = await client.query(
      `INSERT INTO defective_parts
         (part_id, branch_id, supplier_id, quantity, source_type, source_id, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [part_id, req.user.branch_id, resolvedSupplierId,
       quantity, source_type, source_id || null, reason || null, req.user.id]
    );

    // خصم من المخزون إذا المصدر stock
    if (source_type === 'stock') {
      const { rows: partRows } = await client.query(
        'SELECT quantity, avg_cost, cost_price FROM parts WHERE id=$1 FOR UPDATE',
        [part_id]
      );
      const qtyBefore = parseInt(partRows[0]?.quantity || 0);
      if (qtyBefore < quantity)
        throw new AppError(`الكمية المتاحة ${qtyBefore} فقط`);

      await client.query(
        'UPDATE parts SET quantity = quantity - $1, updated_by=$2, updated_at=NOW() WHERE id=$3',
        [quantity, req.user.id, part_id]
      );

      await client.query(
        `INSERT INTO inventory_movements
           (part_id, branch_id, movement_type, quantity, quantity_before, quantity_after,
            unit_cost, reference_type, notes, created_by)
         VALUES ($1,$2,'adjustment_sub',$3,$4,$5,$6,'adjustment','نقل لمنطقة التوالف',$7)`,
        [part_id, req.user.branch_id, quantity, qtyBefore, qtyBefore - quantity,
         parseFloat(partRows[0]?.avg_cost) || parseFloat(partRows[0]?.cost_price) || 0,
         req.user.id]
      ).catch(() => {});
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'تم إضافة القطعة لمنطقة التوالف', data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// POST /api/defective/returns — إنشاء طلب إرجاع لمورد واحد
const createSupplierReturn = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { supplier_id, defective_ids, notes } = req.body;
    if (!supplier_id || !defective_ids?.length)
      throw new AppError('المورد وقائمة القطع مطلوبان');

    // التحقق أن كل القطع من نفس المورد
    const { rows: defRows } = await client.query(
      `SELECT id, part_id, quantity, supplier_id
       FROM defective_parts
       WHERE id = ANY($1::uuid[]) AND status = 'waiting'`,
      [defective_ids]
    );
    if (!defRows.length) throw new AppError('لا توجد قطع صالحة للإرجاع');

    const wrongSupplier = defRows.filter(d => d.supplier_id && d.supplier_id !== supplier_id);
    if (wrongSupplier.length)
      throw new AppError('بعض القطع تنتمي لموردين مختلفين — أنشئ طلب منفصل لكل مورد');

    const returnNum = `SRN-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

    const { rows: ret } = await client.query(
      `INSERT INTO supplier_returns (branch_id, supplier_id, return_number, status, notes, created_by)
       VALUES ($1,$2,$3,'sent',$4,$5) RETURNING *`,
      [req.user.branch_id, supplier_id, returnNum, notes || null, req.user.id]
    );

    for (const def of defRows) {
      await client.query(
        `INSERT INTO supplier_return_items (return_id, defective_part_id, part_id, quantity_sent)
         VALUES ($1,$2,$3,$4)`,
        [ret[0].id, def.id, def.part_id, def.quantity]
      );
      await client.query(
        "UPDATE defective_parts SET status='sent_to_supplier' WHERE id=$1",
        [def.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: `تم إرسال طلب الإرجاع ${returnNum}`,
      data: ret[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// GET /api/defective/returns
const getSupplierReturns = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { status } = req.query;
    const params = [];
    const conds = [];

    if (branchId) { params.push(branchId); conds.push(`sr.branch_id = $${params.length}`); }
    if (status)   { params.push(status);   conds.push(`sr.status = $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT sr.*,
         s.name   as supplier_name, s.phone as supplier_phone,
         u.full_name as created_by_name,
         COUNT(sri.id) as items_count
       FROM supplier_returns sr
       LEFT JOIN suppliers           s   ON s.id  = sr.supplier_id
       LEFT JOIN users               u   ON u.id  = sr.created_by
       LEFT JOIN supplier_return_items sri ON sri.return_id = sr.id
       ${where}
       GROUP BY sr.id, s.name, s.phone, u.full_name
       ORDER BY sr.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// GET /api/defective/returns/:id
const getSupplierReturnById = async (req, res, next) => {
  try {
    const { rows: ret } = await query(
      `SELECT sr.*, s.name as supplier_name, s.phone as supplier_phone, s.email as supplier_email
       FROM supplier_returns sr
       LEFT JOIN suppliers s ON s.id = sr.supplier_id
       WHERE sr.id = $1`,
      [req.params.id]
    );
    if (!ret.length) throw new AppError('طلب الإرجاع غير موجود', 404);

    const { rows: items } = await query(
      `SELECT sri.*,
         p.name as part_name, p.sku,
         dp.reason as defect_reason, dp.source_type, dp.quantity as defective_qty
       FROM supplier_return_items sri
       LEFT JOIN parts           p  ON p.id  = sri.part_id
       LEFT JOIN defective_parts dp ON dp.id = sri.defective_part_id
       WHERE sri.return_id = $1
       ORDER BY sri.created_at`,
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

    if (!items?.length) throw new AppError('بنود الحل مطلوبة');

    const { rows: ret } = await client.query(
      'SELECT * FROM supplier_returns WHERE id=$1 FOR UPDATE',
      [req.params.id]
    );
    if (!ret.length) throw new AppError('طلب الإرجاع غير موجود', 404);
    if (ret[0].status === 'resolved')
      throw new AppError('هذا الطلب محلول مسبقاً');

    for (const item of items) {
      const { rows: sri } = await client.query(
        'SELECT * FROM supplier_return_items WHERE id=$1 AND return_id=$2',
        [item.item_id, req.params.id]
      );
      if (!sri.length) continue;

      const replaced = Math.max(0, parseInt(item.quantity_replaced) || 0);
      const rejected  = Math.max(0, parseInt(item.quantity_rejected)  || 0);
      const resolution =
        replaced > 0 && rejected > 0 ? 'partial' :
        replaced > 0  ? 'replaced' :
        rejected > 0  ? 'rejected' : 'pending';

      // تحديث البند
      await client.query(
        `UPDATE supplier_return_items
         SET quantity_replaced=$1, quantity_rejected=$2, resolution=$3, notes=$4
         WHERE id=$5`,
        [replaced, rejected, resolution, item.notes || null, item.item_id]
      );

      // القطع المستبدلة → تدخل المخزون مرة ثانية
      if (replaced > 0 && sri[0].part_id) {
        const { rows: part } = await client.query(
          'SELECT quantity, avg_cost, cost_price, branch_id FROM parts WHERE id=$1',
          [sri[0].part_id]
        );
        const qtyBefore = parseInt(part[0]?.quantity || 0);

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

      // مرفوضة من المورد → تبقى انتظار أو شطب
      if (replaced === 0 && rejected > 0) {
        await client.query(
          `UPDATE defective_parts
           SET reason = COALESCE(reason,'') || ' — رُفض من المورد'
           WHERE id=$1`,
          [sri[0].defective_part_id]
        );
        // تُعاد لـ waiting ليقرر المدير شطبها
        await client.query(
          "UPDATE defective_parts SET status='waiting' WHERE id=$1",
          [sri[0].defective_part_id]
        );
      }
    }

    await client.query(
      `UPDATE supplier_returns
       SET status='resolved', approved_by=$1, resolved_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [req.user.id, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'تم تسجيل رد المورد وتحديث المخزون' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// POST /api/defective/:id/writeoff
const writeOffPart = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { reason } = req.body;

    const { rows: def } = await client.query(
      "SELECT * FROM defective_parts WHERE id=$1 AND status='waiting' FOR UPDATE",
      [req.params.id]
    );
    if (!def.length) throw new AppError('القطعة غير موجودة أو ليست في انتظار الشطب', 404);

    await client.query(
      "UPDATE defective_parts SET status='written_off', updated_at=NOW() WHERE id=$1",
      [req.params.id]
    );

    // audit_log بالأعمدة الصحيحة
    await client.query(
      `INSERT INTO audit_log
         (user_id, branch_id, action, table_name, record_id, old_values, new_values)
       VALUES ($1,$2,'write_off','defective_parts',$3,$4,$5)`,
      [req.user.id, req.user.branch_id, def[0].id,
       JSON.stringify({ status: 'waiting', quantity: def[0].quantity }),
       JSON.stringify({ status: 'written_off', reason: reason || 'شطب بموافقة المدير' })]
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
