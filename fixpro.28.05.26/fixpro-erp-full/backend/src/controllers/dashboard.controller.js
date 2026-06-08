const { query } = require('../config/database');

// helper — نفس النمط في كل controllers
const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id']
    ? null
    : req.user.branch_id;

// بناء شرط الفرع للـ SQL
// إذا branchId = null → بدون فلتر (كل الفروع)
// إذا branchId = UUID → WHERE branch_id = $N
const branchClause = (branchId, alias, paramIndex) =>
  branchId ? `${alias}.branch_id = $${paramIndex}` : 'TRUE';

// GET /api/dashboard
const getDashboard = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const p = branchId ? [branchId] : [];
    const bc = branchId ? '$1' : null; // branch param placeholder

    const [ordersToday, activeOrders, monthRevenue, lowStock, recentOrders, techPerf] =
      await Promise.all([
        // تذاكر اليوم
        query(
          `SELECT COUNT(*) FROM orders
           WHERE ${bc ? `branch_id=${bc} AND` : ''}
                 received_at::date = CURRENT_DATE`,
          p
        ),
        // تذاكر نشطة
        query(
          `SELECT COUNT(*) FROM orders
           WHERE ${bc ? `branch_id=${bc} AND` : ''}
                 status NOT IN ('delivered','cancelled')`,
          p
        ),
        // إيرادات الشهر
        query(
          `SELECT COALESCE(SUM(total),0) as revenue FROM invoices
           WHERE ${bc ? `branch_id=${bc} AND` : ''}
                 status='paid'
                 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
          p
        ),
        // مخزون منخفض
        query(
          `SELECT COUNT(*) FROM parts
           WHERE ${bc ? `branch_id=${bc} AND` : ''}
                 quantity <= min_quantity AND is_active=true`,
          p
        ),
        // آخر التذاكر
        query(
          `SELECT o.order_number, o.status, o.priority, o.received_at,
                  c.full_name as customer_name, d.brand, d.model
           FROM orders o
           JOIN customers c ON c.id=o.customer_id
           JOIN devices d ON d.id=o.device_id
           WHERE ${bc ? `o.branch_id=${bc}` : 'TRUE'}
           ORDER BY o.received_at DESC LIMIT 8`,
          p
        ),
        // أداء الفنيين اليوم
        query(
          `SELECT u.full_name, u.id,
                  COUNT(o.id) FILTER (WHERE o.status NOT IN ('new','cancelled')) as active_orders,
                  COUNT(o.id) FILTER (WHERE o.status = 'delivered'
                    AND o.delivered_at::date = CURRENT_DATE) as completed_today
           FROM users u
           LEFT JOIN orders o ON o.technician_id=u.id
             ${bc ? `AND o.branch_id=${bc}` : ''}
           WHERE ${bc ? `u.branch_id=${bc} AND` : ''}
                 u.role='technician' AND u.is_active=true
           GROUP BY u.id, u.full_name
           ORDER BY active_orders DESC`,
          p
        ),
      ]);

    // توزيع الحالات
    const { rows: statusBreakdown } = await query(
      `SELECT status, COUNT(*) as count
       FROM orders
       WHERE ${bc ? `branch_id=${bc} AND` : ''}
             status NOT IN ('delivered','cancelled')
       GROUP BY status`,
      p
    );

    res.json({
      success: true,
      data: {
        stats: {
          orders_today:     parseInt(ordersToday.rows[0].count),
          active_orders:    parseInt(activeOrders.rows[0].count),
          month_revenue:    parseFloat(monthRevenue.rows[0].revenue),
          low_stock_alerts: parseInt(lowStock.rows[0].count),
        },
        recent_orders:    recentOrders.rows,
        technicians:      techPerf.rows,
        status_breakdown: statusBreakdown,
      }
    });
  } catch (err) { next(err); }
};

// GET /api/reports/revenue?period=monthly&year=2025
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

// GET /api/reports/technicians?month=&year=
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

// GET /api/reports/daily
// يُستخدم في ReportsPage → تبويب "تقرير اليوم"
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

module.exports = { getDashboard, getRevenueReport, getTechnicianReport, getDailyReport };
