// ─────────────────────────────────────────────────────────────
// server/src/routes/purchaseOrder.routes.js
//
// ROLES
// Reads are open to warehouse staff: the receiving flow needs to see
// what was ordered before it can check a delivery against it.
// Creation is manager and admin only — raising a PO commits Ladles of
// Love to spend, and Warehouse Visit 2.2 is explicit that PO control
// sits with the manager, calling it a security requirement.
//
// The role constants match users.role's CHECK exactly — see
// supplier.routes.js.
//
// BR-07C's automatic manager notification is still not built — the
// status-change route below only changes the status.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import purchaseOrderController      from '../controllers/purchaseOrder.controller.js';

const router = express.Router();

const READERS    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const MANAGES_UP = [ROLES.MANAGER, ROLES.ADMIN];

router.get('/',
  auth, requireRole(...READERS), purchaseOrderController.list);

router.post('/',
  auth, requireRole(...MANAGES_UP), purchaseOrderController.create);

// Last: a static path added below this would be swallowed by :id and
// then rejected by validateIntId as a non-integer — the trap already
// documented at the top of supplier.routes.js.
router.get('/:id',
  auth, requireRole(...READERS), validateIntId, purchaseOrderController.getOne);

router.patch('/:id/status',
  auth, requireRole(...MANAGES_UP), validateIntId, purchaseOrderController.setStatus);

router.patch('/:id/quickbooks-ref',
  auth, requireRole(...MANAGES_UP), validateIntId, purchaseOrderController.setQuickbooksReference);

// Header + line edit, and outright removal — both restricted to a
// 'pending' order by purchaseOrder.service.js, not by the role check
// here. Same MANAGES_UP as create: editing/deleting a PO is the same
// spend-control decision as raising one in the first place.
router.put('/:id',
  auth, requireRole(...MANAGES_UP), validateIntId, purchaseOrderController.update);

router.delete('/:id',
  auth, requireRole(...MANAGES_UP), validateIntId, purchaseOrderController.remove);

export default router;
