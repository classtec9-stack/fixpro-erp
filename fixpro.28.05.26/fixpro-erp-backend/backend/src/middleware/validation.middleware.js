const { body, param, query, validationResult } = require('express-validator');

// ── مساعد: تحقق من الأخطاء وأوقف الطلب إذا وُجدت ─────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'بيانات غير صحيحة',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// ── تسجيل الدخول ──────────────────────────────────────────
const validateLogin = [
  body('email')
    .trim().notEmpty().withMessage('البريد الإلكتروني مطلوب')
    .isEmail().withMessage('البريد الإلكتروني غير صحيح')
    .normalizeEmail()
    .isLength({ max: 150 }).withMessage('البريد طويل جداً'),
  body('password')
    .notEmpty().withMessage('كلمة المرور مطلوبة')
    .isLength({ min: 6, max: 100 }).withMessage('كلمة المرور يجب أن تكون بين 6 و 100 حرف'),
  validate
];

// ── إنشاء تذكرة صيانة ─────────────────────────────────────
const validateCreateTicket = [
  body('customer_name')
    .trim().notEmpty().withMessage('اسم العميل مطلوب')
    .isLength({ min: 2, max: 100 }).withMessage('الاسم بين 2 و 100 حرف')
    .escape(),
  body('customer_phone')
    .trim().notEmpty().withMessage('رقم الجوال مطلوب')
    .matches(/^[+0-9\s\-()]{7,20}$/).withMessage('رقم الجوال غير صحيح'),
  body('device_brand')
    .trim().notEmpty().withMessage('ماركة الجهاز مطلوبة')
    .isLength({ max: 50 }).escape(),
  body('device_model')
    .trim().notEmpty().withMessage('موديل الجهاز مطلوب')
    .isLength({ max: 80 }).escape(),
  body('problem_desc')
    .trim().notEmpty().withMessage('وصف المشكلة مطلوب')
    .isLength({ min: 3, max: 1000 }).withMessage('الوصف بين 3 و 1000 حرف')
    .escape(),
  body('priority')
    .optional()
    .isIn(['normal', 'urgent', 'vip']).withMessage('الأولوية يجب أن تكون: normal أو urgent أو vip'),
  body('device_imei')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .matches(/^[0-9A-Za-z\-]*$/).withMessage('IMEI يحتوي على أحرف غير مسموح بها'),
  body('estimated_cost')
    .optional()
    .isNumeric().withMessage('التكلفة التقديرية يجب أن تكون رقماً')
    .isFloat({ min: 0, max: 99999 }).withMessage('التكلفة خارج النطاق المسموح'),
  validate
];

// ── تحديث حالة التذكرة ────────────────────────────────────
const VALID_STATUSES = [
  'new', 'quick_check', 'diagnosing', 'waiting_approval',
  'in_repair', 'waiting_part', 'ready', 'delivered', 'rejected', 'cancelled'
];

const validateStatusUpdate = [
  param('id').isUUID().withMessage('معرّف التذكرة غير صحيح'),
  body('status')
    .notEmpty().withMessage('الحالة الجديدة مطلوبة')
    .isIn(VALID_STATUSES).withMessage(`الحالة يجب أن تكون: ${VALID_STATUSES.join(', ')}`),
  body('note')
    .optional().trim()
    .isLength({ max: 500 }).escape(),
  body('rejection_reason')
    .optional().trim()
    .isLength({ max: 500 }).escape(),
  validate
];

// ── إنشاء فاتورة ──────────────────────────────────────────
const validateCreateInvoice = [
  body('order_id')
    .notEmpty().withMessage('رقم التذكرة مطلوب')
    .isUUID().withMessage('رقم التذكرة غير صحيح'),
  body('labor_cost')
    .optional()
    .isFloat({ min: 0, max: 99999 }).withMessage('أجرة العمالة خارج النطاق'),
  body('discount')
    .optional()
    .isFloat({ min: 0, max: 99999 }).withMessage('الخصم خارج النطاق'),
  validate
];

// ── تسجيل دفعة ────────────────────────────────────────────
const validatePayment = [
  param('id').isUUID().withMessage('معرّف الفاتورة غير صحيح'),
  body('amount')
    .notEmpty().withMessage('المبلغ مطلوب')
    .isFloat({ min: 0.01, max: 999999 }).withMessage('المبلغ غير صحيح'),
  body('method')
    .notEmpty().withMessage('طريقة الدفع مطلوبة')
    .isIn(['cash', 'card', 'transfer', 'stc', 'other']).withMessage('طريقة الدفع غير صحيحة'),
  body('reference_no')
    .optional().trim()
    .isLength({ max: 100 }).escape(),
  validate
];

// ── إنشاء مستخدم ──────────────────────────────────────────
const VALID_ROLES = ['admin','branch_manager','receptionist','technician','customer_service','warehouse','accountant'];

