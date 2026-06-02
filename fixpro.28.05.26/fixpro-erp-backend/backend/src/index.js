require('dotenv').config();

// ── التحقق من متغيرات البيئة ──────────────────────────
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is missing in .env');
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is missing or less than 32 chars');
  process.exit(1);
}

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

// ── دالة تحميل آمن للـ routes ─────────────────────────
function load(path) {
  try {
    return require(path);
  } catch (e) {
    console.error(`❌ FAILED TO LOAD: ${path}`);
    console.error(`   Error: ${e.message}`);
    process.exit(1);
  }
}

// ── تحميل كل الـ routes ───────────────────────────────
const authRoutes         = load('./routes/auth.routes');
const orderRoutes        = load('./routes/orders.routes');
const ticketRoutes       = load('./routes/tickets.routes');
const customerRoutes     = load('./routes/customers.routes');
const technicianRoutes   = load('./routes/technicians.routes');
const inventoryRoutes    = load('./routes/inventory.routes');
const invoiceRoutes      = load('./routes/invoices.routes');
const reportRoutes       = load('./routes/reports.routes');
const notifRoutes        = load('./routes/notifications.routes');
const dashboardRoutes    = load('./routes/dashboard.routes');
const usersRoutes        = load('./routes/users.routes');
const shopSettingsRoutes = load('./routes/shopSettings.routes');
const branchesRoutes     = load('./routes/branches.routes');
const printerRoutes      = load('./routes/printer.routes');
const settingsRoutes     = load('./routes/settings.routes');
const whatsappRoutes     = load('./routes/whatsapp.routes');
const appointmentsRoutes = load('./routes/appointments.routes');
const servicePricesRoutes = load('./routes/servicePrices.routes');
const partRequestsRoutes  = load('./routes/partRequests.routes');

const app = express();

// ── Middleware ─────────────────────────────────────────
app.use(helmet());

const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
]);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`), false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Rate Limiting ──────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.body?.email || req.ip,
  message: { success: false, message: 'تم تجاوز عدد محاولات تسجيل الدخول' },
});
app.use('/api/', limiter);

// ── Health Check ───────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── API Routes ─────────────────────────────────────────
app.use('/api/auth/login',    loginLimiter);
app.use('/api/auth',          authRoutes);
app.use('/api/orders',        orderRoutes);
app.use('/api/tickets',       ticketRoutes);
app.use('/api/customers',     customerRoutes);
app.use('/api/technicians',   technicianRoutes);
app.use('/api/inventory',     inventoryRoutes);
app.use('/api/invoices',      invoiceRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/shop-settings', shopSettingsRoutes);
app.use('/api/branches',      branchesRoutes);
app.use('/api/printers',      printerRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/whatsapp',      whatsappRoutes);
app.use('/api/appointments',  appointmentsRoutes);
app.use('/api/service-prices', servicePricesRoutes);
app.use('/api/part-requests', partRequestsRoutes);

// ── Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  console.error(`[${status}] ${req.method} ${req.path} — ${err.message}`);
  if (process.env.NODE_ENV === 'production' && status === 500) {
    return res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
  }
  res.status(status).json({ success: false, message: err.message || 'خطأ غير متوقع' });
});

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ FixPro Backend running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ── Diagnostic Endpoint — اختبر على: /api/debug ──────────
app.get('/api/debug', async (req, res) => {
  const { query } = require('./config/database');
  const results = {};

  // 1. قاعدة البيانات
  try {
    await query('SELECT 1');
    results.database = '✅ متصل';
  } catch(e) { results.database = '❌ ' + e.message; }

  // 2. جدول notifications وأعمدته
  try {
    const { rows } = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'notifications'
      ORDER BY ordinal_position
    `);
    const cols = rows.map(r => r.column_name);
    results.notifications_columns = cols;
    results.has_is_read    = cols.includes('is_read')    ? '✅' : '❌ مفقود';
    results.has_type       = cols.includes('type')       ? '✅' : '❌ مفقود';
    results.has_claimed_by = cols.includes('claimed_by') ? '✅' : '❌ مفقود';
    results.recipient_type = rows.find(r=>r.column_name==='recipient')?.data_type || '❌';
  } catch(e) { results.notifications = '❌ ' + e.message; }

  // 3. جدول order_parts
  try {
    const { rows } = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'order_parts'
    `);
    results.order_parts_columns = rows.map(r => r.column_name);
    results.order_parts = '✅ موجود';
  } catch(e) { results.order_parts = '❌ ' + e.message; }

  // 4. جدول parts (المخزون)
  try {
    const { rows } = await query('SELECT COUNT(*) FROM parts');
    results.parts_count = rows[0].count + ' قطعة';
  } catch(e) { results.parts = '❌ ' + e.message; }

  // 5. جدول inventory_movements
  try {
    await query('SELECT 1 FROM inventory_movements LIMIT 1');
    results.inventory_movements = '✅ موجود';
  } catch(e) { results.inventory_movements = '❌ غير موجود — ' + e.message; }

  // 6. عدد الإشعارات
  try {
    const { rows } = await query('SELECT COUNT(*) FROM notifications WHERE channel=$1', ['internal']);
    results.internal_notifications = rows[0].count + ' إشعار داخلي';
  } catch(e) { results.notifications_count = '❌ ' + e.message; }

  res.json({ status: 'FixPro Diagnostics', time: new Date(), results });
});
