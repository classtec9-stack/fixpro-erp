const router = require('express').Router();
const c = require('../controllers/partRequests.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/', c.getRequests);
router.post('/', c.createRequest);
router.post('/:id/approve', authorize('admin','branch_manager','warehouse'), c.approveRequest);
router.post('/:id/reject',  authorize('admin','branch_manager','warehouse'), c.rejectRequest);
module.exports = router;
