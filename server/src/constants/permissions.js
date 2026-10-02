// ─────────────────────────────────────────────────────────────
// server/src/constants/permissions.js
//
// Who may do what, named once. Every route file passes one of these to
// requireRole; none declares its own list.
//
// Before this file the same three lists were written out under some
// twenty names across the route files — ALL_ROLES, STAFF_UP, READERS,
// RECEIVERS_UP, PACKERS_UP, MANAGES_UP, ADMIN_OR_MANAGER, WRITERS… —
// so "can a manager do this?" meant reading every file, and changing
// it meant finding every copy. The names differed; the lists did not.
//
//   ALL_STAFF    warehouse workers, managers and admins — anyone with a
//                staff login (reading the catalogue, working the floor)
//   MANAGERS_UP  managers and admins — decisions: approving, adjusting
//                stock, generating slips, the reports
//   ADMIN_ONLY   admins — accounts, the catalogue's master data, the
//                finance link, the email connection
//   GUEST_ONLY   a volunteer's guest session on their own pallet
//
// A route's own comment says why it uses the group it does. Which
// routes use which group is pinned by __tests__/routeRoles.test.js
// against a recorded baseline, so moving a route between groups is a
// deliberate change to that file, not a side effect.
// ─────────────────────────────────────────────────────────────
import { ROLES } from '../middleware/auth.middleware.js';

export const ALL_STAFF   = Object.freeze([ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN]);
export const MANAGERS_UP = Object.freeze([ROLES.MANAGER, ROLES.ADMIN]);
export const ADMIN_ONLY  = Object.freeze([ROLES.ADMIN]);
export const GUEST_ONLY  = Object.freeze([ROLES.GUEST]);

// For a service that needs the same answer outside a route guard —
// "is this a manager's request?" — rather than a third spelling of it.
export const hasRole = (user, group) => Boolean(user && group.includes(user.role));
export const isManagerUp = (user) => hasRole(user, MANAGERS_UP);

export default { ALL_STAFF, MANAGERS_UP, ADMIN_ONLY, GUEST_ONLY, hasRole, isManagerUp };
