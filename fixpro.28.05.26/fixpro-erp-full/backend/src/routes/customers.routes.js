const router = require('express').Router();
const c = require('../controllers/customers.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);

// قراءة — جميع الأدوار عدا warehouse
router.get('/',    authorize('admin','branch_manager','receptionist','technician','accountant','customer_service'), c.getCustomers);
router.get('/:id', authorize('admin','branch_manager','receptionist','technician','accountant','customer_service'), c.getCustomerById);

// إنشاء — receptionist+ فقط
router.post('/',   authorize('admin','branch_manager','receptionist'), c.createCustomer);

// تعديل — admin و branch_manager فقط (بيانات حساسة)
router.put('/:id', authorize('admin','branch_manager'), c.updateCustomer);
// تحديث الاسم فقط — يُستخدم عند تعارض الاسم عند إنشاء تذكرة
router.patch('/:id/name', authorize('admin','branch_manager','receptionist'), c.updateCustomerName);

module.exports = router;
