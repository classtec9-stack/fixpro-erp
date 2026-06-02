const router = require('express').Router();
const { getRevenueReport, getTechnicianReport } = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate, authorize('admin','branch_manager','accountant'));
router.get('/revenue', getRevenueReport);
router.get('/technicians', getTechnicianReport);
module.exports = router;
