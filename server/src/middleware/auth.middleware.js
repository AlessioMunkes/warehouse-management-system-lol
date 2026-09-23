// ─────────────────────────────────────────────────────────────
// server/src/middleware/auth.middleware.js
//
// token now read from httpOnly cookie instead of the Authorization header.
// ─────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import { runInWarehouse, isValidWarehouseCode, currentWarehouse } from '../config/warehouseContext.js';
import { isMultiWarehouse, warehouseCodes } from '../config/warehouses.js';

export const ROLES = {
  WORKER:   'warehouse_worker',
  MANAGER:  'manager',
  ADMIN:    'admin',
  GUEST:    'guest',
};

// ── Multi-warehouse ───────────────────────────────────────────
// With one database (WAREHOUSE_DB_URLS unset) none of this runs and
// auth behaves exactly as it always has.
//
// With several, a staff token carries every warehouse the person may
// enter and their id and role at each (set by login.route.js):
//   { username, warehouses: { cpt: { id: 4, role: 'manager' }, ... } }
// Each request says which warehouse it is for in the X-Warehouse
// header. auth checks the token allows it, sets req.user to that
// site's id and role, and runs the rest of the request inside that
// warehouse, so every query reaches that site's database. Existing
// controllers and requireRole keep reading req.user.id / .role.
//
// A guest token names its one warehouse: { id, role: 'guest', warehouse }.
export const WAREHOUSE_HEADER = 'X-Warehouse';

const readRequestedWarehouse = (req) =>
  String(req.get(WAREHOUSE_HEADER) || '').trim().toLowerCase();

// The warehouses in this token that this deployment still serves. A
// site removed from WAREHOUSE_DB_URLS drops out even from old tokens.
const allowedWarehouses = (decoded) => {
  const sites = decoded?.warehouses;
  if (!sites || typeof sites !== 'object' || Array.isArray(sites)) return null;
  const configured = new Set(warehouseCodes());
  return Object.keys(sites).filter((code) =>
    isValidWarehouseCode(code) &&
    configured.has(code) &&
    Number.isInteger(sites[code]?.id) &&
    typeof sites[code]?.role === 'string'
  );
};

const enterWarehouse = (decoded, req, res, next) => {
  const asked = readRequestedWarehouse(req);
  if (asked && !isValidWarehouseCode(asked)) {
    return res.status(400).json({ code: 'WAREHOUSE_INVALID', message: 'Unknown warehouse.' });
  }

  // ── Guests: exactly one warehouse, fixed at sign-in ──
  if (decoded.role === ROLES.GUEST) {
    const code = decoded.warehouse;
    if (!isValidWarehouseCode(code) || !warehouseCodes().includes(code)) {
      return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
    if (asked && asked !== code) {
      return res.status(403).json({ code: 'WAREHOUSE_FORBIDDEN', message: 'You do not have access to that warehouse.' });
    }
    req.user = { ...decoded, warehouse: code };
    return runInWarehouse(code, next);
  }

  // ── Staff ──
  const allowed = allowedWarehouses(decoded);
  if (allowed === null) {
    // A token from single-warehouse mode, before multi-warehouse was
    // switched on. It names no warehouse, so it cannot be trusted with one.
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
  if (allowed.length === 0) {
    return res.status(403).json({ code: 'WAREHOUSE_FORBIDDEN', message: 'Your account has no warehouse access. Speak to your administrator.' });
  }

  let code = asked;
  if (!code) {
    if (allowed.length > 1) {
      return res.status(400).json({ code: 'WAREHOUSE_REQUIRED', message: 'Choose a warehouse.', warehouses: allowed });
    }
    code = allowed[0];
  }
  if (!allowed.includes(code)) {
    return res.status(403).json({ code: 'WAREHOUSE_FORBIDDEN', message: 'You do not have access to that warehouse.' });
  }

  const site = decoded.warehouses[code];
  req.user = {
    id:         site.id,
    role:       site.role,
    username:   decoded.username,
    warehouse:  code,
    warehouses: allowed,
  };
  return runInWarehouse(code, next);
};

// Verifies the cookie and returns the decoded token, or sends the 401
// itself and returns null.
const verifySession = (req, res) => {
  // Read from the httpOnly cookie (set by login route)
  const token = req.cookies?.wms_token || null;

  if (!token) {
    res.status(401).json({ message: 'Access denied. Please log in.' });
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401).json({ message: 'Session expired. Please log in again.' });
    return null;
  }
};

// ── auth ──────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const decoded = verifySession(req, res);
  if (!decoded) return undefined;

  if (!isMultiWarehouse()) {
    req.user = decoded;
    return next();
  }
  return enterWarehouse(decoded, req, res, next);
};

// ── authIdentity ──────────────────────────────────────────────
// Logged in, but not yet inside any warehouse: for the one endpoint
// that must work BEFORE a warehouse is chosen (GET /api/me/warehouses).
// Sets req.session to the decoded token. Never opens a warehouse, so
// a route using this cannot query any warehouse's data.
export const authIdentity = (req, res, next) => {
  const decoded = verifySession(req, res);
  if (!decoded) return undefined;
  req.session = decoded;
  req.allowedWarehouses = isMultiWarehouse()
    ? (decoded.role === ROLES.GUEST
        ? (warehouseCodes().includes(decoded.warehouse) ? [decoded.warehouse] : [])
        : (allowedWarehouses(decoded) || []))
    : [];
  return next();
};

// ── optionalGuest ─────────────────────────────────────────────
// For routes that are public but behave differently when the caller
// already has a guest session.
//
// The claim endpoints are the case: a volunteer arriving by QR has no
// session and needs a volunteers row created, while one who signed in
// at the gate and picked a pallet off the list already has both. Without
// this, that second path would insert a duplicate arrival for someone
// already in the building.
//
// Never rejects. A missing, expired or malformed token simply means
// req.guest stays null and the route carries on as fully public — the
// stranger with a printed poster must always get through.
export const optionalGuest = (req, _res, next) => {
  const token = req.cookies?.wms_token;
  if (!token) { req.guest = null; return next(); }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.guest = decoded?.role === ROLES.GUEST ? decoded : null;
    // Multi-warehouse: a guest session from another site is a stranger
    // here. Its volunteer id means someone else in this site's database.
    if (req.guest && isMultiWarehouse() && req.guest.warehouse !== currentWarehouse()) {
      req.guest = null;
    }
  } catch {
    req.guest = null;
  }
  next();
};

// ── requireRole ───────────────────────────────────────────────
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied. Please log in.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
};

export default auth;
