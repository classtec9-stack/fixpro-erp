const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
    const type   = req.query.type   || null;
    const unread = req.query.unread === 'true';

    const params = [req.user.id.toString(), limit];
    const conds  = [`n.recipient = $1`, `n.channel = 'internal'`];

    if (type) {
      params.splice(1, 0, type);
      conds.push(`n.type = $2`);
    }
    if (unread) conds.push(`n.is_read = false`);

    const where = `WHERE ${conds.join(' AND ')}`;

    const { rows } = await query(
      `SELECT n.*,
              o.order_number,
              cb.full_name as claimed_by_name
       FROM notifications n
       LEFT JOIN orders o ON o.id = n.order_id
       LEFT JOIN users  cb ON cb.id = n.claimed_by
       ${where}
       ORDER BY n.is_read ASC, n.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({
      success: true,
      data:    rows,
      unread:  rows.filter(r => !r.is_read).length,
    });
  } catch (err) { next(err); }
});

// GET /api/notifications/count
router.get('/count', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COUNT(*) FROM notifications
       WHERE recipient = $1 AND channel = 'internal' AND is_read = false`,
      [req.user.id.toString()]
    );
    res.json({ success: true, count: parseInt(rows[0].count) });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW()
       WHERE recipient = $1 AND channel = 'internal' AND is_read = false`,
      [req.user.id.toString()]
    );
    res.json({ success: true, updated: rowCount });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE id = $1 AND recipient = $2`,
      [req.params.id, req.user.id.toString()]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/claim — قفل الإشعار بعد اتخاذ إجراء
router.patch('/:id/claim', async (req, res, next) => {
  try {
    const { action_taken } = req.body;

    // تحقق من وجود الإشعار وانتمائه للمستخدم
    const { rows: existing } = await query(
      `SELECT n.id, n.claimed_by, n.action_taken, u.full_name as claimed_by_name
       FROM notifications n
       LEFT JOIN users u ON u.id = n.claimed_by
       WHERE n.id = $1 AND n.recipient = $2`,
      [req.params.id, req.user.id.toString()]
    );
    if (!existing.length)
      return res.status(404).json({ success: false, message: 'الإشعار غير موجود أو لا يخصك' });

    // هل مقفول مسبقاً؟
    if (existing[0].claimed_by) {
      const { rows: claimer } = await query(
        'SELECT full_name FROM users WHERE id = $1',
        [existing[0].claimed_by]
      );
      return res.status(409).json({
        success: false,
        already_claimed: true,
        message: `تم اتخاذ إجراء بالفعل بواسطة: ${claimer[0]?.full_name || 'موظف آخر'}`,
        claimed_by_name: claimer[0]?.full_name,
        action_taken: existing[0].action_taken,
      });
    }

    await query(
      `UPDATE notifications SET
         claimed_by   = $1,
         claimed_at   = NOW(),
         action_taken = $2,
         is_read      = true,
         read_at      = NOW()
       WHERE id = $3`,
      [req.user.id, action_taken || 'تم اتخاذ إجراء', req.params.id]
    );

    res.json({ success: true, message: 'تم قفل الإشعار' });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/old — حذف إشعارات قديمة مقروءة (تنظيف)
router.delete('/old', authorize('admin', 'branch_manager'), async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { rowCount } = await query(
      `DELETE FROM notifications
       WHERE channel = 'internal'
         AND is_read = true
         AND created_at < NOW() - ($1 || ' days')::INTERVAL`,
      [days]
    );
    res.json({ success: true, deleted: rowCount, message: `حُذف ${rowCount} إشعار قديم` });
  } catch (err) { next(err); }
});

module.exports = router;
