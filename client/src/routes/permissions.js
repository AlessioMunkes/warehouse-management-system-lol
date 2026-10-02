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
export const MANAGERS_UP = Object.freeze(['manager', 'admin']);
export const ADMIN_ONLY  = Object.freeze(['admin']);
export const GUEST_ONLY  = Object.freeze(['guest']);

// Client-only. The server lets every staff role record a donation
// (ALL_STAFF on donation.routes.js); the intake screens are hidden from
// managers because logging a donation is floor work. Admins keep them
// for corrections.
export const DONATION_INTAKE = Object.freeze(['warehouse_worker', 'admin']);

export const hasRole = (user, group) => Boolean(user && group.includes(user.role));
