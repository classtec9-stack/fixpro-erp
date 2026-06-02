const { query } = require('../config/database');

// GET /api/dashboard
const getDashboard = async (req, res, next) => {
  try {
    const branchId = req.user.branch_id;

    const [ordersToday, activeOrders, monthRevenue, lowStock, recentOrders, techPerf] =
      await Promise.all([
        // Orders created today
        query(
          `SELECT COUNT(*) FROM orders WHERE branch_id=$1 AND received_at::date = CURRENT_DATE`,
          [branchId]
        ),
        // Active orders (not delivered/cancelled)
        query(
          `SELECT COUNT(*) FROM orders WHERE branch_id=$1 AND status NOT IN ('delivered','cancelled')`,
          [branchId]
        ),
        // Revenue this month (paid invoices)
        query(
          `SELECT COALESCE(SUM(total),0) as revenue FROM invoices
           WHERE branch_id=$1 AND status='paid'
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
          [branchId]
        ),
        // Low stock count
        query(
          'SELECT COUNT(*) FROM parts WHERE branch_id=$1 AND quantity <= min_quantity AND is_active=true',
          [branchId]
        ),
        // Recent orders
        query(
          `SELECT o.order_number, o.status, o.priority, o.received_at,
                  c.full_name as customer_name, d.brand, d.model
           FROM orders o
           JOIN customers c ON c.id=o.customer_id
           JOIN devices d ON d.id=o.device_id
           WHERE o.branch_id=$1
           ORDER BY o.received_at DESC LIMIT 8`,
          [branchId]
        ),
        // Technician performance today
        query(
          `SELECT u.full_name, u.id,
                  COUNT(o.id) FILTER (WHERE o.status NOT IN ('new','cancelled')) as active_orders,
                  COUNT(o.id) FILTER (WHERE o.status = 'delivered'
                    AND o.delivered_at::date = CURRENT_DATE) as completed_today
           FROM users u
           LEFT JOIN orders o ON o.technician_id=u.id AND o.branch_id=$1
           WHERE u.branch_id=$1 AND u.role='technician' AND u.is_active=true
           GROUP BY u.id, u.full_name
           ORDER BY active_orders DESC`,
          [branchId]
        ),
      ]);

    // Orders by status
    const { rows: statusBreakdown } = await query(
      `SELECT status, COUNT(*) as count
       FROM orders WHERE branch_id=$1 AND status NOT IN ('delivered','cancelled')
       GROUP BY status`,
      [branchId]
    );

    res.json({
      success: true,
      data: {
        stats: {
          orders_today:    parseInt(ordersToday.rows[0].count),
          active_orders:   parseInt(activeOrders.rows[0].count),
          month_revenue:   parseFloat(monthRevenue.rows[0].revenue),
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

    const groupBy = period === 'daily' ? "DATE(created_at)" : "DATE_TRUNC('month', created_at)";

    const { rows } = await query(
      `SELECT
         ${groupBy} as period,
         COUNT(*) as invoice_count,
         SUM(total) as revenue,
         SUM(vat_amount) as vat_collected
       FROM invoices
       WHERE branch_id=$1 AND status='paid'
         AND EXTRACT(YEAR FROM created_at) = $2
       GROUP BY 1 ORDER BY 1`,
      [req.user.branch_id, year]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// GET /api/reports/technicians
const getTechnicianReport = async (req, res, next) => {
  try {
    const { month, year = new Date().getFullYear() } = req.query;

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
         AND EXTRACT(YEAR FROM o.received_at)=$2
         ${month ? 'AND EXTRACT(MONTH FROM o.received_at)=$3' : ''}
       LEFT JOIN invoices i ON i.order_id=o.id AND i.status='paid'
       WHERE u.branch_id=$1 AND u.role='technician'
       GROUP BY u.id, u.full_name
       ORDER BY completed DESC`,
      month ? [req.user.branch_id, year, month] : [req.user.branch_id, year]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

module.exports = { getDashboard, getRevenueReport, getTechnicianReport };
