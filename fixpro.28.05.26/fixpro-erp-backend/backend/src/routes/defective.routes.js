const router = require('express').Router();
const c = require('../controllers/defective.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);

// القطع التالفة
router.get('/',           c.getDefectiveParts);
router.post('/',          authorize('admin','branch_manager','warehouse'), c.addDefectivePart);
router.post('/:id/writeoff', authorize('admin','branch_manager'), c.writeOffPart);

// طلبات الإرجاع للمورد
router.get('/returns',         c.getSupplierReturns);
router.post('/returns',        authorize('admin','branch_manager','warehouse'), c.createSupplierReturn);
router.get('/returns/:id',     c.getSupplierReturnById);
router.post('/returns/:id/resolve', authorize('admin','branch_manager','warehouse'), c.resolveSupplierReturn);

module.exports = router;
