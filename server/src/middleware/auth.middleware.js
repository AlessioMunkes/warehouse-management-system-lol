// ─────────────────────────────────────────────────────────────
// server/src/middleware/auth.middleware.js
//
// token now read from httpOnly cookie instead of the Authorization header.
// ─────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import { runInWarehouse, isValidWarehouseCode, currentWarehouse } from '../config/warehouseContext.js';
import { isMultiWarehouse, warehouseCodes } from '../config/warehouses.js';
import { AUTH_COOKIE, authCookieOptions } from '../config/cookie.js';
import sessionRepo from '../repositories/session.repository.js';
import { tokenSessionVersion } from '../utils/sessionVersion.js';

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

// ── The account behind the token, as it is now ───────────────
// A token is a snapshot from when it was signed, up to 8 hours ago (12
// for a guest). Trusting it alone meant a deactivated, archived or
// demoted account kept its old access, and a changed or reset password
// left every earlier session working, until the token ran out.
//
// So every request re-reads the account. Staff: it must still exist
// and be active, its session_version must match the token's (see
// utils/sessionVersion.js), and the role used is the one it has NOW.
// Guests: the visit must not have been signed out.
//
// A database error is a 503 and keeps the cookie: the database being
// briefly unreachable does not make the session invalid.
const endSession = (res, message) => {
  res.clearCookie(AUTH_COOKIE, authCookieOptions());
  return res.status(401).json({ message });
};

const checkCurrentAccount = async (req, res, next, claims) => {
  let refusal = null;
  try {
    if (req.user.role === ROLES.GUEST) {
      const visit = await sessionRepo.findGuestSession(req.user.id);
      if (!visit) refusal = 'Session expired. Please sign in again.';
      else if (visit.signed_out_at) refusal = 'This visit has been signed out.';
    } else {
      const account = await sessionRepo.findStaffSession(req.user.id);
      if (!account || account.archived_at) {
        refusal = 'Session expired. Please log in again.';
      } else if (account.is_active === false) {
        refusal = 'This account has been deactivated.';
      } else if ((account.session_version ?? 0) !== tokenSessionVersion(claims)) {
        refusal = 'Your password or access changed. Please log in again.';
      } else {
        // users.role is NOT NULL, so this is always the role now.
        req.user.role = account.role ?? req.user.role;
        req.user.username = account.username ?? req.user.username;
      }
    }
  } catch (err) {
    console.error('[auth] session check failed:', err.message);
    return res.status(503).json({ message: 'Could not check your session. Try again.' });
  }
  if (refusal) return endSession(res, refusal);
  return next();
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
    return runInWarehouse(code, () => checkCurrentAccount(req, res, next, decoded));
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
  return runInWarehouse(code, () => checkCurrentAccount(req, res, next, site));
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

  // The token as signed, for re-signing it after the person changes
  // their own password (session.route.js).
  req.sessionClaims = decoded;
  if (!isMultiWarehouse()) {
    req.user = decoded;
    return checkCurrentAccount(req, res, next, decoded);
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
// Pass a group from constants/permissions.js — requireRole(...MANAGERS_UP)
// — rather than listing roles at the route.
//
// The guard carries the roles it allows as `.roles`. Nothing reads it
// at request time; routeRoles.test.js walks every router and reads it,
// so a change to who may call a route shows up as a failing test
// rather than slipping through a refactor.
export const requireRole = (...allowedRoles) => {
  const guard = (req, res, next) => {
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
  guard.roles = Object.freeze([...allowedRoles]);
  return guard;
};

export default auth;
