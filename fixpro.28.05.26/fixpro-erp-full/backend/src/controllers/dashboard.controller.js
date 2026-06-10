// backend/src/controllers/dashboard.controller.js
// داش بورد شاملة لكل النظام — بدون transactions
const { query } = require('../config/database');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id']
    ? null
    : req.user.branch_id;

// ── GET /api/dashboard ────────────────────────────────────
const getDashboard = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const p  = branchId ? [branchId] : [];
    const bc = branchId ? '$1' : null;
    const W  = (alias = '') => bc
      ? `${alias ? alias + '.' : ''}branch_id = ${bc} AND`
      : '';

    // ═══ المجموعة الأولى: المالية + التذاكر ═══
    const [
      financial, ticketStats, statusBreakdown, recentTickets
    ] = await Promise.all([

      // المالية: اليوم، الشهر، الشهر الماضي، الذمم
      query(
        `SELECT
           COALESCE(SUM(total) FILTER (WHERE status='paid'
             AND created_at::date = CURRENT_DATE), 0)                              as today_revenue,
           COALESCE(SUM(total) FILTER (WHERE status='paid'
             AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())), 0) as month_revenue,
           COALESCE(SUM(total) FILTER (WHERE status='paid'
             AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')), 0) as last_month_revenue,
           COALESCE(SUM(balance_due) FILTER (WHERE status IN ('pending','partial')), 0) as pending_balance,
           COUNT(*) FILTER (WHERE status IN ('pending','partial'))                 as pending_invoices,
           COUNT(*) FILTER (WHERE status='paid'
             AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()))     as paid_invoices
         FROM invoices WHERE ${W()} TRUE`,
        p
      ),

      // التذاكر: اليوم، نشطة، عاجلة
      query(
        `SELECT
           COUNT(*) FILTER (WHERE received_at::date = CURRENT_DATE)        as today,
           COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled','rejected')) as active,
           COUNT(*) FILTER (WHERE priority='urgent'
             AND status NOT IN ('delivered','cancelled','rejected'))       as urgent
         FROM orders WHERE ${W()} TRUE`,
        p
      ),

      // توزيع الحالات
      query(
        `SELECT status, COUNT(*) as count
         FROM orders
         WHERE ${W()} status NOT IN ('delivered','cancelled')
         GROUP BY status`,
        p
      ),

      // آخر 8 تذاكر
      query(
        `SELECT o.id, o.order_number, o.status, o.priority, o.received_at,
                c.full_name as customer_name, d.brand, d.model
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         JOIN devices   d ON d.id = o.device_id
         WHERE ${W('o')} TRUE
         ORDER BY o.received_at DESC LIMIT 8`,
        p
      ),
    ]);

    // ═══ المجموعة الثانية: الفنيون + المخزون ═══
    const [
      technicians, lowStock, defectiveCount, topUsedParts
    ] = await Promise.all([

      // أداء الفنيين
      query(
        `SELECT u.id, u.full_name,
           COUNT(o.id) FILTER (WHERE o.status NOT IN ('new','delivered','cancelled','rejected')) as active,
           COUNT(o.id) FILTER (WHERE o.status='delivered'
             AND o.delivered_at::date = CURRENT_DATE)                       as done_today,
           COUNT(o.id) FILTER (WHERE o.status='delivered'
             AND DATE_TRUNC('month', o.delivered_at) = DATE_TRUNC('month', NOW())) as done_month,
           ROUND(AVG(EXTRACT(EPOCH FROM (o.completed_at - o.received_at))/3600)
             FILTER (WHERE o.completed_at IS NOT NULL)::numeric, 1)         as avg_hours
         FROM users u
         LEFT JOIN orders o ON o.technician_id = u.id ${bc ? `AND o.branch_id = ${bc}` : ''}
         WHERE ${W('u')} u.role = 'technician' AND u.is_active = true
         GROUP BY u.id, u.full_name
         ORDER BY done_month DESC`,
        p
      ),

      // مخزون منخفض
      query(
        `SELECT id, name, quantity, min_quantity
         FROM parts
         WHERE ${W()} quantity <= min_quantity AND is_active = true
         ORDER BY (quantity::float / NULLIF(min_quantity,0)) ASC
         LIMIT 8`,
        p
      ),

      // توالف بانتظار
      query(
        `SELECT COUNT(*) FROM defective_parts WHERE ${W()} status = 'waiting'`,
        p
      ),

      // أكثر القطع استخداماً هذا الشهر
      query(
        `SELECT pt.name, SUM(op.quantity) as total_qty
         FROM order_parts op
         JOIN parts  pt ON pt.id = op.part_id
         JOIN orders o  ON o.id  = op.order_id
         WHERE ${W('o')} DATE_TRUNC('month', op.created_at) = DATE_TRUNC('month', NOW())
         GROUP BY pt.name
         ORDER BY total_qty DESC LIMIT 5`,
        p
      ),
    ]);

    // ═══ المجموعة الثالثة: الموردون + العمليات ═══
    const [
      topSuppliers, operations, criticalAlerts
    ] = await Promise.all([

      // أعلى الموردين (من أوامر الشراء)
      query(
        `SELECT s.name,
                COUNT(po.id)                as purchases_count,
                COALESCE(SUM(po.total), 0)  as total_spent
         FROM suppliers s
         JOIN purchase_orders po ON po.supplier_id = s.id
           ${bc ? `AND po.branch_id = ${bc}` : ''}
         WHERE po.status NOT IN ('cancelled','draft')
         GROUP BY s.id, s.name
         ORDER BY total_spent DESC LIMIT 5`,
        p
      ),

      // العمليات المعلقة في كل النظام
      query(
        `SELECT
           (SELECT COUNT(*) FROM appointments
            WHERE ${W()} appointment_date::date = CURRENT_DATE
              AND status NOT IN ('cancelled','completed'))                  as appointments_today,
           (SELECT COUNT(*) FROM quotations
            WHERE ${W()} status IN ('draft','sent'))                        as pending_quotations,
           (SELECT COUNT(*) FROM purchase_orders
            WHERE ${W()} status IN ('sent','confirmed','partially_received')) as pending_pos,
           (SELECT COUNT(*) FROM part_requests
            WHERE ${W()} status = 'pending')                                as pending_part_requests,
           (SELECT COUNT(*) FROM warranty_claims
            WHERE ${W()} DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())) as warranty_month,
           (SELECT COUNT(*) FROM customers
            WHERE ${W()} DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())) as new_customers`,
        p
      ),

      // تنبيهات حرجة: تذاكر عاجلة + مخزون صفر + فواتير متأخرة
      query(
        `SELECT
           (SELECT COUNT(*) FROM orders
            WHERE ${W()} priority = 'urgent'
              AND status NOT IN ('delivered','cancelled','rejected'))       as urgent_tickets,
           (SELECT COUNT(*) FROM parts
            WHERE ${W()} quantity = 0 AND is_active = true)                 as out_of_stock`,
        p
      ),
    ]);

    const f = financial.rows[0];
    const lastMonth = parseFloat(f.last_month_revenue);
    const thisMonth = parseFloat(f.month_revenue);
    const growthPct = lastMonth > 0
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : (thisMonth > 0 ? 100 : 0);

    const alerts = criticalAlerts.rows[0];
    const critical = parseInt(alerts.urgent_tickets) + parseInt(alerts.out_of_stock);

    res.json({
      success: true,
      data: {
        critical_alerts: critical,
        financial: {
          today_revenue:    parseFloat(f.today_revenue),
          month_revenue:    thisMonth,
          growth_pct:       growthPct,
          pending_balance:  parseFloat(f.pending_balance),
          pending_invoices: parseInt(f.pending_invoices),
          paid_invoices:    parseInt(f.paid_invoices),
        },
        tickets: {
          today:  parseInt(ticketStats.rows[0].today),
          active: parseInt(ticketStats.rows[0].active),
          urgent: parseInt(ticketStats.rows[0].urgent),
          by_status: statusBreakdown.rows,
        },
        recent_tickets: recentTickets.rows,
        technicians:    technicians.rows,
        inventory: {
          low_stock:       lowStock.rows,
          defective_count: parseInt(defectiveCount.rows[0].count),
          top_used:        topUsedParts.rows,
        },
        suppliers:  topSuppliers.rows,
        operations: {
          appointments_today:    parseInt(operations.rows[0].appointments_today    || 0),
          pending_quotations:    parseInt(operations.rows[0].pending_quotations    || 0),
          pending_pos:           parseInt(operations.rows[0].pending_pos           || 0),
          pending_part_requests: parseInt(operations.rows[0].pending_part_requests || 0),
          warranty_month:        parseInt(operations.rows[0].warranty_month        || 0),
          new_customers:         parseInt(operations.rows[0].new_customers         || 0),
        },
      }
    });
  } catch (err) { next(err); }
};

