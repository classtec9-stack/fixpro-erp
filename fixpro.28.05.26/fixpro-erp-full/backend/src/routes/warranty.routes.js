// backend/src/routes/warranty.routes.js
const router = require('express').Router();
const c = require('../controllers/warranty.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/',                authorize('admin','branch_manager','receptionist','accountant'), c.getWarrantyClaims);
router.get('/check/:orderId',  c.checkWarranty);
router.get('/return-status/:orderId', c.getReturnStatus);
router.post('/',               authorize('admin','branch_manager','receptionist'), c.createWarrantyClaim);
router.post('/return-part',     authorize('admin','branch_manager','technician'), c.returnWarrantyPart);

module.exports = router;
