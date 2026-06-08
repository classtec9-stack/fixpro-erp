const router = require('express').Router();
const c = require('../controllers/checklist.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/:orderId',  c.getChecklist);
router.post('/',         authorize('admin','branch_manager','receptionist','technician'), c.saveChecklist);
module.exports = router;
