const router = require('express').Router();
const { getDashboard, getRevenueChart } = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.get('/',       authenticate, getDashboard);
router.get('/revenue', authenticate, authorize('admin','branch_manager','accountant'), getRevenueChart);
module.exports = router;
