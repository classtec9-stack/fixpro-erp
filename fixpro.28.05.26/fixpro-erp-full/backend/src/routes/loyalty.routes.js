const router = require('express').Router();
const c = require('../controllers/loyalty.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/:customerId',   c.getCustomerLoyalty);
router.post('/earn',         authorize('admin','branch_manager','receptionist','accountant'), c.earnPoints);
router.post('/redeem',       authorize('admin','branch_manager','receptionist'), c.redeemPoints);
module.exports = router;
