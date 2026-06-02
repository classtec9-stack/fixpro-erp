const router = require('express').Router();
const c = require('../controllers/tickets.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ordersCtrl = require('../controllers/orders.controller');

// ── بدون تسجيل دخول ──────────────────────────────────
router.get('/public/:order_number', c.getPublicStatus);

// ── مع تسجيل دخول ────────────────────────────────────
router.use(authenticate);

router.get('/devices-board', c.getDevicesBoard);
router.get('/status-board',  c.getStatusBoard);
router.get('/abandoned',     authorize('admin','branch_manager','customer_service'), c.getAbandonedTickets);

router.get('/',    c.getTickets);
router.post('/',   authorize('admin','branch_manager','receptionist'), c.createTicket);

router.get('/:id',           c.getTicketById);
router.patch('/:id/status',  c.updateTicketStatus);
router.patch('/:id',         authorize('admin','branch_manager','receptionist','technician'), c.updateTicket);
router.patch('/:id/assign',  authorize('admin','branch_manager','receptionist'), c.assignTechnician);
router.post('/:id/convert',  authorize('admin','branch_manager','receptionist'), c.convertToRepair);

// ── إدارة القطع ───────────────────────────────────────
router.get('/:id/parts', ordersCtrl.getOrderParts);
router.post('/:id/parts', ordersCtrl.addPart);           // المخزن يضيف ← يخصم تلقائياً
router.delete('/:id/parts/:partId', ordersCtrl.removePart);

module.exports = router;
