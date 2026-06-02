const router = require('express').Router();
const c = require('../controllers/invoices.controller');
const { validateCreateInvoice, validatePayment } = require('../middleware/validation.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/', c.getInvoices);
router.post('/', authorize('admin','branch_manager','receptionist','accountant'), c.createInvoice);
router.get('/:id', c.getInvoiceById);
router.post('/:id/pay', authorize('admin','branch_manager','receptionist','accountant'), c.recordPayment);

// ── مسارات الفاتورة الموحّدة ──────────────────────────
router.get('/ticket/:orderId',          authenticate, c.getTicketInvoiceData);
router.post('/ticket/:orderId/finalize', authenticate, c.finalizeInvoice);

module.exports = router;