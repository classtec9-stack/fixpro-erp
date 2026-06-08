const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/settings/shop
const getShopSettings = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT key, value FROM shop_settings WHERE branch_id = $1`,
      [req.user.branch_id]
    );
    // تحويل Array → Object
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
};

// PUT /api/settings/shop
const updateShopSettings = async (req, res, next) => {
  try {
    const allowed = [
      'shop_name','shop_phone','shop_address','shop_city',
      'shop_logo_url','receipt_footer','warranty_terms','invoice_template',
      'vat_number','commercial_register'
    ];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!updates.length) throw new AppError('لا توجد بيانات للتحديث');

    for (const [key, value] of updates) {
      await query(
        `INSERT INTO shop_settings (branch_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (branch_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
        [req.user.branch_id, key, value]
      );
    }
    res.json({ success: true, message: 'تم حفظ إعدادات المحل' });
  } catch (err) { next(err); }
};

// POST /api/settings/logo  — رفع الشعار (base64)
const uploadLogo = async (req, res, next) => {
  try {
    const { logo_base64 } = req.body;
    if (!logo_base64) throw new AppError('الشعار مطلوب');
    if (logo_base64.length > 500000) throw new AppError('حجم الصورة كبير جداً (الحد 500KB)');

    await query(
      `INSERT INTO shop_settings (branch_id, key, value)
       VALUES ($1, 'shop_logo_url', $2)
       ON CONFLICT (branch_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [req.user.branch_id, logo_base64]
    );
    res.json({ success: true, message: 'تم رفع الشعار بنجاح', logo_url: logo_base64 });
  } catch (err) { next(err); }
};

module.exports = { getShopSettings, updateShopSettings, uploadLogo };
