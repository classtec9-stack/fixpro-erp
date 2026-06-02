const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { AppError } = require('../middleware/error.middleware');

// GET /api/users
const getUsers = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active,
              u.avatar_url, u.last_login_at, u.created_at,
              b.name as branch_name
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.branch_id = $1 OR $2 = 'admin'
       ORDER BY u.created_at DESC`,
      [req.user.branch_id, req.user.role]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// POST /api/users  — create staff account
const createUser = async (req, res, next) => {
  try {
    const { full_name, email, phone, role, password, branch_id } = req.body;
    if (!full_name || !email || !password || !role)
      throw new AppError('الاسم والبريد والدور وكلمة المرور مطلوبة');
    if (password.length < 8)
      throw new AppError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');

    const exists = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length) throw new AppError('هذا البريد الإلكتروني مسجل مسبقاً', 409);

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (full_name, email, phone, role, password_hash, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, full_name, email, role, is_active, created_at`,
      [full_name, email.toLowerCase(), phone, role,
       hash, branch_id || req.user.branch_id]
    );
    res.status(201).json({ success: true, message: 'تم إنشاء الحساب بنجاح', data: rows[0] });
  } catch (err) { next(err); }
};

// PUT /api/users/:id
const updateUser = async (req, res, next) => {
  try {
    const { full_name, email, phone, role, is_active } = req.body;
    // Prevent non-admin from changing roles to admin
    if (role === 'admin' && req.user.role !== 'admin')
      throw new AppError('فقط المدير يمكنه منح صلاحية المدير', 403);

    const { rows } = await query(
      `UPDATE users SET full_name=$1, email=$2, phone=$3, role=$4, is_active=$5
       WHERE id=$6 RETURNING id, full_name, email, role, is_active`,
      [full_name, email?.toLowerCase(), phone, role, is_active, req.params.id]
    );
    if (!rows.length) throw new AppError('المستخدم غير موجود', 404);
    res.json({ success: true, message: 'تم تحديث بيانات المستخدم', data: rows[0] });
  } catch (err) { next(err); }
};

// POST /api/users/:id/reset-password  — admin resets someone's password
const resetPassword = async (req, res, next) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8)
      throw new AppError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    const hash = await bcrypt.hash(new_password, 12);
    const { rows } = await query(
      'UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id',
      [hash, req.params.id]
    );
    if (!rows.length) throw new AppError('المستخدم غير موجود', 404);
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) { next(err); }
};

// PUT /api/users/profile  — user updates own profile
const updateProfile = async (req, res, next) => {
  try {
    const { full_name, phone, theme, language } = req.body;
    const { rows } = await query(
      `UPDATE users SET full_name=COALESCE($1,full_name),
       phone=COALESCE($2,phone)
       WHERE id=$3
       RETURNING id, full_name, email, phone, role, avatar_url`,
      [full_name, phone, req.user.id]
    );
    res.json({ success: true, message: 'تم تحديث الملف الشخصي', data: rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/users/:id  — soft delete
const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id)
      throw new AppError('لا يمكنك تعطيل حسابك الخاص', 400);

    const { rows } = await query(
      `UPDATE users
       SET is_active = false,
           deactivated_at = NOW(),
           deactivated_by = $1
       WHERE id = $2
       RETURNING id, full_name, email`,
      [req.user.id, req.params.id]
    );

    if (!rows.length)
      throw new AppError('المستخدم غير موجود', 404);

    res.json({ success: true, message: `تم تعطيل حساب: ${rows[0].full_name}` });
  } catch (err) { next(err); }
};


const reactivateUser = async (req, res, next) => {
  try {
    const { query } = require('../config/database');
    const { rows } = await query(
      `UPDATE users SET is_active=true, deactivated_at=NULL, deactivated_by=NULL
       WHERE id=$1 RETURNING id, full_name`,
      [req.params.id]
    );
    if (!rows.length) throw { status: 404, message: 'المستخدم غير موجود' };
    res.json({ success: true, message: `تم إعادة تفعيل ${rows[0].full_name}` });
  } catch (err) { next(err); }
};

module.exports = { getUsers, createUser, updateUser, resetPassword, updateProfile, deleteUser, reactivateUser };
