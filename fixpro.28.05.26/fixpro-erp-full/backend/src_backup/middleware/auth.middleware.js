const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'غير مصرح — الرجاء تسجيل الدخول' });

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await query(
      'SELECT id, full_name, email, role, branch_id, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows.length || !rows[0].is_active)
      return res.status(401).json({ success: false, message: 'المستخدم غير نشط أو غير موجود' });

    req.user = rows[0];
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
