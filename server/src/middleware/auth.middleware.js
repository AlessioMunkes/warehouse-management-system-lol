// ─────────────────────────────────────────────────────────────
// server/src/middleware/auth.middleware.js
//
// token now read from httpOnly cookie instead of the Authorization header.
// ─────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';

export const ROLES = {
  WORKER:   'warehouse_worker',
  MANAGER:  'manager',
  ADMIN:    'admin',
  GUEST:    'guest',
};

// ── auth ──────────────────────────────────────────────────────
const auth = (req, res, next) => {
  // Read from the httpOnly cookie (set by login route)
  const token = req.cookies?.wms_token || null;

  if (!token) {
    return res.status(401).json({ message: 'Access denied. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
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