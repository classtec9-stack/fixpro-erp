const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/shop-settings
const getSettings = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, b.name as branch_name
       FROM shop_settings s
       JOIN branches b ON b.id = s.branch_id
       WHERE s.branch_id = $1`,
      [req.user.branch_id]
    );

    // إذا لم توجد إعدادات، أنشئها تلقائياً
    if (!rows.length) {
      const { rows: newRows } = await query(
        `INSERT INTO shop_settings (branch_id, shop_name, track_url)
         SELECT $1, name, 'fixpro.sa/track' FROM branches WHERE id = $1
         RETURNING *`,
        [req.user.branch_id]
      );
      return res.json({ success: true, data: newRows[0] || {} });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// PUT /api/shop-settings
const updateSettings = async (req, res, next) => {
  try {
    const {
      shop_name, shop_name_en, phone, phone2, email,
      address, city, tax_number, website,
      invoice_footer, invoice_terms, track_url,
      receipt_width, label_width, label_height, logo_url
    } = req.body;

    // upsert
    const { rows } = await query(
      `INSERT INTO shop_settings
         (branch_id, shop_name, shop_name_en, phone, phone2, email,
          address, city, tax_number, website,
          invoice_footer, invoice_terms, track_url,
          receipt_width, label_width, label_height, logo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (branch_id) DO UPDATE SET
         shop_name       = EXCLUDED.shop_name,
         shop_name_en    = EXCLUDED.shop_name_en,
         phone           = EXCLUDED.phone,
         phone2          = EXCLUDED.phone2,
         email           = EXCLUDED.email,
         address         = EXCLUDED.address,
         city            = EXCLUDED.city,
         tax_number      = EXCLUDED.tax_number,
         website         = EXCLUDED.website,
         invoice_footer  = EXCLUDED.invoice_footer,
         invoice_terms   = EXCLUDED.invoice_terms,
         track_url       = EXCLUDED.track_url,
         receipt_width   = EXCLUDED.receipt_width,
         label_width     = EXCLUDED.label_width,
         label_height    = EXCLUDED.label_height,
         logo_url        = COALESCE(EXCLUDED.logo_url, shop_settings.logo_url),
         updated_at      = NOW()
       RETURNING *`,
      [
        req.user.branch_id,
        shop_name, shop_name_en, phone, phone2, email,
        address, city, tax_number, website,
        invoice_footer, invoice_terms, track_url || 'fixpro.sa/track',
        receipt_width || 80, label_width || 50, label_height || 25,
        logo_url || null
      ]
    );

    res.json({ success: true, message: 'تم حفظ إعدادات المحل', data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/shop-settings/logo — رفع شعار المحل (Base64)
const uploadLogo = async (req, res, next) => {
  try {
    const { logo_base64, mime_type } = req.body;
    if (!logo_base64) throw new AppError('الشعار مطلوب');

    // نحفظه مباشرة كـ data URL في قاعدة البيانات (للنسخة المجانية)
    // في الإنتاج: ارفعه على Supabase Storage
    const logo_url = `data:${mime_type || 'image/png'};base64,${logo_base64}`;

    const { rows } = await query(
      `UPDATE shop_settings SET logo_url = $1, updated_at = NOW()
       WHERE branch_id = $2 RETURNING logo_url`,
      [logo_url, req.user.branch_id]
    );

    if (!rows.length) {
      // أنشئ السجل أولاً
      await query(
        `INSERT INTO shop_settings (branch_id, logo_url) VALUES ($1, $2)
         ON CONFLICT (branch_id) DO UPDATE SET logo_url = $2`,
        [req.user.branch_id, logo_url]
      );
    }

    res.json({ success: true, message: 'تم رفع الشعار', logo_url });
  } catch (err) { next(err); }
};

module.exports = { getSettings, updateSettings, uploadLogo };
