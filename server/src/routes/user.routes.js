// ─────────────────────────────────────────────────────────────
// server/src/routes/user.routes.js
//
// ROLES
// Admin only, on every route — this is account provisioning, not a
// directory read like suppliers. Nobody below admin can list staff
// accounts, create one, or flip is_active.
//
// ROLES.GUEST is not used here: 'guest' is not a valid users.role value
// at all (guests are volunteers, not users — see session.route.js), so
// it does not belong in a role list for this resource.
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

router.delete('/:id',
  auth, requireRole(...ADMIN_ONLY), validateIntId, userController.remove);

export default router;
