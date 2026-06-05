const { query, getClient } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');
const { notifyRole } = require('../utils/notify');

// GET /api/inventory/adjustments
const getAdjustments = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id || null;
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (branchId) { params.push(branchId); conditions.push(`ia.branch_id = $${params.length}`); }
    if (status)   { params.push(status);   conditions.push(`ia.status = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), offset);

    const { rows } = await query(
      `SELECT ia.*,
         p.name as part_name, p.sku,
         cb.full_name as created_by_name,
         ab.full_name as approved_by_name,
         b.name as branch_name
       FROM inventory_adjustments ia
       LEFT JOIN parts    p  ON p.id  = ia.part_id
       LEFT JOIN users    cb ON cb.id = ia.created_by
       LEFT JOIN users    ab ON ab.id = ia.approved_by
       LEFT JOIN branches b  ON b.id  = ia.branch_id
       ${where}
       ORDER BY ia.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: cnt } = await query(
      `SELECT COUNT(*) FROM inventory_adjustments ia ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({ success: true, data: rows,
      pagination: { total: parseInt(cnt[0].count), page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (err) { next(err); }
};

// POST /api/inventory/adjustments — إنشاء طلب جرد
const createAdjustment = async (req, res, next) => {
  try {
    const { part_id, quantity_actual, reason, notes } = req.body;
    if (!part_id || quantity_actual === undefined || quantity_actual === null)
      throw new AppError('القطعة والكمية الفعلية مطلوبة');
    if (parseInt(quantity_actual) < 0)
      throw new AppError('الكمية لا يمكن أن تكون سالبة');

    const branchId = req.user.branch_id;

    // جلب الكمية الحالية من النظام
    const { rows: part } = await query(
      'SELECT quantity, name, branch_id FROM parts WHERE id=$1 AND ($2::uuid IS NULL OR branch_id=$2)',
      [part_id, branchId || null]
    );
    if (!part.length) throw new AppError('القطعة غير موجودة', 404);

    const { rows } = await query(
      `INSERT INTO inventory_adjustments
         (branch_id, part_id, quantity_system, quantity_actual, reason, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [part[0].branch_id, part_id, part[0].quantity, parseInt(quantity_actual),
       reason, notes, req.user.id]
    );

    // إشعار المدير ومشرف الفرع
    notifyRole({
      branchId: part[0].branch_id,
      roles: [],
      type: 'general',
      priority: 'high',
      orderId: null,
      message: `⚙️ طلب تسوية مخزون: "${part[0].name}" — النظام: ${part[0].quantity} | الفعلي: ${quantity_actual} | الفرق: ${parseInt(quantity_actual) - part[0].quantity}`
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'تم إرسال طلب التسوية للاعتماد', data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/inventory/adjustments/:id/approve — اعتماد التسوية
const approveAdjustment = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: adj } = await client.query(
      'SELECT * FROM inventory_adjustments WHERE id=$1 FOR UPDATE',
      [req.params.id]
    );
    if (!adj.length) throw new AppError('الطلب غير موجود', 404);
    if (adj[0].status !== 'pending') throw new AppError('الطلب لم يعد في انتظار الاعتماد');

    const a = adj[0];

    // تحقق أن الكمية في النظام لم تتغير منذ تقديم الطلب
    const { rows: current } = await client.query(
      'SELECT quantity, avg_cost, cost_price FROM parts WHERE id=$1 FOR UPDATE',
      [a.part_id]
    );
    const currentQty = current[0].quantity;
    const unitCost   = parseFloat(current[0].avg_cost) || parseFloat(current[0].cost_price) || 0;

    // تحديث الكمية
    await client.query(
      'UPDATE parts SET quantity=$1, updated_by=$2, updated_at=NOW() WHERE id=$3',
      [a.quantity_actual, req.user.id, a.part_id]
    );

    // تحديث حالة الطلب
    await client.query(
      'UPDATE inventory_adjustments SET status=\'approved\', approved_by=$1, approved_at=NOW() WHERE id=$2',
      [req.user.id, req.params.id]
    );

    // تسجيل الحركة
    const movType = a.difference > 0 ? 'adjustment_add' : 'adjustment_sub';
    await client.query(
      `INSERT INTO inventory_movements
         (part_id, branch_id, movement_type, quantity, quantity_before, quantity_after,
          unit_cost, reference_id, reference_type, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'adjustment',$9,$10)`,
      [a.part_id, a.branch_id, movType, Math.abs(a.difference),
       currentQty, a.quantity_actual, unitCost,
       req.params.id, `تسوية جرد — ${a.reason}`, req.user.id]
    ).catch(() => {});

    await client.query('COMMIT');

    // إشعار من قدّم الطلب
    const { notifyUser } = require('../utils/notify');
    notifyUser({ userId: a.created_by, type:'general', priority:'normal',
      message: `✅ تمت الموافقة على طلب تسوية المخزون — الفرق: ${a.difference > 0 ? '+' : ''}${a.difference}` }).catch(() => {});

    res.json({ success: true, message: 'تمت الموافقة على تسوية المخزون' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
};

// POST /api/inventory/adjustments/:id/reject — رفض التسوية
const rejectAdjustment = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const { rows } = await query(
      `UPDATE inventory_adjustments
       SET status='rejected', approved_by=$1, approved_at=NOW(), rejected_reason=$2
       WHERE id=$3 AND status='pending' RETURNING *`,
      [req.user.id, reason, req.params.id]
    );
    if (!rows.length) throw new AppError('الطلب غير موجود أو تمت معالجته', 404);

    const { notifyUser } = require('../utils/notify');
    notifyUser({ userId: rows[0].created_by, type:'general', priority:'normal',
      message: `❌ تم رفض طلب تسوية المخزون — السبب: ${reason || 'لم يُذكر'}` }).catch(() => {});

    res.json({ success: true, message: 'تم رفض طلب التسوية' });
  } catch (err) { next(err); }
};

module.exports = { getAdjustments, createAdjustment, approveAdjustment, rejectAdjustment };
