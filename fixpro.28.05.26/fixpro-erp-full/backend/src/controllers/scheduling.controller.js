const { query } = require('../config/database');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id'] ? null : req.user.branch_id;

// GET /api/scheduling/workload — عبء عمل الفنيين
const getTechnicianWorkload = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT
         u.id, u.full_name, u.specialty, u.max_tickets, u.hourly_rate,
         COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled','rejected')) as active_tickets,
         COUNT(o.id) FILTER (WHERE o.status = 'in_repair') as in_repair,
         COUNT(o.id) FILTER (WHERE o.status = 'diagnosing') as diagnosing,
         COUNT(o.id) FILTER (WHERE o.status = 'waiting_part') as waiting_part,
         COUNT(o.id) FILTER (WHERE o.priority = 'vip' AND o.status NOT IN ('delivered','cancelled','rejected')) as vip_tickets,
         COUNT(o.id) FILTER (WHERE o.sla_breached = true AND o.status NOT IN ('delivered','cancelled','rejected')) as breached,
         u.max_tickets - COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled','rejected')) as available_slots
       FROM users u
       LEFT JOIN orders o ON o.technician_id = u.id
       WHERE u.role = 'technician' AND u.is_active = true
         AND ($1::uuid IS NULL OR u.branch_id = $1)
       GROUP BY u.id, u.full_name, u.specialty, u.max_tickets, u.hourly_rate
       ORDER BY active_tickets ASC`,
      [branchId]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// GET /api/scheduling/board — لوحة Kanban للورشة
const getWorkshopBoard = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { rows } = await query(
      `SELECT
         o.id, o.order_number, o.status, o.priority,
         o.received_at, o.promised_at, o.sla_deadline, o.sla_breached,
         o.estimated_minutes,
         c.full_name as customer_name, c.phone as customer_phone,
         d.brand, d.model, d.device_type,
         u.full_name as technician_name, u.id as technician_id,
         EXTRACT(EPOCH FROM (NOW() - o.received_at))/3600 as hours_open,
         (SELECT COUNT(*) FROM order_parts WHERE order_id=o.id) as parts_count
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = o.technician_id
       WHERE ($1::uuid IS NULL OR o.branch_id = $1)
         AND o.status NOT IN ('delivered','cancelled','rejected')
       ORDER BY
         CASE o.priority WHEN 'vip' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
         o.sla_breached DESC,
         o.received_at ASC`,
      [branchId]
    );

    // تجميع حسب الحالة
    const board = {};
    const statuses = ['new','quick_check','diagnosing','waiting_approval',
                      'in_repair','waiting_part','part_transferred','ready'];
    statuses.forEach(s => { board[s] = []; });
    rows.forEach(r => {
      if (board[r.status]) board[r.status].push(r);
      else board[r.status] = [r];
    });

    res.json({ success: true, data: board, total: rows.length });
  } catch (err) { next(err); }
};

// POST /api/scheduling/auto-assign — اقتراح فني مناسب لتذكرة
const suggestTechnician = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const branchId = getBranchId(req);

    // جلب بيانات التذكرة
    const { rows: orderRows } = await query(
      `SELECT o.priority, d.device_type, d.brand
       FROM orders o JOIN devices d ON d.id=o.device_id
       WHERE o.id=$1 AND ($2::uuid IS NULL OR o.branch_id=$2)`,
      [order_id, branchId]
    );
    if (!orderRows.length) return res.status(404).json({ success: false, message: 'التذكرة غير موجودة' });
    const { priority, device_type, brand } = orderRows[0];

    // جلب الفنيين المتاحين مع تطابق المهارات
    const { rows: technicians } = await query(
      `SELECT
         u.id, u.full_name, u.specialty,
         COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled','rejected')) as active_tickets,
         u.max_tickets,
         -- هل يملك مهارة مطابقة؟
         EXISTS (
           SELECT 1 FROM technician_skills ts
           WHERE ts.user_id = u.id AND ts.is_active = true
             AND ($3 = ANY(ts.device_brands) OR ts.device_brands IS NULL)
         ) as has_matching_skill
       FROM users u
       LEFT JOIN orders o ON o.technician_id = u.id
       WHERE u.role = 'technician' AND u.is_active = true
         AND ($1::uuid IS NULL OR u.branch_id = $1)
       GROUP BY u.id, u.full_name, u.specialty, u.max_tickets
       HAVING COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled','rejected')) < u.max_tickets
       ORDER BY has_matching_skill DESC, active_tickets ASC
       LIMIT 3`,
      [branchId, device_type, brand]
    );

    res.json({ success: true, data: technicians });
  } catch (err) { next(err); }
};

module.exports = { getTechnicianWorkload, getWorkshopBoard, suggestTechnician };
