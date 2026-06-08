require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes        = require('./routes/auth.routes');
const orderRoutes       = require('./routes/orders.routes');
const customerRoutes    = require('./routes/customers.routes');
const technicianRoutes  = require('./routes/technicians.routes');
const inventoryRoutes   = require('./routes/inventory.routes');
const invoiceRoutes     = require('./routes/invoices.routes');
const reportRoutes      = require('./routes/reports.routes');
const notifRoutes       = require('./routes/notifications.routes');
const dashboardRoutes   = require('./routes/dashboard.routes');

const { errorHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();

// ── Security ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Rate Limiting ─────────────────────────────────────────
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'طلبات كثيرة جداً، حاول لاحقاً' },
});
app.use('/api/', limiter);

// ── Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Health Check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), app: 'FixPro ERP' });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/orders',        orderRoutes);
app.use('/api/customers',     customerRoutes);
app.use('/api/technicians',   technicianRoutes);
app.use('/api/inventory',     inventoryRoutes);
app.use('/api/invoices',      invoiceRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/dashboard',     dashboardRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'المسار غير موجود' });
});

// ── Error Handler ─────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`✅ FixPro ERP running on port ${PORT} [${process.env.NODE_ENV}]`);
});

module.exports = app;
