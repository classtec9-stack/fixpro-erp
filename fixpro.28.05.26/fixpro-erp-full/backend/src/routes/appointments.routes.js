const router = require('express').Router();
const c = require('../controllers/appointments.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// ── Public endpoints (no auth) ────────────────────────────
router.get('/public/branches',     c.getPublicBranches);
router.get('/public/availability', c.getAvailability);
router.post('/public',             c.createAppointment);

// ── Protected endpoints ───────────────────────────────────
router.use(authenticate);
router.get('/working-hours', c.getWorkingHours);
router.put('/working-hours', authorize('admin','branch_manager'), c.updateWorkingHours);
router.get('/', c.getAppointments);
router.patch('/:id/status', authorize('admin','branch_manager','receptionist'), c.updateAppointmentStatus);
router.post('/:id/convert', authorize('admin','branch_manager','receptionist'), c.convertToTicket);

module.exports = router;