const validateCreateUser = [
  body('full_name')
    .trim().notEmpty().withMessage('الاسم مطلوب')
    .isLength({ min: 2, max: 100 }).withMessage('الاسم بين 2 و 100 حرف')
    .escape(),
  body('email')
    .trim().notEmpty().withMessage('البريد الإلكتروني مطلوب')
    .isEmail().withMessage('البريد الإلكتروني غير صحيح')
    .normalizeEmail()
    .isLength({ max: 150 }),
  body('password')
    .notEmpty().withMessage('كلمة المرور مطلوبة')
    .isLength({ min: 8, max: 100 }).withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('كلمة المرور يجب أن تحتوي على أحرف وأرقام'),
  body('role')
    .notEmpty().withMessage('الدور مطلوب')
    .isIn(VALID_ROLES).withMessage('الدور غير صحيح'),
  body('phone')
    .optional().trim()
    .matches(/^[+0-9\s\-()]{7,20}$/).withMessage('رقم الجوال غير صحيح'),
  validate
];

// ── تغيير كلمة المرور ─────────────────────────────────────
const validateChangePassword = [
  body('current_password')
    .notEmpty().withMessage('كلمة المرور الحالية مطلوبة'),
  body('new_password')
    .notEmpty().withMessage('كلمة المرور الجديدة مطلوبة')
    .isLength({ min: 8, max: 100 }).withMessage('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('كلمة المرور يجب أن تحتوي على أحرف وأرقام'),
  validate
];

// ── إنشاء فرع ─────────────────────────────────────────────
const validateCreateBranch = [
  body('name')
    .trim().notEmpty().withMessage('اسم الفرع مطلوب')
    .isLength({ min: 2, max: 100 }).withMessage('الاسم بين 2 و 100 حرف')
    .escape(),
  body('city')
    .optional().trim().isLength({ max: 50 }).escape(),
  body('phone')
    .optional().trim()
    .matches(/^[+0-9\s\-()]{7,20}$/).withMessage('رقم الهاتف غير صحيح'),
  body('address')
    .optional().trim().isLength({ max: 200 }).escape(),
  validate
];

// ── إضافة قطعة للمخزون ────────────────────────────────────
const validateCreatePart = [
  body('name')
    .trim().notEmpty().withMessage('اسم القطعة مطلوب')
    .isLength({ min: 2, max: 150 }).escape(),
  body('sell_price')
    .notEmpty().withMessage('سعر البيع مطلوب')
    .isFloat({ min: 0, max: 99999 }).withMessage('السعر غير صحيح'),
  body('quantity')
    .optional()
    .isInt({ min: 0, max: 99999 }).withMessage('الكمية يجب أن تكون رقماً صحيحاً'),
  body('sku')
    .optional().trim()
    .isLength({ max: 50 })
    .matches(/^[A-Za-z0-9\-_]*$/).withMessage('SKU يحتوي على أحرف غير مسموح بها'),
  validate
];

// ── إعدادات المحل ─────────────────────────────────────────
const validateShopSettings = [
  body('shop_name')
    .optional().trim().isLength({ max: 150 }).escape(),
  body('phone')
    .optional().trim()
    .matches(/^[+0-9\s\-()]{7,20}$/).withMessage('رقم الهاتف غير صحيح'),
  body('email')
    .optional().trim()
    .isEmail().withMessage('البريد الإلكتروني غير صحيح')
    .normalizeEmail(),
  body('tax_number')
    .optional().trim()
    .isLength({ max: 50 })
    .matches(/^[A-Za-z0-9]*$/).withMessage('الرقم الضريبي غير صحيح'),
  body('receipt_width')
    .optional()
    .isIn([58, 80]).withMessage('عرض الوصل يجب أن يكون 58 أو 80'),
  validate
];

// ── رفع الشعار ────────────────────────────────────────────
const validateLogoUpload = [
  body('logo_base64')
    .notEmpty().withMessage('ملف الشعار مطلوب')
    .isBase64().withMessage('تنسيق الصورة غير صحيح')
    .isLength({ max: 700000 }).withMessage('حجم الشعار كبير جداً — الحد الأقصى 500KB'),
  body('mime_type')
    .notEmpty().withMessage('نوع الملف مطلوب')
    .isIn(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
    .withMessage('نوع الملف غير مدعوم — المسموح: JPEG, PNG, WebP فقط'),
  validate
];

module.exports = {
  validate,
  validateLogin,
  validateCreateTicket,
  validateStatusUpdate,
  validateCreateInvoice,
  validatePayment,
  validateCreateUser,
  validateChangePassword,
  validateCreateBranch,
  validateCreatePart,
  validateShopSettings,
  validateLogoUpload,
};
