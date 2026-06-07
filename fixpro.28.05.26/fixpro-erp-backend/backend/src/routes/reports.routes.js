const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/revenue',     authorize('admin','branch_manager','accountant'), async (req, res, next) => {
  try {
    const { getRevenueReport } = require('../controllers/dashboard.controller');
    return getRevenueReport(req, res, next);
  } catch(e) { next(e); }
});

router.get('/technicians', authorize('admin','branch_manager','accountant'), async (req, res, next) => {
  try {
    const { getTechnicianReport } = require('../controllers/dashboard.controller');
    return getTechnicianReport(req, res, next);
  } catch(e) { next(e); }
});

router.get('/daily', authorize('admin','branch_manager','accountant'), async (req, res, next) => {
  try {
    const { getDailyReport } = require('../controllers/dashboard.controller');
    return getDailyReport(req, res, next);
  } catch(e) { next(e); }
});

module.exports = router;
