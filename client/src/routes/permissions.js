// ─────────────────────────────────────────────────────────────
// client/src/routes/permissions.js
//
// The client's copy of the server's role groups —
// server/src/constants/permissions.js — under the same names, so
// "MANAGERS_UP" means the same people on both sides of the wire. The
// route table (routeTable.js) uses these; nothing else should list
// roles by hand.
//
// The client only decides what a person is SHOWN. The server's
// requireRole decides what they may DO, and is the one that counts.
// ─────────────────────────────────────────────────────────────

export const ALL_STAFF   = Object.freeze(['warehouse_worker', 'manager', 'admin']);
// The floor. Each role sees only its own screens: a manager or admin
// never opens a worker screen, and a worker never opens theirs.
export const WORKERS_ONLY = Object.freeze(['warehouse_worker']);
export const MANAGERS_UP = Object.freeze(['manager', 'admin']);
// Managers but not admins, matching the server. No route uses it at present.
export const MANAGER_ONLY = Object.freeze(['manager']);
export const ADMIN_ONLY  = Object.freeze(['admin']);
export const GUEST_ONLY  = Object.freeze(['guest']);

export const hasRole = (user, group) => Boolean(user && group.includes(user.role));
