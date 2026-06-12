const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');
const { notifyRole } = require('../utils/notify');

// GET /api/transfers
const getTransfers = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const branchId = req.user.branch_id;
    const params = [];
    const conds = [];

    // المدير يرى كل التحويلات، الموظف يرى فرعه فقط
    if (req.user.role !== 'admin' || req.headers['x-branch-id']) {
      params.push(branchId);
      conds.push(`(t.from_branch_id = $${params.length} OR t.to_branch_id = $${params.length})`);
    }
    if (status) { params.push(status); conds.push(`t.status = $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    const count = await query(`SELECT COUNT(*) FROM branch_transfers t ${where}`, params);

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT t.*,
         fb.name as from_branch_name, tb.name as to_branch_name,
         rb.full_name as requested_by_name,
         (SELECT COUNT(*) FROM branch_transfer_items WHERE transfer_id = t.id) as items_count
       FROM branch_transfers t
       JOIN branches fb ON fb.id = t.from_branch_id
       JOIN branches tb ON tb.id = t.to_branch_id
       LEFT JOIN users rb ON rb.id = t.requested_by
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(count.rows[0].count), page: Number(page), limit: Number(limit) }
    });
  } catch (err) { next(err); }
};

// GET /api/transfers/:id
const getTransferById = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.*,
         fb.name as from_branch_name, tb.name as to_branch_name,
         rb.full_name as requested_by_name,
         ab.full_name as approved_by_name,
         recb.full_name as received_by_name
       FROM branch_transfers t
       JOIN branches fb ON fb.id = t.from_branch_id
       JOIN branches tb ON tb.id = t.to_branch_id
       LEFT JOIN users rb   ON rb.id   = t.requested_by
       LEFT JOIN users ab   ON ab.id   = t.approved_by
       LEFT JOIN users recb ON recb.id = t.received_by
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!rows.length) throw new AppError('التحويل غير موجود', 404);

    const { rows: items } = await query(
      `SELECT ti.*, p.name as part_name, p.sku, p.barcode,
              p.quantity as available_in_from_branch
       FROM branch_transfer_items ti
       JOIN parts p ON p.id = ti.part_id
       WHERE ti.transfer_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], items } });
  } catch (err) { next(err); }
};

// POST /api/transfers — إنشاء طلب تحويل
const createTransfer = async (req, res, next) => {
  try {
    const { to_branch_id, items, notes } = req.body;

    if (!to_branch_id || !items?.length)
      throw new AppError('الفرع المستقبل والأصناف مطلوبة');
    if (to_branch_id === req.user.branch_id)
      throw new AppError('لا يمكن التحويل لنفس الفرع');

    // تحقق من توفر الكميات في الفرع المُرسِل
    for (const item of items) {
      const { rows: part } = await query(
        'SELECT quantity, name FROM parts WHERE id=$1 AND branch_id=$2',
        [item.part_id, req.user.branch_id]
      );
      if (!part.length) throw new AppError(`القطعة غير موجودة في فرعك`);
      if (part[0].quantity < item.quantity_sent)
        throw new AppError(`"${part[0].name}" — الكمية المتاحة ${part[0].quantity} فقط`);
    }

    const { rows: transfer } = await query(
      `INSERT INTO branch_transfers
         (from_branch_id, to_branch_id, requested_by, status, notes)
       VALUES ($1,$2,$3,'pending',$4) RETURNING *`,
      [req.user.branch_id, to_branch_id, req.user.id, notes || null]
    );

    // إدراج كل البنود بجملة واحدة — كلها أو لا شيء
    try {
      const values = [];
      const params = [transfer[0].id];
      items.forEach((item, i) => {
        params.push(item.part_id, item.quantity_sent, item.notes || null);
        const base = 1 + i * 3;
        values.push(`($1, $${base+1}, $${base+2}, $${base+3})`);
      });
      await query(
        `INSERT INTO branch_transfer_items (transfer_id, part_id, quantity_sent, notes)
         VALUES ${values.join(', ')}`,
        params
      );
    } catch (itemErr) {
      // تعويض: احذف رأس التحويل اليتيم
      await query('DELETE FROM branch_transfers WHERE id=$1', [transfer[0].id]).catch(() => {});
      throw itemErr;
    }

    // إشعار مدير الفرع المستقبل
    notifyRole({
      branchId: to_branch_id, roles: ['admin', 'branch_manager', 'warehouse'],
      type: 'general', priority: 'normal', orderId: null,
      message: `📦 طلب تحويل مخزون جديد — ${items.length} صنف من فرع آخر | رقم: ${transfer[0].transfer_number}`
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'تم إرسال طلب التحويل', data: transfer[0] });
  } catch (err) { next(err); }
};

