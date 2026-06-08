const { query } = require('../config/database');

const getBranchId = (req) =>
  req.user.role === 'admin' && !req.headers['x-branch-id'] ? null : req.user.branch_id;

const branchFilter = (branchId, alias, paramIdx) =>
  branchId ? `AND ${alias}.branch_id = $${paramIdx}` : '';

// GET /api/reports/profitability — ربحية كل تذكرة
const getProfitabilityReport = async (req, res, next) => {
  try {
    const { date_from, date_to, technician_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const branchId = getBranchId(req);
    const params = [];
    const conds = [];

    if (branchId)      { params.push(branchId);      conds.push(`o.branch_id = $${params.length}`); }
    if (date_from)     { params.push(date_from);     conds.push(`i.created_at >= $${params.length}`); }
    if (date_to)       { params.push(date_to);       conds.push(`i.created_at <= $${params.length}`); }
    if (technician_id) { params.push(technician_id); conds.push(`o.technician_id = $${params.length}`); }
    conds.push(`i.status IN ('paid','partial')`);

    const where = `WHERE ${conds.join(' AND ')}`;
    const count = await query(
      `SELECT COUNT(*) FROM invoices i JOIN orders o ON o.id=i.order_id ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT
         o.order_number, o.received_at, o.delivered_at,
         c.full_name as customer_name,
         d.brand, d.model, d.device_type,
         u.full_name as technician_name,
         i.total as revenue,
         i.parts_cost,
         i.labor_cost,
         i.vat_amount,
         i.paid_amount,
         -- تكلفة القطع بسعر الشراء
         COALESCE((
           SELECT SUM(op.quantity * p.avg_cost)
           FROM order_parts op JOIN parts p ON p.id=op.part_id
           WHERE op.order_id = o.id
         ), 0) as parts_cogs,
         -- تكلفة الفني (الساعات × سعر الساعة)
         COALESCE(
           EXTRACT(EPOCH FROM (o.delivered_at - o.received_at))/3600 * COALESCE(u.hourly_rate, 0),
           0
         ) as labor_cost_actual,
         -- الربح الإجمالي
         i.total - COALESCE((
           SELECT SUM(op.quantity * p.avg_cost)
           FROM order_parts op JOIN parts p ON p.id=op.part_id
           WHERE op.order_id = o.id
         ), 0) as gross_profit
       FROM invoices i
       JOIN orders    o ON o.id = i.order_id
       JOIN customers c ON c.id = o.customer_id
       JOIN devices   d ON d.id = o.device_id
       LEFT JOIN users u ON u.id = o.technician_id
       ${where}
       ORDER BY gross_profit DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    // ملخص
    const summary = rows.reduce((acc, r) => ({
      total_revenue:    acc.total_revenue + parseFloat(r.revenue || 0),
      total_parts_cogs: acc.total_parts_cogs + parseFloat(r.parts_cogs || 0),
      total_profit:     acc.total_profit + parseFloat(r.gross_profit || 0),
    }), { total_revenue: 0, total_parts_cogs: 0, total_profit: 0 });

    summary.margin_pct = summary.total_revenue > 0
      ? +((summary.total_profit / summary.total_revenue) * 100).toFixed(1) : 0;

    res.json({
      success: true, data: rows, summary,
      pagination: { total: parseInt(count.rows[0].count), page: Number(page), limit: Number(limit) }
    });
  } catch (err) { next(err); }
};

// GET /api/reports/technician-performance
const getTechnicianPerformance = async (req, res, next) => {
  try {
    const { month, year = new Date().getFullYear() } = req.query;
    const branchId = getBranchId(req);
    const params = [year];
    const bFilter = branchId ? (params.push(branchId), `AND u.branch_id = $${params.length}`) : '';
    const mFilter = month ? (params.push(month), `AND EXTRACT(MONTH FROM o.received_at) = $${params.length}`) : '';

    const { rows } = await query(
      `SELECT
         u.id, u.full_name, u.hourly_rate, u.specialty,
         COUNT(o.id) FILTER (WHERE o.status='delivered') as completed,
         COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled')) as active,
         COUNT(o.id) FILTER (WHERE o.ticket_category='warranty') as warranty_count,
         ROUND(AVG(
           EXTRACT(EPOCH FROM (o.delivered_at - o.received_at))/3600
         ) FILTER (WHERE o.status='delivered')::numeric, 1) as avg_repair_hours,
         COALESCE(SUM(i.total) FILTER (WHERE i.status='paid'), 0) as revenue_generated,
         COALESCE(SUM(i.total - COALESCE((
           SELECT SUM(op2.quantity * p2.avg_cost)
           FROM order_parts op2 JOIN parts p2 ON p2.id=op2.part_id
           WHERE op2.order_id=o.id
         ),0)) FILTER (WHERE i.status='paid'), 0) as profit_generated
       FROM users u
       LEFT JOIN orders o ON o.technician_id=u.id
         AND EXTRACT(YEAR FROM o.received_at) = $1
         ${mFilter}
       LEFT JOIN invoices i ON i.order_id=o.id
       WHERE u.role='technician' AND u.is_active=true
         ${bFilter}
       GROUP BY u.id, u.full_name, u.hourly_rate, u.specialty
       ORDER BY revenue_generated DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// GET /api/reports/inventory-valuation — تقييم المخزون
const getInventoryValuation = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const params = branchId ? [branchId] : [];
    const bCond = branchId ? 'WHERE p.branch_id = $1 AND' : 'WHERE';

    const { rows } = await query(
      `SELECT
         p.id, p.name, p.sku, p.category, p.quantity,
         p.cost_price, p.avg_cost, p.sell_price,
         p.quantity * p.avg_cost as stock_value_cost,
         p.quantity * p.sell_price as stock_value_sell,
         p.quantity * (p.sell_price - p.avg_cost) as potential_profit,
         p.quantity <= p.min_quantity as is_low_stock,
         s.name as supplier_name
       FROM parts p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       ${bCond} p.is_active = true
       ORDER BY stock_value_cost DESC`,
      params
    );

    const summary = rows.reduce((acc, r) => ({
      total_items:       acc.total_items + 1,
      total_cost_value:  acc.total_cost_value  + parseFloat(r.stock_value_cost || 0),
      total_sell_value:  acc.total_sell_value  + parseFloat(r.stock_value_sell || 0),
      potential_profit:  acc.potential_profit  + parseFloat(r.potential_profit || 0),
      low_stock_count:   acc.low_stock_count   + (r.is_low_stock ? 1 : 0),
    }), { total_items: 0, total_cost_value: 0, total_sell_value: 0, potential_profit: 0, low_stock_count: 0 });

    res.json({ success: true, data: rows, summary });
  } catch (err) { next(err); }
};

// GET /api/reports/customer-insights — تحليل العملاء
const getCustomerInsights = async (req, res, next) => {
  try {
    const branchId = getBranchId(req);
    const params = branchId ? [branchId] : [];
    const bCond = branchId ? 'WHERE c.branch_id = $1' : '';

    const { rows } = await query(
      `SELECT
         c.id, c.full_name, c.phone, c.loyalty_points, c.loyalty_tier, c.is_vip,
         c.total_spent,
         COUNT(o.id) as total_orders,
         COUNT(o.id) FILTER (WHERE o.ticket_category='warranty') as warranty_claims,
         MAX(o.received_at) as last_visit,
         MIN(o.received_at) as first_visit,
         AVG(i.total) FILTER (WHERE i.status='paid') as avg_ticket_value,
         COUNT(DISTINCT d.id) as devices_count
       FROM customers c
       LEFT JOIN orders    o ON o.customer_id = c.id
       LEFT JOIN invoices  i ON i.order_id = o.id
       LEFT JOIN devices   d ON d.customer_id = c.id
       ${bCond}
       GROUP BY c.id
       HAVING COUNT(o.id) > 0
       ORDER BY c.total_spent DESC
       LIMIT 100`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

module.exports = {
  getProfitabilityReport, getTechnicianPerformance,
  getInventoryValuation, getCustomerInsights
};
