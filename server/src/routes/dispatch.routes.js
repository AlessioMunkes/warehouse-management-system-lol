// ─────────────────────────────────────────────────────────────
// server/src/routes/dispatch.routes.js
// ─────────────────────────────────────────────────────────────
import express                            from 'express';
import auth, { requireRole, ROLES }       from '../middleware/auth.middleware.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import dispatchController                 from '../controllers/dispatch.controller.js';

const router = express.Router();

const ALL_ROLES       = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE];
const DISPATCHERS_UP  = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];  // record a collection at the gate
const MANAGERS_UP     = [ROLES.MANAGER, ROLES.ADMIN];                // sweep / write-offs need a human decision behind them
const FINANCE_UP      = [ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE]; // non-collection history feeds BR-16 reconciliation

// ── Static paths before /:id to prevent shadowing ────────────
router.post('/sweep',           auth, requireRole(...MANAGERS_UP), dispatchController.sweep);
router.get('/non-collections',  auth, requireRole(...FINANCE_UP),  dispatchController.getNonCollectionHistory);
router.get('/history',          auth, requireRole(...ALL_ROLES),   dispatchController.getHistory);

// ── Dispatch note ─────────────────────────────────────────────
// Also a static prefix ahead of /:id — the note is keyed by a
// dispatch_events id, a different id space to the picking_slip_id
// that /:id below uses. /notes/:eventId keeps the two from being
// confused at the URL level, not just in the controller comment.
// ── The goods-out archive ─────────────────────────────────────
// Declared before /notes/:eventId: "options" is not an integer, so
// validateIntParam would 400 it if the id route matched first.
// The receipts archive — manager and admin only. Working the gate stays open
// to workers; reading back every collection ever made is a manager's view.
//
// /notes/:eventId is closed too. Nothing in the gate flow reads it: a
// collection returns its own record from the POST, so no worker screen
// regresses.
router.get('/notes/options',
  auth, requireRole(...MANAGERS_UP),
  dispatchController.getDispatchBeneficiaryOptions
);
router.get('/notes',
  auth, requireRole(...MANAGERS_UP),
  dispatchController.listDispatchNotes
);

router.get('/notes/:eventId',
  auth, requireRole(...MANAGERS_UP),
  validateIntParam('eventId'),
  dispatchController.getDispatchNote
);

// ── The gate board ──────────────────────────────────────────
router.get('/', auth, requireRole(...ALL_ROLES), dispatchController.getBoard);

// ── One pallet at the gate ───────────────────────────────────
router.get('/:id', auth, requireRole(...ALL_ROLES), validateIntId, dispatchController.getGateView);

router.post('/:id/collect',
  auth, requireRole(...DISPATCHERS_UP),
  validateIntId,
  dispatchController.collect
);

export default router;