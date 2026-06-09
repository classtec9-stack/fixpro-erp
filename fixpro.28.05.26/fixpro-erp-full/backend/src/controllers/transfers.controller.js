const { query, getClient } = require('../config/database');
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
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { to_branch_id, items, notes } = req.body;

    if (!to_branch_id || !items?.length)
      throw new AppError('الفرع المستقبل والأصناف مطلوبة');
    if (to_branch_id === req.user.branch_id)
      throw new AppError('لا يمكن التحويل لنفس الفرع');

    // تحقق من توفر الكميات في الفرع المُرسِل
    for (const item of items) {
      const { rows: part } = await client.query(
        'SELECT quantity, name FROM parts WHERE id=$1 AND branch_id=$2',
        [item.part_id, req.user.branch_id]
      );
      if (!part.length) throw new AppError(`القطعة غير موجودة في فرعك`);
      if (part[0].quantity < item.quantity_sent)
        throw new AppError(`"${part[0].name}" — الكمية المتاحة ${part[0].quantity} فقط`);
    }

    const { rows: transfer } = await client.query(
      `INSERT INTO branch_transfers
         (from_branch_id, to_branch_id, requested_by, status, notes)
       VALUES ($1,$2,$3,'pending',$4) RETURNING *`,
      [req.user.branch_id, to_branch_id, req.user.id, notes || null]
    );

    for (const item of items) {
      await client.query(
        `INSERT INTO branch_transfer_items (transfer_id, part_id, quantity_sent, notes)
         VALUES ($1,$2,$3,$4)`,
        [transfer[0].id, item.part_id, item.quantity_sent, item.notes || null]
      );
    }

    // إشعار مدير الفرع المستقبل
    await notifyRole({
      branchId: to_branch_id, roles: ['admin', 'branch_manager', 'warehouse'],
      type: 'general', priority: 'normal', orderId: null,
      message: `📦 طلب تحويل مخزون جديد — ${items.length} صنف من فرع آخر | رقم: ${transfer[0].transfer_number}`
    }).catch(() => {});

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'تم إرسال طلب التحويل', data: transfer[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// PATCH /api/transfers/:id/approve — موافقة الفرع المُرسِل
const approveTransfer = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: transfer } = await client.query(
      'SELECT * FROM branch_transfers WHERE id=$1 FOR UPDATE',
      [req.params.id]
    );
    if (!transfer.length) throw new AppError('التحويل غير موجود', 404);
    if (transfer[0].status !== 'pending') throw new AppError('التحويل ليس في انتظار موافقة');
    if (transfer[0].from_branch_id !== req.user.branch_id && req.user.role !== 'admin')
      throw new AppError('ليس لديك صلاحية الموافقة على هذا التحويل', 403);

    const { rows: items } = await client.query(
      'SELECT * FROM branch_transfer_items WHERE transfer_id=$1',
      [req.params.id]
    );

    // خصم الكميات من الفرع المُرسِل
    for (const item of items) {
      const { rows: part } = await client.query(
        'SELECT quantity, name FROM parts WHERE id=$1 AND branch_id=$2 FOR UPDATE',
        [item.part_id, transfer[0].from_branch_id]
      );
      if (!part.length || part[0].quantity < item.quantity_sent)
        throw new AppError(`"${part[0]?.name || 'قطعة'}" — الكمية غير كافية`);

      await client.query(
        'UPDATE parts SET quantity = quantity - $1, updated_at=NOW() WHERE id=$2 AND branch_id=$3',
        [item.quantity_sent, item.part_id, transfer[0].from_branch_id]
      );

      // سجل حركة الخروج
      await client.query(
        `INSERT INTO inventory_movements
           (part_id, branch_id, movement_type, quantity, reference_id, reference_type, notes, created_by)
         VALUES ($1,$2,'issue',$3,$4,'branch_transfer','تحويل لفرع آخر',$5)`,
        [item.part_id, transfer[0].from_branch_id, item.quantity_sent, req.params.id, req.user.id]
      ).catch(() => {});
    }

    await client.query(
      `UPDATE branch_transfers SET status='in_transit', approved_by=$1, approved_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [req.user.id, req.params.id]
    );

    // إشعار الفرع المستقبل
    await notifyRole({
      branchId: transfer[0].to_branch_id, roles: ['admin', 'branch_manager', 'warehouse'],
      type: 'general', priority: 'normal', orderId: null,
      message: `🚚 تحويل مخزون في الطريق إليكم — ${transfer[0].transfer_number}`
    }).catch(() => {});

    await client.query('COMMIT');
    res.json({ success: true, message: 'تمت الموافقة — تم خصم المخزون وإرسال الإشعار' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// PATCH /api/transfers/:id/receive — استلام الفرع المستقبل
const receiveTransfer = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: transfer } = await client.query(
      'SELECT * FROM branch_transfers WHERE id=$1 FOR UPDATE',
      [req.params.id]
    );
    if (!transfer.length) throw new AppError('التحويل غير موجود', 404);
    if (transfer[0].status !== 'in_transit') throw new AppError('التحويل ليس في الطريق');
    if (transfer[0].to_branch_id !== req.user.branch_id && req.user.role !== 'admin')
      throw new AppError('ليس لديك صلاحية الاستلام', 403);

    const { rows: items } = await client.query(
      'SELECT bti.*, p.avg_cost, p.cost_price FROM branch_transfer_items bti JOIN parts p ON p.id=bti.part_id WHERE bti.transfer_id=$1',
      [req.params.id]
    );

    for (const item of items) {
      // تحقق هل القطعة موجودة في الفرع المستقبل
      const { rows: existing } = await client.query(
        'SELECT id, quantity FROM parts WHERE id=$1 AND branch_id=$2',
        [item.part_id, transfer[0].to_branch_id]
      );

      if (existing.length) {
        // القطعة موجودة → زيادة الكمية
        await client.query(
          'UPDATE parts SET quantity = quantity + $1, updated_at=NOW() WHERE id=$2 AND branch_id=$3',
          [item.quantity_sent, item.part_id, transfer[0].to_branch_id]
        );
      } else {
        // القطعة غير موجودة في الفرع الجديد → نسخ القطعة
        await client.query(
          `INSERT INTO parts (branch_id, name, sku, barcode, category, brand_compat,
             quantity, min_quantity, cost_price, avg_cost, sell_price, supplier_id, location, notes, is_active)
           SELECT $1, name, sku||'-TRF', barcode, category, brand_compat,
             $2, min_quantity, cost_price, avg_cost, sell_price, supplier_id, location, notes, true
           FROM parts WHERE id=$3`,
          [transfer[0].to_branch_id, item.quantity_sent, item.part_id]
        );
      }

      // تحديث quantity_received
      await client.query(
        'UPDATE branch_transfer_items SET quantity_received=$1 WHERE id=$2',
        [item.quantity_sent, item.id]
      );

      // سجل حركة الدخول
      await client.query(
        `INSERT INTO inventory_movements
           (part_id, branch_id, movement_type, quantity, reference_id, reference_type, notes, created_by)
         VALUES ($1,$2,'purchase',$3,$4,'branch_transfer','استلام تحويل من فرع آخر',$5)`,
        [item.part_id, transfer[0].to_branch_id, item.quantity_sent, req.params.id, req.user.id]
      ).catch(() => {});
    }

    await client.query(
      `UPDATE branch_transfers SET status='received', received_by=$1, received_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [req.user.id, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'تم استلام التحويل وتحديث المخزون' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
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
