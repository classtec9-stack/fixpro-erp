const router = require('express').Router();
const c = require('../controllers/branches.controller');
const { validateCreateBranch } = require('../middleware/validation.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/unified-report', authorize('admin'), c.getUnifiedReport);
router.get('/overview',       authorize('admin'), c.getBranchesOverview);
router.get('/',               authorize('admin'), c.getBranches);
router.post('/',              authorize('admin'), validateCreateBranch, c.createBranch);
router.put('/:id',            authorize('admin'), c.updateBranch);
module.exports = router;
