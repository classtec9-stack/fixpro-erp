const router = require('express').Router();
const c = require('../controllers/invoices.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/', c.getInvoices);
router.post('/', authorize('admin','branch_manager','receptionist','accountant'), c.createInvoice);
router.post('/:id/pay', authorize('admin','branch_manager','receptionist','accountant'), c.recordPayment);
module.exports = router;
