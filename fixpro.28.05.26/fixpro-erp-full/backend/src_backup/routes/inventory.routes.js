const router = require('express').Router();
const c = require('../controllers/inventory.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/alerts', c.getLowStockAlerts);
router.get('/parts', c.getParts);
router.post('/parts', authorize('admin','branch_manager'), c.createPart);
router.post('/parts/:id/restock', authorize('admin','branch_manager'), c.restock);
module.exports = router;
