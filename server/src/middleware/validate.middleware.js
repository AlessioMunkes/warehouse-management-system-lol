// ─────────────────────────────────────────────────────────────
// server/src/middleware/validate.middleware.js
//
// Reusable validation middleware.
// Add more validators here as the API grows.
// ─────────────────────────────────────────────────────────────

// ── validateIntId ─────────────────────────────────────────────
// Checks that req.params.id is a safe positive integer before
// it reaches the controller. Prevents passing garbage like
// "../../etc/passwd" or "0" or "-1" to the database.
//
// Usage in a route file:
//   import { validateIntId } from '../middleware/validate.middleware.js'
//   router.get('/:id', auth, requireRole(...), validateIntId, controller)
export const validateIntId = (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid ID.' });
  }

  // Overwrite req.params.id with the clean integer so the
  // controller always receives a number, never a raw string
  req.params.id = id;
  next();
};