const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT n.*, c.full_name as customer_name FROM notifications n
       LEFT JOIN customers c ON c.id=n.customer_id
       WHERE n.order_id IN (SELECT id FROM orders WHERE branch_id=$1)
       ORDER BY n.created_at DESC LIMIT 50`,
      [req.user.branch_id]
    );
    res.json({ success: true, data: rows });
  } catch(err) { next(err); }
});
router.post('/send', async (req, res, next) => {
  try {
    const { order_id, customer_id, channel, recipient, message } = req.body;
    const { rows } = await query(
      `INSERT INTO notifications (order_id, customer_id, sent_by, channel, recipient, message, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [order_id, customer_id, req.user.id, channel, recipient, message]
    );
    res.json({ success: true, message: 'تم تسجيل الإشعار', data: rows[0] });
  } catch(err) { next(err); }
});
module.exports = router;
