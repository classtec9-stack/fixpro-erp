// backend/src/routes/transfers.routes.js
const router = require('express').Router();
const c = require('../controllers/transfers.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

// قائمة التحويلات
router.get('/',
  authorize('admin', 'branch_manager', 'warehouse'),
  c.getTransfers
);

// تفاصيل تحويل
router.get('/:id',
  authorize('admin', 'branch_manager', 'warehouse'),
  c.getTransferById
);

// إنشاء طلب تحويل
router.post('/',
  authorize('admin', 'branch_manager', 'warehouse'),
  c.createTransfer
);

// موافقة الفرع المُرسِل
router.patch('/:id/approve',
  authorize('admin', 'branch_manager', 'warehouse'),
  c.approveTransfer
);

// استلام الفرع المستقبل
router.patch('/:id/receive',
  authorize('admin', 'branch_manager', 'warehouse'),
  c.receiveTransfer
);

// إلغاء
router.patch('/:id/cancel',
  authorize('admin', 'branch_manager'),
  c.cancelTransfer
);

module.exports = router;
