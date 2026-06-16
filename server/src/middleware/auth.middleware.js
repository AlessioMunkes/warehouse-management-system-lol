// ─────────────────────────────────────────────────────────────
// server/src/middleware/auth.middleware.js
//
// token now read from httpOnly cookie instead of the Authorization header.
// ─────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';

export const ROLES = {
  PACKER:   'packer',
  RECEIVER: 'receiver',
  MANAGER:  'manager',
  ADMIN:    'admin',
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