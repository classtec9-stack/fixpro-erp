const router = require('express').Router();
const c = require('../controllers/invoices.controller');
const { validateCreateInvoice, validatePayment } = require('../middleware/validation.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/', c.getInvoices);
router.post('/', authorize('admin','branch_manager','receptionist','accountant'), c.createInvoice);
router.get('/:id', c.getInvoiceById);
router.post('/:id/pay',    authorize('admin','branch_manager','receptionist','accountant'), c.recordPayment);
router.post('/:id/cancel', authorize('admin','branch_manager'), c.cancelInvoice);
router.post('/:id/refund', authorize('admin','branch_manager'), c.refundInvoice);

router.get('/ticket/:orderId',           authorize('admin','branch_manager','receptionist','accountant'), c.getTicketInvoiceData);
router.post('/ticket/:orderId/finalize', authorize('admin','branch_manager','receptionist','accountant'), c.finalizeInvoice);

module.exports = router;