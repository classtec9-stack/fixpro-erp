const { query } = require('../config/database');

const getDashboard = async (req, res, next) => {
  try {
    // الفرع: من header إذا اختار المدير فرعاً محدداً، وإلا من المستخدم
    const headerBranch = req.headers['x-branch-id'];
    let branchId = (headerBranch && headerBranch !== 'all')
      ? headerBranch
      : req.user.branch_id;
    const userId   = req.user.id;
    const role     = req.user.role;

    // إذا لا يزال بدون branch_id — جلب أول فرع
    if (!branchId) {
      const { rows: branches } = await query(
        'SELECT id FROM branches WHERE is_active=true ORDER BY created_at LIMIT 1'
      );
      if (branches.length) branchId = branches[0].id;
    }
    if (!branchId) {
      return res.json({ success:true, data: {
        role, financial:null, revenue_chart:[], tickets:{ by_status:[], today:0, active:0, urgent:0 },
        recent_tickets:[], technicians:[], inventory:null, suppliers:[], critical_alerts:0
      }});
    }
    const isTech      = role === 'technician';
    const isWarehouse = role === 'warehouse';
    const isAccountant = role === 'accountant';
    const canFinance  = !isTech && !isWarehouse;
    const canTechView = role === 'admin' || role === 'branch_manager';
    const canInventory = !isTech;

    // ── 1. KPIs مالية ────────────────────────────────────────
    let financial = null;
    if (canFinance) {
      const [todayRev, monthRev, lastMonthRev, pendingBal, paidCnt, pendingCnt] = await Promise.all([
        query(`SELECT COALESCE(SUM(total),0) AS val FROM invoices
               WHERE branch_id=$1 AND status='paid' AND created_at::date=CURRENT_DATE`, [branchId]),
        query(`SELECT COALESCE(SUM(total),0) AS val FROM invoices
               WHERE branch_id=$1 AND status='paid'
               AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())`, [branchId]),
        query(`SELECT COALESCE(SUM(total),0) AS val FROM invoices
               WHERE branch_id=$1 AND status='paid'
               AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW()-INTERVAL '1 month')`, [branchId]),
        query(`SELECT COALESCE(SUM(balance_due),0) AS val FROM invoices
               WHERE branch_id=$1 AND status IN ('pending','partial')`, [branchId]),
        query(`SELECT COUNT(*) AS val FROM invoices
               WHERE branch_id=$1 AND status='paid'
               AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())`, [branchId]),
        query(`SELECT COUNT(*) AS val FROM invoices
               WHERE branch_id=$1 AND status IN ('pending','partial')`, [branchId]),
      ]);
      const thisMonth = parseFloat(monthRev.rows[0].val);
      const prevMonth = parseFloat(lastMonthRev.rows[0].val);
      financial = {
        today_revenue:    parseFloat(todayRev.rows[0].val),
        month_revenue:    thisMonth,
        last_month:       prevMonth,
        growth_pct:       prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : 0,
        pending_balance:  parseFloat(pendingBal.rows[0].val),
        paid_invoices:    parseInt(paidCnt.rows[0].val),
        pending_invoices: parseInt(pendingCnt.rows[0].val),
      };
    }

    // ── 2. إيرادات آخر 7 أيام ───────────────────────────────
    let revenueChart = [];
    if (canFinance) {
      const { rows } = await query(
        `SELECT created_at::date AS day,
                COALESCE(SUM(total),0) AS revenue,
                COUNT(*) AS invoices
         FROM invoices
         WHERE branch_id=$1 AND status='paid'
           AND created_at >= NOW()-INTERVAL '7 days'
         GROUP BY created_at::date
         ORDER BY day ASC`, [branchId]
      );
      revenueChart = rows;
    }

    // ── 3. إحصاءات التذاكر ──────────────────────────────────
    const [byStatus, todayOrders, activeOrders, urgentOrders] = await Promise.all([
      isTech
        ? query(`SELECT status, COUNT(*) AS count FROM orders
                 WHERE branch_id=$1 AND technician_id=$2 GROUP BY status`, [branchId, userId])
        : query(`SELECT status, COUNT(*) AS count FROM orders
                 WHERE branch_id=$1 GROUP BY status`, [branchId]),
      isTech
        ? query(`SELECT COUNT(*) AS count FROM orders
                 WHERE branch_id=$1 AND technician_id=$2
                 AND received_at::date=CURRENT_DATE`, [branchId, userId])
        : query(`SELECT COUNT(*) AS count FROM orders
                 WHERE branch_id=$1 AND received_at::date=CURRENT_DATE`, [branchId]),
      isTech
        ? query(`SELECT COUNT(*) AS count FROM orders
                 WHERE branch_id=$1 AND technician_id=$2
                 AND status NOT IN ('delivered','cancelled','rejected')`, [branchId, userId])
        : query(`SELECT COUNT(*) AS count FROM orders
                 WHERE branch_id=$1 AND status NOT IN ('delivered','cancelled','rejected')`, [branchId]),
      isTech
        ? query(`SELECT COUNT(*) AS count FROM orders
                 WHERE branch_id=$1 AND technician_id=$2
                 AND priority='urgent' AND status NOT IN ('delivered','cancelled','rejected')`, [branchId, userId])
        : query(`SELECT COUNT(*) AS count FROM orders
                 WHERE branch_id=$1 AND priority='urgent'
                 AND status NOT IN ('delivered','cancelled','rejected')`, [branchId]),
    ]);

    const tickets = {
      by_status: byStatus.rows,
      today:     parseInt(todayOrders.rows[0].count),
      active:    parseInt(activeOrders.rows[0].count),
      urgent:    parseInt(urgentOrders.rows[0].count),
    };

    // ── 4. آخر التذاكر ───────────────────────────────────────
    const { rows: recentTickets } = isTech
      ? await query(
          `SELECT o.id, o.order_number, o.status, o.priority, o.received_at,
                  o.estimated_cost,
                  c.full_name AS customer_name, c.phone AS customer_phone,
                  d.brand, d.model, d.device_type,
                  u.full_name AS technician_name
           FROM orders o
           JOIN customers c ON c.id=o.customer_id
           JOIN devices d ON d.id=o.device_id
           LEFT JOIN users u ON u.id=o.technician_id
           WHERE o.branch_id=$1 AND o.technician_id=$2
           ORDER BY o.received_at DESC LIMIT 10`, [branchId, userId])
      : await query(
          `SELECT o.id, o.order_number, o.status, o.priority, o.received_at,
                  o.estimated_cost,
                  c.full_name AS customer_name, c.phone AS customer_phone,
                  d.brand, d.model, d.device_type,
                  u.full_name AS technician_name
           FROM orders o
           JOIN customers c ON c.id=o.customer_id
           JOIN devices d ON d.id=o.device_id
           LEFT JOIN users u ON u.id=o.technician_id
           WHERE o.branch_id=$1
           ORDER BY o.received_at DESC LIMIT 10`, [branchId]);

    // ── 5. أداء الفنيين ──────────────────────────────────────
    let technicians = [];
    if (canTechView) {
      const { rows } = await query(
        `SELECT u.id, u.full_name,
                COUNT(o.id) FILTER (
                  WHERE o.status NOT IN ('new','cancelled','rejected','delivered')
                ) AS active,
                COUNT(o.id) FILTER (
                  WHERE o.status='delivered' AND o.delivered_at::date=CURRENT_DATE
                ) AS done_today,
                COUNT(o.id) FILTER (
                  WHERE o.status='delivered'
                  AND DATE_TRUNC('month',o.delivered_at)=DATE_TRUNC('month',NOW())
                ) AS done_month,
                ROUND(AVG(
                  EXTRACT(EPOCH FROM (o.delivered_at - o.received_at))/3600
                ) FILTER (
                  WHERE o.status='delivered' AND o.delivered_at IS NOT NULL
                ), 1) AS avg_hours
         FROM users u
         LEFT JOIN orders o ON o.technician_id=u.id AND o.branch_id=$1
         WHERE u.branch_id=$1 AND u.role='technician' AND u.is_active=true
         GROUP BY u.id, u.full_name
         ORDER BY done_today DESC NULLS LAST`, [branchId]
      );
      technicians = rows;
    }

    // ── 6. المخزون ──────────────────────────────────────────
    let inventory = null;
    if (canInventory) {
      const [lowStock, topUsed] = await Promise.all([
        query(`SELECT id, name, quantity, min_quantity FROM parts
               WHERE branch_id=$1 AND quantity<=min_quantity AND is_active=true
               ORDER BY (min_quantity-quantity) DESC LIMIT 8`, [branchId]),
        query(`SELECT p.name, SUM(op.quantity) AS total_qty
               FROM order_parts op
               JOIN parts p ON p.id=op.part_id
               JOIN orders o ON o.id=op.order_id
               WHERE o.branch_id=$1 AND o.received_at >= NOW()-INTERVAL '30 days'
               GROUP BY p.id, p.name
               ORDER BY total_qty DESC LIMIT 5`, [branchId]),
      ]);

      // defective_parts قد لا يكون موجوداً
      const defectiveCount = await query(
        `SELECT COUNT(*) AS count FROM defective_parts
         WHERE branch_id=$1 AND status='waiting'`, [branchId]
      ).catch(() => ({ rows: [{ count: 0 }] }));

      inventory = {
        low_stock:       lowStock.rows,
        defective_count: parseInt(defectiveCount.rows[0].count),
        top_used:        topUsed.rows,
      };
    }

    // ── 7. الموردون ─────────────────────────────────────────
    let suppliers = [];
    if (canTechView || isWarehouse) {
      const { rows } = await query(
        `SELECT s.name, s.phone,
                COUNT(pp.id) AS purchases_count,
                COALESCE(SUM(pp.total_cost),0) AS total_spent,
                MAX(pp.purchased_at) AS last_purchase
         FROM suppliers s
         LEFT JOIN part_purchases pp ON pp.supplier_id=s.id AND pp.branch_id=$1
         WHERE s.branch_id=$1 AND s.is_active=true
         GROUP BY s.id, s.name, s.phone
         ORDER BY total_spent DESC LIMIT 5`, [branchId]
      ).catch(() => ({ rows: [] }));
      suppliers = rows;
    }

    // ── 8. التنبيهات الحرجة ─────────────────────────────────
    const criticalAlerts = await query(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE branch_id=$1 AND priority='critical' AND status='unread'`, [branchId]
    ).then(r => parseInt(r.rows[0]?.count || 0)).catch(() => 0);

    res.json({
      success: true,
      data: {
        role,
        financial,
        revenue_chart:  revenueChart,
        tickets,
        recent_tickets: recentTickets,
        technicians,
        inventory,
        suppliers,
        critical_alerts: criticalAlerts,
      }
    });
  } catch (err) { next(err); }
};

// GET /api/dashboard/revenue
const getRevenueChart = async (req, res, next) => {
  try {
    const { period = 'week' } = req.query;
    const days = period === 'week' ? 7 : 30;
    const headerBranch = req.headers['x-branch-id'];
    const branchId = (headerBranch && headerBranch !== 'all')
      ? headerBranch
      : req.user.branch_id;
    const { rows } = await query(
      `SELECT created_at::date AS day,
              COALESCE(SUM(total),0) AS revenue,
              COALESCE(SUM(vat_amount),0) AS vat,
              COUNT(*) AS count
       FROM invoices
       WHERE branch_id=$1 AND status='paid'
         AND created_at >= NOW()-INTERVAL '${days} days'
       GROUP BY created_at::date
       ORDER BY day ASC`, [req.user.branch_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// Stubs للتوافق مع routes القديمة
const getRevenueReport    = async (req, res, next) => { res.json({ success:true, data:[] }); };
const getTechnicianReport = async (req, res, next) => { res.json({ success:true, data:[] }); };
const getDailyReport      = async (req, res, next) => { res.json({ success:true, data:[] }); };

module.exports = { getDashboard, getRevenueChart, getRevenueReport, getTechnicianReport, getDailyReport };