// PATCH /api/transfers/:id/approve — موافقة الفرع المُرسِل
const approveTransfer = async (req, res, next) => {
  try {
    // 1. اقرأ التحويل وتحقق من الصلاحية
    const { rows: transfer } = await query(
      'SELECT * FROM branch_transfers WHERE id=$1',
      [req.params.id]
    );
    if (!transfer.length) throw new AppError('التحويل غير موجود', 404);
    if (transfer[0].from_branch_id !== req.user.branch_id && req.user.role !== 'admin')
      throw new AppError('ليس لديك صلاحية الموافقة على هذا التحويل', 403);

    // 2. المطالبة الذرّية بالحالة — تمنع الموافقة المزدوجة نهائياً
    const { rows: claimed } = await query(
      `UPDATE branch_transfers
       SET status='in_transit', approved_by=$1, approved_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND status='pending'
       RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!claimed.length)
      throw new AppError('التحويل ليس في انتظار موافقة — ربما وافق عليه شخص آخر للتو', 409);

    const { rows: items } = await query(
      'SELECT * FROM branch_transfer_items WHERE transfer_id=$1',
      [req.params.id]
    );

    // 3. خصم الكميات — كل خصم ذرّي بشرط الكمية الكافية
    const deducted = []; // للتعويض عند الفشل
    for (const item of items) {
      const { rowCount } = await query(
        `UPDATE parts SET quantity = quantity - $1, updated_at=NOW()
         WHERE id=$2 AND branch_id=$3 AND quantity >= $1`,
        [item.quantity_sent, item.part_id, claimed[0].from_branch_id]
      );

      if (rowCount === 0) {
        // فشل: كمية غير كافية — عوّض كل ما خُصم وأعد الحالة
        for (const d of deducted) {
          await query(
            'UPDATE parts SET quantity = quantity + $1 WHERE id=$2 AND branch_id=$3',
            [d.quantity_sent, d.part_id, claimed[0].from_branch_id]
          ).catch(() => {});
        }
        await query(
          `UPDATE branch_transfers
           SET status='pending', approved_by=NULL, approved_at=NULL, updated_at=NOW()
           WHERE id=$1`,
          [req.params.id]
        ).catch(() => {});

        const { rows: p } = await query('SELECT name, quantity FROM parts WHERE id=$1 AND branch_id=$2',
          [item.part_id, claimed[0].from_branch_id]);
        throw new AppError(
          `"${p[0]?.name || 'قطعة'}" — الكمية المتاحة ${p[0]?.quantity ?? 0} لا تكفي. أُلغيت الموافقة بالكامل.`
        );
      }

      deducted.push(item);

      // سجل حركة الخروج
      await query(
        `INSERT INTO inventory_movements
           (part_id, branch_id, movement_type, quantity, reference_id, reference_type, notes, created_by)
         VALUES ($1,$2,'issue',$3,$4,'branch_transfer','تحويل لفرع آخر',$5)`,
        [item.part_id, claimed[0].from_branch_id, item.quantity_sent, req.params.id, req.user.id]
      ).catch(() => {});
    }

    // إشعار الفرع المستقبل
    notifyRole({
      branchId: claimed[0].to_branch_id, roles: ['admin', 'branch_manager', 'warehouse'],
      type: 'general', priority: 'normal', orderId: null,
      message: `🚚 تحويل مخزون في الطريق إليكم — ${claimed[0].transfer_number}`
    }).catch(() => {});

    res.json({ success: true, message: 'تمت الموافقة — تم خصم المخزون وإرسال الإشعار' });
  } catch (err) { next(err); }
};

// PATCH /api/transfers/:id/receive — استلام الفرع المستقبل
const receiveTransfer = async (req, res, next) => {
  try {
    const { rows: transfer } = await query(
      'SELECT * FROM branch_transfers WHERE id=$1',
      [req.params.id]
    );
    if (!transfer.length) throw new AppError('التحويل غير موجود', 404);
    if (transfer[0].to_branch_id !== req.user.branch_id && req.user.role !== 'admin')
      throw new AppError('ليس لديك صلاحية الاستلام', 403);

    // المطالبة الذرّية — تمنع الاستلام المزدوج (وبالتالي ازدواج المخزون)
    const { rows: claimed } = await query(
      `UPDATE branch_transfers
       SET status='received', received_by=$1, received_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND status='in_transit'
       RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!claimed.length)
      throw new AppError('التحويل ليس في الطريق — ربما استُلم مسبقاً', 409);

    const { rows: items } = await query(
      `SELECT bti.*, p.avg_cost, p.cost_price
       FROM branch_transfer_items bti
       JOIN parts p ON p.id = bti.part_id
       WHERE bti.transfer_id=$1`,
      [req.params.id]
    );

    const failures = [];
    for (const item of items) {
      try {
        // زيادة الكمية إذا القطعة موجودة في الفرع المستقبل
        const { rowCount } = await query(
          'UPDATE parts SET quantity = quantity + $1, updated_at=NOW() WHERE id=$2 AND branch_id=$3',
          [item.quantity_sent, item.part_id, claimed[0].to_branch_id]
        );

        if (rowCount === 0) {
          // القطعة غير موجودة في الفرع الجديد → انسخها
          await query(
            `INSERT INTO parts (branch_id, name, sku, barcode, category, brand_compat,
               quantity, min_quantity, cost_price, avg_cost, sell_price, supplier_id, location, notes, is_active)
             SELECT $1, name, sku||'-TRF', barcode, category, brand_compat,
               $2, min_quantity, cost_price, avg_cost, sell_price, supplier_id, location, notes, true
             FROM parts WHERE id=$3`,
            [claimed[0].to_branch_id, item.quantity_sent, item.part_id]
          );
        }

        await query(
          'UPDATE branch_transfer_items SET quantity_received=$1 WHERE id=$2',
          [item.quantity_sent, item.id]
        );

        await query(
          `INSERT INTO inventory_movements
             (part_id, branch_id, movement_type, quantity, reference_id, reference_type, notes, created_by)
           VALUES ($1,$2,'purchase',$3,$4,'branch_transfer','استلام تحويل من فرع آخر',$5)`,
          [item.part_id, claimed[0].to_branch_id, item.quantity_sent, req.params.id, req.user.id]
        ).catch(() => {});

      } catch (itemErr) {
        failures.push(item.part_id);
      }
    }

    if (failures.length)
      return res.json({
        success: true,
        message: `تم الاستلام لكن ${failures.length} صنف لم يُضف للمخزون — راجع المخزون يدوياً`,
        failed_part_ids: failures
      });

    res.json({ success: true, message: 'تم استلام التحويل وتحديث المخزون' });
  } catch (err) { next(err); }
};

