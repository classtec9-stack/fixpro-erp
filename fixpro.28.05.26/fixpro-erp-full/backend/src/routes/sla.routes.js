const router = require('express').Router();
const c = require('../controllers/sla.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate, authorize('admin','branch_manager'));
router.get('/policies',   c.getPolicies);
router.post('/policies',  c.createPolicy);
router.get('/breached',   c.getBreachedTickets);
router.post('/check',     c.checkAndAlertBreaches);
module.exports = router;
