const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      throw new AppError('البريد الإلكتروني وكلمة المرور مطلوبان');

    const { rows } = await query(
      `SELECT u.*, b.name as branch_name
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      throw new AppError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 401);

    if (!user.is_active)
      throw new AppError('حسابك موقوف، تواصل مع المدير', 403);

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signToken(user.id);

    res.json({
      success: true,
      token,
      user: {
        id:          user.id,
        fullName:    user.full_name,
        email:       user.email,
        role:        user.role,
        branchId:    user.branch_id,
        branchName:  user.branch_name,
        avatarUrl:   user.avatar_url,
      },
    });
  } catch (err) { next(err); }
};

// GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.avatar_url,
              u.branch_id, b.name as branch_name, u.last_login_at
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      throw new AppError('كلمة المرور الحالية والجديدة مطلوبتان');

    if (newPassword.length < 8)
      throw new AppError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, rows[0].password_hash)))
      throw new AppError('كلمة المرور الحالية غير صحيحة');

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) { next(err); }
};

module.exports = { login, getMe, changePassword };
