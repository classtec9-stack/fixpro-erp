const router = require('express').Router();
const c = require('../controllers/scheduling.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/workload',       authorize('admin','branch_manager','receptionist'), c.getTechnicianWorkload);
router.get('/board',          c.getWorkshopBoard);
router.post('/suggest',       authorize('admin','branch_manager','receptionist'), c.suggestTechnician);
module.exports = router;
