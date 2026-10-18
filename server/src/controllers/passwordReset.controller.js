// ─────────────────────────────────────────────────────────────
// server/src/controllers/passwordReset.controller.js
//
// Thin HTTP layer, same division of labour as userInvite.controller.js
// — no validation and no SQL here.
//
// `reason` IS ECHOED ON 410s, same as userInvite.controller.js: the
// service attaches err.reason ('expired' | 'used' | 'superseded') so
// the reset page can show distinct copy for each.
// ─────────────────────────────────────────────────────────────
import passwordResetService from '../services/passwordReset.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  const body = {
    success: false,
    message: status < 500 ? err.message : fallback,
  };
  if (err.reason) body.reason = err.reason;
  res.status(status).json(body);
};

// ── Public: POST /api/password-reset/request ─────────────────────
// requestReset is synchronous by design (it never awaits its own side
// effects — see passwordReset.service.js's file header), so there is
// nothing to await here either.
const request = (req, res) => {
  const data = passwordResetService.requestReset(req.body?.email, req.ip);
  res.status(200).json({ success: true, data });
};

// ── Public: GET /api/password-reset/:token ────────────────────────
const resolve = async (req, res) => {
  try {
    const data = await passwordResetService.resolveReset(req.params.token);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'resolveReset', 'Could not load that reset link.');
  }
};

// ── Public: POST /api/password-reset/:token/confirm ───────────────
const confirm = async (req, res) => {
  try {
    const data = await passwordResetService.confirmReset(req.params.token, req.body?.password);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'confirmReset', 'Could not reset your password.');
  }
};

export default {
  request,
  resolve,
  confirm,
};
