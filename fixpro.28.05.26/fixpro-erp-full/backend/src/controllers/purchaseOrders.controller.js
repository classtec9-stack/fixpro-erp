// backend/src/controllers/purchaseOrders.controller.js
// بدون transactions — متوافق مع Supabase pooler
const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id'] ? null : req.user.branch_id;

// GET /api/purchase-orders
const getPurchaseOrders = async (req, res, next) => {
  try {
    const { status, supplier_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const branchId = getBranchId(req);
    const params = [], conds = [];

    if (branchId)    { params.push(branchId);    conds.push(`po.branch_id = $${params.length}`); }
    if (status)      { params.push(status);      conds.push(`po.status = $${params.length}`); }
    if (supplier_id) { params.push(supplier_id); conds.push(`po.supplier_id = $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const count = await query(`SELECT COUNT(*) FROM purchase_orders po ${where}`, params);

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT po.*, s.name as supplier_name, s.phone as supplier_phone,
              u.full_name as created_by_name,
              (SELECT COUNT(*) FROM po_items WHERE po_id=po.id) as items_count
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = po.created_by
       ${where}
       ORDER BY po.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(count.rows[0].count), page: Number(page), limit: Number(limit) }
    });
  } catch (err) { next(err); }
};

// GET /api/purchase-orders/:id
const getPurchaseOrderById = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT po.*, s.name as supplier_name, s.phone as supplier_phone, s.email as supplier_email
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.id = $1 AND ($2::uuid IS NULL OR po.branch_id = $2)`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('أمر الشراء غير موجود', 404);

    const { rows: items } = await query(
      `SELECT poi.*, p.name as part_current_name, p.quantity as current_stock
       FROM po_items poi
       LEFT JOIN parts p ON p.id = poi.part_id
       WHERE poi.po_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], items } });
  } catch (err) { next(err); }
};

// POST /api/purchase-orders
const createPurchaseOrder = async (req, res, next) => {
  try {
    const { supplier_id, items, expected_date, notes, supplier_ref } = req.body;
    if (!supplier_id || !items?.length) throw new AppError('المورد والبنود مطلوبان');

    const subtotal   = items.reduce((s, i) => s + (i.quantity_ordered * i.unit_cost), 0);
    const vat_amount = +(subtotal * 0.15).toFixed(2);
    const total      = +(subtotal + vat_amount).toFixed(2);

    const { rows: poRows } = await query(
      `INSERT INTO purchase_orders
         (branch_id, supplier_id, created_by, status, subtotal, vat_amount, total,
          expected_date, notes, supplier_ref)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.branch_id, supplier_id, req.user.id,
       subtotal, vat_amount, total, expected_date || null, notes || null, supplier_ref || null]
    );

    // إضافة كل البنود بجملة واحدة — كلها أو لا شيء
    try {
      const params = [poRows[0].id];
      const values = items.map((item, i) => {
        params.push(
          item.part_id || null, item.part_name,
          item.part_sku || null, item.quantity_ordered, item.unit_cost
        );
        const b = 1 + i * 5;
        return `($1, $${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5})`;
      });
      await query(
        `INSERT INTO po_items (po_id, part_id, part_name, part_sku, quantity_ordered, unit_cost)
         VALUES ${values.join(', ')}`,
        params
      );
    } catch (itemErr) {
      await query('DELETE FROM purchase_orders WHERE id=$1', [poRows[0].id]).catch(() => {});
      throw itemErr;
    }

    res.status(201).json({ success: true, message: 'تم إنشاء أمر الشراء', data: poRows[0] });
  } catch (err) { next(err); }
};

// POST /api/purchase-orders/:id/receive — استلام البضاعة
const receivePurchaseOrder = async (req, res, next) => {
  try {
    const { items } = req.body;
    const branchId = getBranchId(req);

    // 1. تحقق من الأمر — قراءة عادية
    const { rows: poRows } = await query(
      `SELECT * FROM purchase_orders WHERE id=$1 AND ($2::uuid IS NULL OR branch_id=$2)`,
      [req.params.id, branchId]
    );
    if (!poRows.length) throw new AppError('أمر الشراء غير موجود', 404);
    if (poRows[0].status === 'cancelled') throw new AppError('أمر الشراء ملغي');
    if (poRows[0].status === 'received')  throw new AppError('تم استلام هذا الأمر بالكامل مسبقاً');

    let allReceived = true;
    const failures = [];

    for (const item of items) {
      if (!item.quantity_received || item.quantity_received <= 0) continue;

      const { rows: poItem } = await query(
        'SELECT * FROM po_items WHERE id=$1 AND po_id=$2',
        [item.po_item_id, req.params.id]
      );
      if (!poItem.length) continue;

      const newReceived = poItem[0].quantity_received + item.quantity_received;
      const safeQty = Math.min(newReceived, poItem[0].quantity_ordered);

      // تحديث البند
      await query(
        'UPDATE po_items SET quantity_received=$1 WHERE id=$2',
        [safeQty, item.po_item_id]
      );

      if (safeQty < poItem[0].quantity_ordered) allReceived = false;

      // تحديث المخزون — ذرّي بدون قيود إضافية
      if (poItem[0].part_id) {
        const newAvgCost = item.unit_cost || poItem[0].unit_cost;

        try {
          const { rowCount } = await query(
            `UPDATE parts SET
               quantity    = quantity + $1,
               avg_cost    = $2,
               last_restock = NOW(),
               updated_at  = NOW()
             WHERE id=$3 AND branch_id=$4`,
            [item.quantity_received, newAvgCost, poItem[0].part_id, poRows[0].branch_id]
          );

          if (rowCount === 0) {
            // القطعة غير موجودة في الفرع (نادر) — أضفها
            await query(
              `INSERT INTO parts (branch_id, name, sku, quantity, avg_cost, cost_price, sell_price,
                                  min_quantity, is_active, created_by)
               SELECT $1, part_name, part_sku, $2, $3, $3, $3, 5, true, $4
               FROM po_items WHERE id=$5`,
              [poRows[0].branch_id, item.quantity_received, newAvgCost, req.user.id, item.po_item_id]
            );
          }

          await query(
            `INSERT INTO inventory_movements
               (part_id, branch_id, movement_type, quantity, unit_cost,
                reference_id, reference_type, notes, created_by)
             VALUES ($1,$2,'purchase',$3,$4,$5,'purchase_order','استلام من أمر شراء',$6)`,
            [poItem[0].part_id, poRows[0].branch_id, item.quantity_received,
             newAvgCost, req.params.id, req.user.id]
          ).catch(() => {});

        } catch (inventoryErr) {
          failures.push({ part_id: poItem[0].part_id, error: inventoryErr.message });
        }
      }
    }

    // تحديث حالة الأمر بشكل ذرّي
    await query(
      `UPDATE purchase_orders
       SET status        = $1,
           received_at   = CASE WHEN $1='received' THEN NOW() ELSE received_at END,
           updated_at    = NOW()
       WHERE id=$2`,
      [allReceived ? 'received' : 'partially_received', req.params.id]
    );

    if (failures.length)
      return res.json({
        success: true,
        message: `تم تسجيل الاستلام لكن ${failures.length} صنف واجه مشكلة في تحديث المخزون`,
        failures
      });

    res.json({
      success: true,
      message: allReceived ? 'تم استلام الطلبية بالكامل ✅' : 'تم تسجيل استلام جزئي'
    });
  } catch (err) { next(err); }
};

// PATCH /api/purchase-orders/:id/cancel
const cancelPurchaseOrder = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `UPDATE purchase_orders SET status='cancelled', updated_at=NOW()
       WHERE id=$1 AND ($2::uuid IS NULL OR branch_id=$2) AND status IN ('draft','sent')
       RETURNING *`,
      [req.params.id, branchId]
    );
    if (!rows.length) throw new AppError('لا يمكن إلغاء هذا الأمر — تأكد من حالته', 409);
    res.json({ success: true, message: 'تم إلغاء أمر الشراء' });
  } catch (err) { next(err); }
};

module.exports = {
  getPurchaseOrders, getPurchaseOrderById,
  createPurchaseOrder, receivePurchaseOrder,
  cancelPurchaseOrder
};
