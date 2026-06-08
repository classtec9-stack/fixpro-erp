const router = require('express').Router();
const { getDashboard } = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/', authenticate, getDashboard);

module.exports = router;
