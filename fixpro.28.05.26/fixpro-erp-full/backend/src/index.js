require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');

// ── Routes الأساسية ───────────────────────────────────────
const authRoutes          = require('./routes/auth.routes');
const orderRoutes         = require('./routes/orders.routes');
const ticketRoutes        = require('./routes/tickets.routes');
const customerRoutes      = require('./routes/customers.routes');
const technicianRoutes    = require('./routes/technicians.routes');
const inventoryRoutes     = require('./routes/inventory.routes');
const invoiceRoutes       = require('./routes/invoices.routes');
const reportRoutes        = require('./routes/reports.routes');
const notifRoutes         = require('./routes/notifications.routes');
const dashboardRoutes     = require('./routes/dashboard.routes');
const usersRoutes         = require('./routes/users.routes');
const shopSettingsRoutes  = require('./routes/shopSettings.routes');
const printerRoutes       = require('./routes/printer.routes');
const settingsRoutes      = require('./routes/settings.routes');
// ── Routes المضافة (كانت ناقصة) ──────────────────────────
const branchesRoutes      = require('./routes/branches.routes');
const appointmentsRoutes  = require('./routes/appointments.routes');
const suppliersRoutes     = require('./routes/suppliers.routes');
const defectiveRoutes     = require('./routes/defective.routes');
const warrantyRoutes      = require('./routes/warranty.routes');
const whatsappRoutes      = require('./routes/whatsapp.routes');
const partRequestsRoutes  = require('./routes/partRequests.routes');
const servicePricesRoutes = require('./routes/servicePrices.routes');
// ── Routes الجديدة (المرحلة الثانية) ──────────────────────
const quotationsRoutes    = require('./routes/quotations.routes');
const purchaseOrderRoutes = require('./routes/purchaseOrders.routes');
const slaRoutes           = require('./routes/sla.routes');
const loyaltyRoutes       = require('./routes/loyalty.routes');
const checklistRoutes     = require('./routes/checklist.routes');
const schedulingRoutes    = require('./routes/scheduling.routes');

const { errorHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();

// ── Security ──────────────────────────────────────────────
app.use(helmet());

const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error(`CORS: ${origin} غير مسموح`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Branch-ID'],
}));

// ── Rate Limiting ─────────────────────────────────────────
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'طلبات كثيرة جداً، حاول لاحقاً' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.body?.email || req.ip,
  message: { success: false, message: 'تم تجاوز عدد محاولات تسجيل الدخول' },
});
app.use('/api/', limiter);

// ── Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Health Check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), app: 'FixPro ERP' });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth/login',     loginLimiter);
app.use('/api/auth',           authRoutes);
app.use('/api/tickets',        ticketRoutes);
app.use('/api/orders',         orderRoutes);
app.use('/api/customers',      customerRoutes);
app.use('/api/technicians',    technicianRoutes);
app.use('/api/inventory',      inventoryRoutes);
app.use('/api/invoices',       invoiceRoutes);
app.use('/api/reports',        reportRoutes);
app.use('/api/notifications',  notifRoutes);
app.use('/api/dashboard',      dashboardRoutes);
app.use('/api/users',          usersRoutes);
app.use('/api/shop-settings',  shopSettingsRoutes);
app.use('/api/printers',       printerRoutes);
app.use('/api/settings',       settingsRoutes);
app.use('/api/branches',       branchesRoutes);
app.use('/api/appointments',   appointmentsRoutes);
app.use('/api/suppliers',      suppliersRoutes);
app.use('/api/defective',      defectiveRoutes);
app.use('/api/warranty',       warrantyRoutes);
app.use('/api/whatsapp',       whatsappRoutes);
app.use('/api/part-requests',  partRequestsRoutes);
app.use('/api/service-prices', servicePricesRoutes);
// ── Routes الجديدة ─────────────────────────────────────────
app.use('/api/quotations',      quotationsRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/sla',             slaRoutes);
app.use('/api/loyalty',         loyaltyRoutes);
app.use('/api/checklist',       checklistRoutes);
app.use('/api/scheduling',      schedulingRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'المسار غير موجود' });
});
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`✅ FixPro ERP running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
