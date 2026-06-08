const jwt  = require('jsonwebtoken');
const { query } = require('../config/database');

// UUID v4 regex — للتحقق من صحة X-Branch-ID قبل استخدامه
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'غير مصرح — الرجاء تسجيل الدخول' });

    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await query(
      'SELECT id, full_name, email, role, branch_id, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows.length || !rows[0].is_active)
      return res.status(401).json({ success: false, message: 'المستخدم غير نشط أو غير موجود' });

    req.user = rows[0];

    // ── X-Branch-ID: للمدير فقط ───────────────────────────
    // الفرونت يرسل X-Branch-ID عندما يختار المدير فرعاً محدداً
    // إذا اختار "كل الفروع" لا يُرسَل الـ header (api.js السطر 14)
    if (rows[0].role === 'admin') {
      const xBranch = req.headers['x-branch-id'];
      if (xBranch && UUID_REGEX.test(xBranch)) {
        // مدير اختار فرعاً محدداً → غيّر branch_id مؤقتاً لهذا الطلب فقط
        req.user = { ...rows[0], branch_id: xBranch };
      }
      // إذا لم يُرسَل الـ header أو كان 'all' → branch_id الأصلي يبقى كما هو
    }
    // باقي الأدوار: تجاهل X-Branch-ID تماماً — يستخدمون branch_id الخاص بهم دائماً

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجدداً' });
    return res.status(401).json({ success: false, message: 'رمز غير صالح' });
  }
};

// Role-based access control
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ success: false, message: 'ليس لديك صلاحية للوصول لهذا المورد' });
  next();
};

module.exports = { authenticate, authorize };
