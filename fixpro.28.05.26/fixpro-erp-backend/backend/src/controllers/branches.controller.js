const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/branches — كل الفروع (admin فقط)
const getBranches = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*,
         COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = true) as staff_count,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled','rejected')) as active_orders,
         COUNT(DISTINCT o.id) FILTER (WHERE o.received_at::date = CURRENT_DATE) as today_orders
       FROM branches b
       LEFT JOIN users u ON u.branch_id = b.id
       LEFT JOIN orders o ON o.branch_id = b.id
       GROUP BY b.id
       ORDER BY b.created_at ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/branches — إنشاء فرع
const createBranch = async (req, res, next) => {
  try {
    const { name, address, phone, city } = req.body;
    if (!name) throw new AppError('اسم الفرع مطلوب');

    const { rows } = await query(
      `INSERT INTO branches (name, address, phone, city)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, address || null, phone || null, city || null]
    );

    // إنشاء shop_settings للفرع تلقائياً
    await query(
      `INSERT INTO shop_settings (branch_id, shop_name)
       VALUES ($1, $2) ON CONFLICT (branch_id) DO NOTHING`,
      [rows[0].id, name]
    );

    res.status(201).json({ success: true, message: 'تم إنشاء الفرع', data: rows[0] });
  } catch (err) { next(err); }
};

// PUT /api/branches/:id
const updateBranch = async (req, res, next) => {
  try {
    const { name, address, phone, city, is_active } = req.body;
    const { rows } = await query(
      `UPDATE branches SET name=$1, address=$2, phone=$3, city=$4, is_active=$5
       WHERE id=$6 RETURNING *`,
      [name, address || null, phone || null, city || null, is_active, req.params.id]
    );
    if (!rows.length) throw new AppError('الفرع غير موجود', 404);
    res.json({ success: true, message: 'تم تحديث الفرع', data: rows[0] });
  } catch (err) { next(err); }
};

// GET /api/branches/unified-report — تقرير موحد لكل الفروع
const getUnifiedReport = async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;

    const dateFilter = period === 'today'
      ? "AND o.received_at::date = CURRENT_DATE"
      : period === 'week'
      ? "AND o.received_at >= NOW() - INTERVAL '7 days'"
      : "AND DATE_TRUNC('month', o.received_at) = DATE_TRUNC('month', NOW())";

    // إحصاءات كل فرع
    const { rows: branchStats } = await query(`
      SELECT
        b.id, b.name as branch_name, b.city,
        COUNT(DISTINCT o.id) as total_tickets,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') as completed,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'rejected') as rejected,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled','rejected')) as active,
        COALESCE(SUM(inv.total) FILTER (WHERE inv.status = 'paid'), 0) as revenue,
        COALESCE(SUM(inv.vat_amount) FILTER (WHERE inv.status = 'paid'), 0) as vat_collected,
        COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = true AND u.role = 'technician') as technicians
      FROM branches b
      LEFT JOIN orders o ON o.branch_id = b.id ${dateFilter}
      LEFT JOIN invoices inv ON inv.branch_id = b.id ${dateFilter.replace('o.received_at', 'inv.created_at')}
      LEFT JOIN users u ON u.branch_id = b.id
      WHERE b.is_active = true
      GROUP BY b.id, b.name, b.city
      ORDER BY revenue DESC
    `);

    // إجماليات كل الفروع
    const totals = branchStats.reduce((acc, b) => ({
      total_tickets: acc.total_tickets + parseInt(b.total_tickets || 0),
      completed:     acc.completed     + parseInt(b.completed     || 0),
      rejected:      acc.rejected      + parseInt(b.rejected      || 0),
      active:        acc.active        + parseInt(b.active        || 0),
      revenue:       acc.revenue       + parseFloat(b.revenue     || 0),
      vat_collected: acc.vat_collected + parseFloat(b.vat_collected || 0),
    }), { total_tickets:0, completed:0, rejected:0, active:0, revenue:0, vat_collected:0 });

    // أفضل 5 فنيين عبر كل الفروع
    const { rows: topTechs } = await query(`
      SELECT u.full_name, b.name as branch_name,
        COUNT(o.id) FILTER (WHERE o.status = 'delivered') as completed
      FROM users u
      JOIN branches b ON b.id = u.branch_id
      LEFT JOIN orders o ON o.technician_id = u.id ${dateFilter.replace('o.received_at', 'o.delivered_at')}
      WHERE u.role = 'technician' AND u.is_active = true
      GROUP BY u.id, u.full_name, b.name
      ORDER BY completed DESC
      LIMIT 5
    `);

    // الإيرادات الشهرية لآخر 6 أشهر لكل فرع
    const { rows: revenueChart } = await query(`
      SELECT
        DATE_TRUNC('month', inv.created_at) as month,
        b.name as branch_name,
        SUM(inv.total) as revenue
      FROM invoices inv
      JOIN branches b ON b.id = inv.branch_id
      WHERE inv.status = 'paid'
        AND inv.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `);

    res.json({
      success: true,
      data: {
        period,
        branches:     branchStats,
        totals,
        top_techs:    topTechs,
        revenue_chart: revenueChart,
      }
    });
  } catch (err) { next(err); }
};


// GET /api/branches/overview — ملخص كل فرع للمدير
const getBranchesOverview = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*,
         (SELECT COUNT(*) FROM orders o WHERE o.branch_id=b.id AND o.status NOT IN ('delivered','cancelled')) as active_tickets,
         (SELECT COUNT(*) FROM users u WHERE u.branch_id=b.id AND u.is_active=true) as staff_count,
         (SELECT COUNT(*) FROM parts p WHERE p.branch_id=b.id) as parts_count,
         (SELECT COUNT(*) FROM orders o WHERE o.branch_id=b.id AND DATE(o.received_at)=CURRENT_DATE) as today_tickets
       FROM branches b
       WHERE b.is_active=true
       ORDER BY b.name`
    );
    res.json({ success: true, data: rows });
  } catch(err) { next(err); }
};

module.exports = { getBranches, getBranchesOverview, createBranch, updateBranch, getUnifiedReport };
