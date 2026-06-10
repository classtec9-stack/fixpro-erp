// backend/src/routes/orders.routes.js
// النسخة المُصلَحة — أضافت: GET /:id/parts و DELETE /:id/parts/:partId
const router = require('express').Router();
const c = require('../controllers/orders.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

// ── قائمة وإنشاء ─────────────────────────────────────────
router.get('/',
  c.getOrders
);
router.post('/',
  authorize('admin', 'branch_manager', 'receptionist'),
  c.createOrder
);

// ── تفاصيل أوردر واحد ────────────────────────────────────
router.get('/:id',
  c.getOrderById
);

// ── تغيير الحالة ──────────────────────────────────────────
router.patch('/:id/status',
  c.updateStatus
);

// ── إسناد فني ────────────────────────────────────────────
router.patch('/:id/assign',
  authorize('admin', 'branch_manager'),
  c.assignTechnician
);

// ── إدارة القطع ───────────────────────────────────────────
router.get('/:id/parts',
  c.getOrderParts
);
router.post('/:id/parts',
  authorize('admin', 'branch_manager', 'technician', 'warehouse', 'customer_service'),
  c.addPart
);
router.delete('/:id/parts/:partId',
  authorize('admin', 'branch_manager', 'warehouse'),
  c.removePart
);

module.exports = router;