// PATCH /api/transfers/:id/cancel
const cancelTransfer = async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE branch_transfers SET status='cancelled', updated_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) throw new AppError('لا يمكن إلغاء هذا التحويل');
    res.json({ success: true, message: 'تم إلغاء طلب التحويل' });
  } catch (err) { next(err); }
};

// GET /api/inventory/supplier-catalog/:partId
const getSupplierCatalog = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT sc.*, s.name as supplier_name, s.phone as supplier_phone,
              s.lead_time_days as supplier_lead_time
       FROM supplier_catalog sc
       JOIN suppliers s ON s.id = sc.supplier_id
       WHERE sc.part_id = $1
       ORDER BY sc.is_preferred DESC, sc.unit_cost ASC`,
      [req.params.partId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/inventory/supplier-catalog
const upsertSupplierCatalog = async (req, res, next) => {
  try {
    const { supplier_id, part_id, unit_cost, supplier_sku, lead_time_days, min_order_qty, is_preferred } = req.body;

    if (is_preferred) {
      // إلغاء التفضيل عن الموردين الآخرين لنفس الصنف
      await query('UPDATE supplier_catalog SET is_preferred=false WHERE part_id=$1', [part_id]);
    }

    const { rows } = await query(
      `INSERT INTO supplier_catalog
         (supplier_id, part_id, unit_cost, supplier_sku, lead_time_days, min_order_qty, is_preferred)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (supplier_id, part_id) DO UPDATE SET
         unit_cost      = EXCLUDED.unit_cost,
         supplier_sku   = EXCLUDED.supplier_sku,
         lead_time_days = EXCLUDED.lead_time_days,
         min_order_qty  = EXCLUDED.min_order_qty,
         is_preferred   = EXCLUDED.is_preferred,
         last_updated   = NOW()
       RETURNING *`,
      [supplier_id, part_id, unit_cost, supplier_sku || null,
       lead_time_days || 1, min_order_qty || 1, is_preferred || false]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

module.exports = {
  getTransfers, getTransferById, createTransfer,
  approveTransfer, receiveTransfer, cancelTransfer,
  getSupplierCatalog, upsertSupplierCatalog
};
