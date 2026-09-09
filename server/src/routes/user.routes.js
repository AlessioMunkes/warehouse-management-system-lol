// ─────────────────────────────────────────────────────────────
// server/src/routes/user.routes.js
//
// ROLES
// Admin only, on every route — this is account provisioning, not a
// directory read like suppliers. Nobody below admin can list staff
// accounts, create one, or flip is_active.
//
// ROLES.FINANCE / ROLES.GUEST are not used here at all: 'guest' is not
// a valid users.role value (guests are volunteers, not users — see
// session.route.js), and finance is a leftover the DB CHECK constraint
// no longer allows into users.role. Neither belongs in a role list for
// this resource, so unlike supplier.routes.js there is no comment
// needed explaining an absence — this file just never imports them.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import userController               from '../controllers/user.controller.js';

const router = express.Router();

const ADMIN_ONLY = [ROLES.ADMIN];

router.get('/',
  auth, requireRole(...ADMIN_ONLY), userController.list);

router.post('/',
  auth, requireRole(...ADMIN_ONLY), userController.register);

router.get('/:id',
  auth, requireRole(...ADMIN_ONLY), validateIntId, userController.getOne);

router.patch('/:id',
  auth, requireRole(...ADMIN_ONLY), validateIntId, userController.update);

router.patch('/:id/status',
  auth, requireRole(...ADMIN_ONLY), validateIntId, userController.setStatus);

export default router;
