const router = require('express').Router();
const c = require('../controllers/customers.controller');
const { authenticate } = require('../middleware/auth.middleware');
router.use(authenticate);
router.get('/', c.getCustomers);
router.post('/', c.createCustomer);
router.get('/:id', c.getCustomerById);
router.put('/:id', c.updateCustomer);
module.exports = router;
