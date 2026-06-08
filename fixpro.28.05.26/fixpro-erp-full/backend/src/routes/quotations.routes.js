const router = require('express').Router();
const c = require('../controllers/quotations.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/',                c.getQuotations);
router.post('/',               authorize('admin','branch_manager','receptionist','technician'), c.createQuotation);
router.get('/:id',             c.getQuotationById);
router.post('/:id/send',       authorize('admin','branch_manager','receptionist'), c.sendQuotation);
router.patch('/:id/respond',   authorize('admin','branch_manager','receptionist'), c.respondToQuotation);

module.exports = router;
