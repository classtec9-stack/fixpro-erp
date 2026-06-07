const router = require('express').Router();
const c = require('../controllers/warranty.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/check/:orderId', c.checkWarranty);
router.post('/', authorize('admin','branch_manager','receptionist'), c.createWarrantyClaim);
module.exports = router;
