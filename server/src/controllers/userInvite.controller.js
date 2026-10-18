// ─────────────────────────────────────────────────────────────
// server/src/controllers/userInvite.controller.js
//
// Thin HTTP layer, same division of labour as user.controller.js —
// no validation and no SQL here.
//
// `reason` IS ECHOED ON 410s. resolveInviteByToken/acceptInvite in
// the service attach err.reason ('expired' | 'revoked' | 'accepted')
// so the accept page can show distinct copy for "cancelled" vs
// "expired" vs "already used" rather than one generic message.
// ─────────────────────────────────────────────────────────────
import userInviteService from '../services/userInvite.service.js';

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

// ── Admin: POST /api/invites ───────────────────────────────────
const create = async (req, res) => {
  try {
    const data = await userInviteService.createInvite(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'createInvite', 'Failed to create invite.');
  }
};

// ── Admin: GET /api/invites ─────────────────────────────────────
const listPending = async (req, res) => {
  try {
    const data = await userInviteService.listPendingInvites();
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listPendingInvites', 'Failed to retrieve pending invites.');
  }
};

// ── Admin: POST /api/invites/:id/resend ─────────────────────────
const resend = async (req, res) => {
  try {
    const data = await userInviteService.resendInvite(req.params.id, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'resendInvite', 'Failed to resend invite.');
  }
};

// ── Admin: POST /api/invites/:id/revoke ─────────────────────────
const revoke = async (req, res) => {
  try {
    const data = await userInviteService.revokeInvite(req.params.id, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'revokeInvite', 'Failed to revoke invite.');
  }
};

// ── Public: GET /api/invites/:token ─────────────────────────────
const resolve = async (req, res) => {
  try {
    const data = await userInviteService.resolveInviteByToken(req.params.token);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'resolveInvite', 'Could not load that invite.');
  }
};

// ── Public: POST /api/invites/:token/accept ─────────────────────
const accept = async (req, res) => {
  try {
    const data = await userInviteService.acceptInvite(req.params.token, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'acceptInvite', 'Could not complete that invite.');
  }
};

export default {
  create,
  listPending,
  resend,
  revoke,
  resolve,
  accept,
};
