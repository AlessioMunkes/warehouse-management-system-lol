// ─────────────────────────────────────────────────────────────
// server/src/controllers/adminActivity.controller.js
//
// GET /api/admin/activity  ?from&to&user   — who did what
// GET /api/admin/archive                   — deactivated and deleted items
// ─────────────────────────────────────────────────────────────
import service from '../services/adminActivity.service.js';

const send = (res, err, fallback) => {
  const status = err.status || 500;
  res.status(status).json({ success: false, message: status < 500 ? err.message : fallback });
};

const activity = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await service.listActivity(req.query) });
  } catch (err) {
    console.error('[adminActivity]', err.message);
    send(res, err, 'Failed to load the activity log.');
  }
};

const archive = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await service.listArchived() });
  } catch (err) {
    console.error('[adminArchive]', err.message);
    send(res, err, 'Failed to load archived items.');
  }
};

export default { activity, archive };
