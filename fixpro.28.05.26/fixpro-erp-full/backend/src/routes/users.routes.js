const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const c = require('../controllers/users.controller');

router.use(authenticate);
router.get('/',    authorize('admin','branch_manager'), c.getUsers);
router.post('/',   authorize('admin','branch_manager'), c.createUser);
router.put('/profile', c.updateProfile);
router.put('/:id', authorize('admin','branch_manager'), c.updateUser);
router.post('/:id/reset-password', authorize('admin','branch_manager'), c.resetPassword);
router.delete('/:id', authorize('admin'), c.deleteUser);
if (c.reactivateUser) {
  router.patch('/:id/reactivate', authorize('admin'), c.reactivateUser);
}
module.exports = router;
