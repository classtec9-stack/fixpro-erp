const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET /api/technicians — يجلب كل المستخدمين بدور technician
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.role,
         COUNT(o.id) FILTER (
           WHERE o.status NOT IN ('delivered','cancelled','rejected')
         ) as active_orders
       FROM users u
       LEFT JOIN orders o ON o.technician_id = u.id
       WHERE u.branch_id = $1
         AND u.role = 'technician'
         AND u.is_active = true
       GROUP BY u.id
       ORDER BY u.full_name`,
      [req.user.branch_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
