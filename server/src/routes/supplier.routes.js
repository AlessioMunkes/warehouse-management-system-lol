// ─────────────────────────────────────────────────────────────
// server/src/routes/supplier.routes.js
//
// ROUTE ORDER MATTERS HERE.
// /prospects must be declared before /:id, or Express matches
// GET /api/suppliers/prospects against the :id route, validateIntId
// rejects "prospects" as a non-integer, and the prospect pad returns
// 400 forever. Same reasoning as the /adjust note in stock.routes.js.
//
// ROLES
// Reads are open to warehouse staff because the receiving flow needs
// the supplier list to populate its dropdown. Writes are manager and
// admin only: registering a supplier creates a permanent, FK'd row
// that feeds every procurement metric.
//
// users.role's CHECK allows warehouse_worker, manager and admin only,
// and the role constants now match it exactly, so every list in this
// file describes access an account can actually hold.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import supplierController           from '../controllers/supplier.controller.js';

const router = express.Router();

const READERS = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

// Admin only, matching products.
const WRITERS = [ROLES.ADMIN];

// The prospect pad is NOT master data and stays with the manager.
// A prospect is a lead — a name and a note about someone who might
// supply us one day. Nothing references it, nothing counts against it,
// and it is the manager who meets these people. Converting one to a
// real supplier DOES create master data, so that single route sits
// with the admin below.
const PROSPECTS = [ROLES.MANAGER, ROLES.ADMIN];

// ── Prospects (static paths — MUST precede /:id) ──────────────
router.get('/prospects',
  auth, requireRole(...PROSPECTS), supplierController.listProspects);

router.post('/prospects',
  auth, requireRole(...PROSPECTS), supplierController.addProspect);

router.patch('/prospects/:id',
  auth, requireRole(...PROSPECTS), validateIntId, supplierController.updateProspect);

router.post('/prospects/:id/delete',
  auth, requireRole(...PROSPECTS), validateIntId, supplierController.removeProspect);

router.post('/prospects/:id/convert',
  auth, requireRole(...WRITERS), validateIntId, supplierController.convertProspect);

// ── Suppliers ─────────────────────────────────────────────────
router.get('/',
  auth, requireRole(...READERS), supplierController.list);

router.post('/',
  auth, requireRole(...WRITERS), supplierController.register);

router.get('/:id',
  auth, requireRole(...READERS), validateIntId, supplierController.getOne);

router.patch('/:id',
  auth, requireRole(...WRITERS), validateIntId, supplierController.update);

router.patch('/:id/status',
  auth, requireRole(...WRITERS), validateIntId, supplierController.setStatus);

// Admin-only — see the matching note in product.routes.js.
router.delete('/:id',
  auth, requireRole(ROLES.ADMIN), validateIntId, supplierController.remove);

export default router;