// ── GET /api/dashboard/revenue?period=week|month ──────────
const getRevenueChart = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const { period = 'week' } = req.query;
    const days = period === 'month' ? 30 : 7;

    const params = [days];
    const branchFilter = branchId
      ? (params.push(branchId), `AND i.branch_id = $${params.length}`)
      : '';

    // أيام متتالية حتى الفارغة منها تظهر صفراً
    const { rows } = await query(
      `SELECT d.day::date as period,
              COALESCE(SUM(i.total), 0) as revenue
       FROM generate_series(
              CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day',
              CURRENT_DATE,
              INTERVAL '1 day'
            ) as d(day)
       LEFT JOIN invoices i
         ON i.created_at::date = d.day::date
        AND i.status = 'paid'
        ${branchFilter}
       GROUP BY d.day
       ORDER BY d.day`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};


// ── GET /api/reports/revenue?period=monthly&year= ─────────
const getRevenueReport = async (req, res, next) => {
  try {
    const { period = 'monthly', year = new Date().getFullYear() } = req.query;
    const branchId = getBranchId(req);

    const groupBy = period === 'daily' ? "DATE(created_at)" : "DATE_TRUNC('month', created_at)";

    const params = [year];
    const branchFilter = branchId
      ? (params.push(branchId), `AND branch_id = $${params.length}`)
      : '';

    const { rows } = await query(
      `SELECT
         ${groupBy} as period,
         COUNT(*) as invoice_count,
         SUM(total) as revenue,
         SUM(vat_amount) as vat_collected
       FROM invoices
       WHERE status='paid'
         AND EXTRACT(YEAR FROM created_at) = $1
         ${branchFilter}
       GROUP BY 1 ORDER BY 1`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// ── GET /api/reports/technicians?month=&year= ─────────────
const getTechnicianReport = async (req, res, next) => {
  try {
    const { month, year = new Date().getFullYear() } = req.query;
    const branchId = getBranchId(req);

    const params = [year];
    const branchFilter = branchId
      ? (params.push(branchId), `AND u.branch_id = $${params.length}`)
      : '';
    const monthFilter = month
      ? (params.push(month), `AND EXTRACT(MONTH FROM o.received_at) = $${params.length}`)
      : '';

    const { rows } = await query(
      `SELECT
         u.full_name, u.id,
         COUNT(o.id) as total_orders,
         COUNT(o.id) FILTER (WHERE o.status='delivered') as completed,
         ROUND(AVG(
           EXTRACT(EPOCH FROM (o.completed_at - o.received_at))/3600
         )::numeric, 1) as avg_hours,
         COALESCE(SUM(i.total),0) as revenue_generated
       FROM users u
       LEFT JOIN orders o ON o.technician_id=u.id
         AND EXTRACT(YEAR FROM o.received_at) = $1
         ${monthFilter}
       LEFT JOIN invoices i ON i.order_id=o.id AND i.status='paid'
       WHERE u.role='technician'
         ${branchFilter}
       GROUP BY u.id, u.full_name
       ORDER BY completed DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// ── GET /api/reports/daily ────────────────────────────────
const getDailyReport = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const p = branchId ? [branchId] : [];
    const bc = branchId ? '$1' : null;

    const [tickets, techPerf] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE received_at::date = CURRENT_DATE) as today_tickets,
           COUNT(*) FILTER (WHERE status = 'delivered' AND delivered_at::date = CURRENT_DATE) as completed_today,
           COUNT(*) FILTER (WHERE status = 'cancelled' AND updated_at::date = CURRENT_DATE) as rejected_today,
           COUNT(*) FILTER (WHERE status = 'ready') as ready_count
         FROM orders
         WHERE ${bc ? `branch_id=${bc}` : 'TRUE'}`,
        p
      ),
      query(
        `SELECT u.full_name, u.id,
                COUNT(o.id) FILTER (WHERE o.status NOT IN ('new','cancelled')) as active_orders,
                COUNT(o.id) FILTER (WHERE o.status='delivered'
                  AND o.delivered_at::date = CURRENT_DATE) as completed_today
         FROM users u
         LEFT JOIN orders o ON o.technician_id=u.id
           ${bc ? `AND o.branch_id=${bc}` : ''}
         WHERE ${bc ? `u.branch_id=${bc} AND` : ''}
               u.role='technician' AND u.is_active=true
         GROUP BY u.id, u.full_name
         ORDER BY completed_today DESC`,
        p
      ),
    ]);

    res.json({
      success: true,
      data: {
        ...tickets.rows[0],
        tech_performance: techPerf.rows,
      }
    });
  } catch (err) { next(err); }
};

module.exports = {
  getDashboard, getRevenueChart,
  getRevenueReport, getTechnicianReport, getDailyReport
};
