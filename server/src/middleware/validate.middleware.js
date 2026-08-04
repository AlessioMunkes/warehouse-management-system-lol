// ─────────────────────────────────────────────────────────────
// server/src/middleware/validate.middleware.js
//
// Reusable validation middleware.
// Add more validators here as the API grows.
// ─────────────────────────────────────────────────────────────

// ── validateIntParam ──────────────────────────────────────────
// Factory. Checks that the named route param is a safe positive
// integer before it reaches the controller, so garbage like
// "../../etc/passwd", "0", "-1" or "abc" never travels to the
// database. Values are bound query parameters everywhere, so this
// is not an injection guard — it is there so a bad id comes back
// as a clean 400 instead of a Postgres cast error surfacing as 500.
//
// Usage in a route file:
//   import { validateIntParam } from '../middleware/validate.middleware.js'
//   router.post('/:id/items/:itemId/confirm',
//     auth, requireRole(...), validateIntParam('id'), validateIntParam('itemId'),
//     controller)
export const validateIntParam = (paramName = 'id') => (req, res, next) => {
  const raw = req.params[paramName];

  // Digits only. Number() alone would quietly accept " 1 ", "1e3"
  // and "0x2", none of which should reach a repository.
  if (!/^\d+$/.test(String(raw ?? ''))) {
    return res.status(400).json({ message: `Invalid ${paramName === 'id' ? 'ID' : paramName}.` });
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return res.status(400).json({ message: `Invalid ${paramName === 'id' ? 'ID' : paramName}.` });
  }

  // Overwrite the param with the clean integer so the controller
  // always receives a number, never a raw string.
  req.params[paramName] = value;
  next();
};

// ── validateIntId ─────────────────────────────────────────────
// The common case — kept as a named export so existing route files
// that import it keep working unchanged.
export const validateIntId = validateIntParam('id');