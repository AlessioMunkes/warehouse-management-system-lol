// ─────────────────────────────────────────────────────────────
// server/src/controllers/user.controller.js
//
// Thin HTTP layer. Pulls values off the request, calls the service,
// shapes the response. No validation and no SQL live here — same
// division of labour as supplier.controller.js.
//
// Reads err.status rather than string-matching err.message, the same
// convention as supplier.controller.js. Messages are only echoed to
// the client for status < 500 — a 500 is by definition something the
// caller cannot act on, and its message may carry database internals.
// ─────────────────────────────────────────────────────────────
import userService from '../services/user.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

// ── GET /api/users?includeInactive=&search= ───────────────────
const list = async (req, res) => {
  try {
    const data = await userService.listUsers({
      includeInactive: req.query.includeInactive,
      search: req.query.search,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listUsers', 'Failed to retrieve users.');
  }
};

// ── GET /api/users/:id ─────────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const data = await userService.getUser(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getUser', 'Failed to retrieve user.');
  }
};

// ── POST /api/users ─────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const data = await userService.createUser(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'createUser', 'Failed to create user.');
  }
};

// ── PATCH /api/users/:id ───────────────────────────────────────
const update = async (req, res) => {
  try {
    const data = await userService.updateUser(req.params.id, req.body, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'updateUser', 'Failed to update user.');
  }
};

// ── PATCH /api/users/:id/status ─────────────────────────────────
// Activate or deactivate. Soft only — is_active is the entire removal
// story here, same reasoning as suppliers, just without an ON DELETE
// RESTRICT forcing the point: an account is a record of who did what,
// and audit_log needs the actor row to keep meaning something.
const setStatus = async (req, res) => {
  try {
    const data = await userService.setUserStatus(req.params.id, req.body, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'setUserStatus', 'Failed to change user status.');
  }
};

export default {
  list,
  getOne,
  register,
  update,
  setStatus,
};
