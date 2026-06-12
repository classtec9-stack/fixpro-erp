const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');
const { notifyRole } = require('../utils/notify');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id'] ? null : req.user.branch_id;

// GET /api/sla/policies
const getPolicies = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT * FROM sla_policies
       WHERE ($1::uuid IS NULL OR branch_id = $1) AND is_active = true
       ORDER BY priority, device_type`,
      [branchId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/sla/policies
const createPolicy = async (req, res, next) => {
  try {
    const { name, priority, device_type, response_time_min,
            diagnosis_time_min, repair_time_min, escalate_to_role } = req.body;

    const { rows } = await query(
      `INSERT INTO sla_policies
         (branch_id, name, priority, device_type,
          response_time_min, diagnosis_time_min, repair_time_min, escalate_to_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.branch_id, name, priority || null, device_type || null,
       response_time_min || 60, diagnosis_time_min || 120,
       repair_time_min || 1440, escalate_to_role || 'branch_manager']
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/sla/breached — التذاكر التي تجاوزت SLA
const getBreachedTickets = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.status, o.priority,
              o.received_at, o.sla_deadline, o.technician_id,
              c.full_name as customer_name,
              d.brand, d.model,
              u.full_name as technician_name,
              EXTRACT(EPOCH FROM (NOW() - o.sla_deadline))/60 as overdue_minutes
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = o.technician_id
       WHERE ($1::uuid IS NULL OR o.branch_id = $1)
         AND o.sla_deadline IS NOT NULL
         AND o.sla_deadline < NOW()
         AND o.status NOT IN ('delivered','cancelled','rejected')
       ORDER BY o.sla_deadline ASC`,
      [branchId]
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) { next(err); }
};

// POST /api/sla/check — تشغيل فحص SLA يدوياً (يُشغَّل أيضاً بـ cron)
const checkAndAlertBreaches = async (req, res, next) => {
  try {
    // جلب كل التذاكر المتأخرة غير المُبلَّغ عنها
    const { rows: breached } = await query(
      `SELECT o.id, o.order_number, o.branch_id, o.priority,
              o.sla_deadline, o.technician_id,
              c.full_name as customer_name, d.brand, d.model
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       WHERE o.sla_deadline IS NOT NULL
         AND o.sla_deadline < NOW()
         AND o.sla_breached = false
         AND o.status NOT IN ('delivered','cancelled','rejected')`
    );

    let alertsSent = 0;
    for (const ticket of breached) {
      // إشعار المدير
      await notifyRole({
        branchId: ticket.branch_id,
        roles: ['admin', 'branch_manager'],
        type: 'sla_breach',
        priority: 'high',
        orderId: ticket.id,
        message: `⚠️ تجاوز SLA: تذكرة ${ticket.order_number} (${ticket.customer_name} — ${ticket.brand} ${ticket.model})`
      }).catch(() => {});

      // تحديث العلامة
      await query('UPDATE orders SET sla_breached=true WHERE id=$1', [ticket.id]);
      alertsSent++;
    }

    res.json({ success: true, message: `تم إرسال ${alertsSent} تنبيه SLA` });
  } catch (err) { next(err); }
};

module.exports = { getPolicies, createPolicy, getBreachedTickets, checkAndAlertBreaches };
