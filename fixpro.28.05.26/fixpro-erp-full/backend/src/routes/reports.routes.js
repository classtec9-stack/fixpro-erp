const router = require('express').Router();
const dash = require('../controllers/dashboard.controller');
const rep  = require('../controllers/reports.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate, authorize('admin','branch_manager','accountant'));
router.get('/revenue',               dash.getRevenueReport);
router.get('/technicians',           dash.getTechnicianReport);
router.get('/daily',                 dash.getDailyReport);
router.get('/profitability',         rep.getProfitabilityReport);
router.get('/technician-performance',rep.getTechnicianPerformance);
router.get('/inventory-valuation',   rep.getInventoryValuation);
router.get('/customer-insights',     rep.getCustomerInsights);

module.exports = router;
