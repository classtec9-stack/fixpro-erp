const router = require('express').Router();
const c = require('../controllers/shopSettings.controller');
const { validateShopSettings, validateLogoUpload } = require('../middleware/validation.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/', c.getSettings);
router.put('/', authorize('admin','branch_manager'), validateShopSettings, c.updateSettings);
router.post('/logo', authorize('admin','branch_manager'), validateLogoUpload, c.uploadLogo);

module.exports = router;
