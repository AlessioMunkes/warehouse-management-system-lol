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
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import purchaseOrderController      from '../controllers/purchaseOrder.controller.js';

const router = express.Router();


router.get('/',
  auth, requireRole(...ALL_STAFF), purchaseOrderController.list);

router.post('/',
  auth, requireRole(...MANAGERS_UP), purchaseOrderController.create);

// Link QuickBooks PO numbers to ours from an export the client has read.
// Preview only looks; apply writes, all or nothing.
router.post('/quickbooks-import/preview',
  auth, requireRole(...MANAGERS_UP), purchaseOrderController.previewQuickbooksImport);

router.post('/quickbooks-import/apply',
  auth, requireRole(...MANAGERS_UP), purchaseOrderController.applyQuickbooksImport);

// Last: a static path added below this would be swallowed by :id and
// then rejected by validateIntId as a non-integer — the trap already
// documented at the top of supplier.routes.js.
router.get('/:id',
  auth, requireRole(...ALL_STAFF), validateIntId, purchaseOrderController.getOne);

router.patch('/:id/status',
  auth, requireRole(...MANAGERS_UP), validateIntId, purchaseOrderController.setStatus);

router.patch('/:id/quickbooks-ref',
  auth, requireRole(...MANAGERS_UP), validateIntId, purchaseOrderController.setQuickbooksReference);

// Resend the "new PO" email to Finance. Only meaningful when the first
// send failed or never happened; the service refuses overlapping sends.
router.post('/:id/finance-email/resend',
  auth, requireRole(...MANAGERS_UP), validateIntId, purchaseOrderController.resendFinanceEmail);

// Header + line edit, and outright removal — both restricted to a
// 'pending' order by purchaseOrder.service.js, not by the role check
// here. Same MANAGERS_UP as create: editing/deleting a PO is the same
// spend-control decision as raising one in the first place.
router.put('/:id',
  auth, requireRole(...MANAGERS_UP), validateIntId, purchaseOrderController.update);

router.delete('/:id',
  auth, requireRole(...MANAGERS_UP), validateIntId, purchaseOrderController.remove);

export default router;
