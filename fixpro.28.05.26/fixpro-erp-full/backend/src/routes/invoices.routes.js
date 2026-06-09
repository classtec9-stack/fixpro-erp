const router = require('express').Router();
const c = require('../controllers/invoices.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

// ── Static routes أولاً (قبل /:id) ───────────────────────
router.get('/stats',
  authorize('admin','branch_manager','accountant','receptionist'),
  c.getInvoiceStats
);

// ⚠️ /ticket/:orderId يجب أن يأتي قبل /:id
// وإلا Express يفسّر "ticket" كـ id
router.get('/ticket/:orderId',
  authorize('admin','branch_manager','receptionist','accountant','technician'),
  c.getTicketInvoiceData
);
router.post('/ticket/:orderId/finalize',
  authorize('admin','branch_manager','receptionist','accountant'),
  c.finalizeInvoice
);

// ── List & Create ─────────────────────────────────────────
router.get('/',
  c.getInvoices
);
router.post('/',
  authorize('admin','branch_manager','receptionist','accountant'),
  c.createInvoice
);

// ── Dynamic :id routes ────────────────────────────────────
router.get('/:id',
  c.getInvoiceById
);
router.post('/:id/pay',
  authorize('admin','branch_manager','receptionist','accountant'),
  c.recordPayment
);
router.post('/:id/cancel',
  authorize('admin','branch_manager'),
  c.cancelInvoice
);
router.post('/:id/refund',
  authorize('admin','branch_manager'),
  c.refundInvoice
);

module.exports = router;
