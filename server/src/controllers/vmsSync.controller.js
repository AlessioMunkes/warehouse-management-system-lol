// ─────────────────────────────────────────────────────────────
// server/src/controllers/vmsSync.controller.js
//
// Thin HTTP layer for VMS sync visibility/retry. All business logic
// lives in vmsSync.service.js — controllers here only pull data off
// the request, call the service, and shape the response. Errors are
// forwarded to next(err) for the central error handler in
// server/index.js. No VMS adapter calls, no sync persistence, no
// retry loops here.
// ─────────────────────────────────────────────────────────────
import vmsSyncService from '../services/vmsSync.service.js';

// ── GET /api/love-activism/sync/:entityType/:entityId ────────
const getSyncStatus = async (req, res, next) => {
  try {
    const result = await vmsSyncService.getSyncStatus(req.params.entityType, req.params.entityId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/love-activism/sync/:entityType/:entityId/retry ─
const retrySync = async (req, res, next) => {
  try {
    const result = await vmsSyncService.retrySync(req.params.entityType, req.params.entityId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export default {
  getSyncStatus,
  retrySync,
};
