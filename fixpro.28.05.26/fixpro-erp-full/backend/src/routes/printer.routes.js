const router = require('express').Router();
const { query } = require('../config/database');
const { getSystemPrinters } = require('../services/printer.service');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

// GET /api/printers — قائمة الطابعات المتصلة
router.get('/', async (req, res, next) => {
  try {
    const printers = await getSystemPrinters();
    res.json({ success: true, data: printers });
  } catch(err) {
    res.json({ success: true, data: [], message: 'تعذّر جلب الطابعات: ' + err.message });
  }
});

// GET /api/printers/settings — إعدادات الطابعات المحفوظة
router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT receipt_printer, label_printer FROM shop_settings WHERE branch_id=$1',
      [req.user.branch_id]
    );
    res.json({ success: true, data: rows[0] || {} });
  } catch(err) { next(err); }
});

// PUT /api/printers/settings — حفظ إعدادات الطابعات
router.put('/settings', authorize('admin','branch_manager'), async (req, res, next) => {
  try {
    const { receipt_printer, label_printer } = req.body;
    await query(
      `UPDATE shop_settings
       SET receipt_printer=$1, label_printer=$2, updated_at=NOW()
       WHERE branch_id=$3`,
      [receipt_printer || null, label_printer || null, req.user.branch_id]
    );
    res.json({ success: true, message: 'تم حفظ إعدادات الطابعات' });
  } catch(err) { next(err); }
});

module.exports = router;
