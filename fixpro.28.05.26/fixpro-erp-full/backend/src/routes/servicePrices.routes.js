const router = require('express').Router();
const c = require('../controllers/servicePrices.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/',    c.getServicePrices);
router.post('/',   authorize('admin','branch_manager'), c.createServicePrice);
router.put('/:id', authorize('admin','branch_manager'), c.updateServicePrice);
router.delete('/:id', authorize('admin','branch_manager'), c.deleteServicePrice);
module.exports = router;
