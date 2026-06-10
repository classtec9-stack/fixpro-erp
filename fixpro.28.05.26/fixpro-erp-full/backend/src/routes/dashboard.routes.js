// backend/src/routes/dashboard.routes.js
const router = require('express').Router();
const { getDashboard, getRevenueChart } = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', getDashboard);
router.get('/revenue',
  authorize('admin', 'branch_manager', 'accountant'),
  getRevenueChart
);

module.exports = router;
