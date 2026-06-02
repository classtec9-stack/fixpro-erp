const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, phone, is_active,
        COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled')) as active_orders
       FROM users u LEFT JOIN orders o ON o.technician_id=u.id
       WHERE u.branch_id=$1 AND u.role='technician' GROUP BY u.id ORDER BY u.full_name`,
      [req.user.branch_id]
    );
    res.json({ success: true, data: rows });
  } catch(err) { next(err); }
});
module.exports = router;
