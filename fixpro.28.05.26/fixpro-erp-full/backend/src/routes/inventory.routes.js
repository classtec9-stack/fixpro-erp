const router = require('express').Router();
const c   = require('../controllers/inventory.controller');
const adj = require('../controllers/adjustments.controller');
const tr  = require('../controllers/transfers.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
router.use(authenticate);

// ── Parts ─────────────────────────────────────────────────
router.get('/alerts',               c.getLowStockAlerts);
router.get('/parts',                c.getParts);
router.get('/parts/:id',            c.getPartById);
router.get('/parts/:id/audit',      authorize('admin','branch_manager','accountant'), c.getPartAuditLog);
router.post('/parts',               authorize('admin','branch_manager','warehouse'), c.createPart);
router.put('/parts/:id',            authorize('admin','branch_manager','warehouse'), c.updatePart);
router.delete('/parts/:id',         authorize('admin','branch_manager'), c.deletePart);
router.post('/parts/:id/restock',   authorize('admin','branch_manager','warehouse'), c.restock);

// ── Barcode Scanner ───────────────────────────────────────
router.post('/scan',                c.scanBarcode);

// ── Categories ────────────────────────────────────────────
router.get('/categories',           c.getCategories);
router.post('/categories',          authorize('admin','branch_manager','warehouse'), c.createCategory);

// ── Locations ─────────────────────────────────────────────
router.get('/locations',            c.getLocations);
router.post('/locations',           authorize('admin','branch_manager'), c.createLocation);

// ── Movements ─────────────────────────────────────────────
router.get('/movements',            c.getMovements);

// ── Adjustments ───────────────────────────────────────────
router.get('/adjustments',          adj.getAdjustments);
router.post('/adjustments',         authorize('admin','branch_manager','warehouse'), adj.createAdjustment);
router.post('/adjustments/:id/approve', authorize('admin','branch_manager'), adj.approveAdjustment);
router.post('/adjustments/:id/reject',  authorize('admin','branch_manager'), adj.rejectAdjustment);

// ── Reorder Rules ─────────────────────────────────────────
router.get('/reorder-rules',        authorize('admin','branch_manager','warehouse'), c.getReorderRules);
router.post('/reorder-rules',       authorize('admin','branch_manager','warehouse'), c.createReorderRule);
router.post('/reorder-rules/check', authorize('admin','branch_manager','warehouse'), c.checkReorderRules);

// ── Supplier Catalog ──────────────────────────────────────
router.get('/supplier-catalog/:partId',  tr.getSupplierCatalog);
router.post('/supplier-catalog',         authorize('admin','branch_manager','warehouse'), tr.upsertSupplierCatalog);

// ── Transfers ─────────────────────────────────────────────
router.get('/transfers',                authorize('admin','branch_manager','warehouse'), tr.getTransfers);
router.post('/transfers',               authorize('admin','branch_manager','warehouse'), tr.createTransfer);
router.get('/transfers/:id',            authorize('admin','branch_manager','warehouse'), tr.getTransferById);
router.patch('/transfers/:id/approve',  authorize('admin','branch_manager'), tr.approveTransfer);
router.patch('/transfers/:id/receive',  authorize('admin','branch_manager','warehouse'), tr.receiveTransfer);
router.patch('/transfers/:id/cancel',   authorize('admin','branch_manager'), tr.cancelTransfer);

module.exports = router;
