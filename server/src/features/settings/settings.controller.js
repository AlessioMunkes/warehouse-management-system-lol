// ─────────────────────────────────────────────────────────────
// server/src/features/settings/settings.controller.js
// ─────────────────────────────────────────────────────────────
import { checkConnections } from './connections.service.js';
import settings from './settings.service.js';

const respond = (res, err, where, fallback) => {
  console.error(`[${where}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({ success: false, message: status < 500 ? err.message : fallback });
};

// GET /api/settings — every setting, its definition and current value.
const list = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await settings.list() });
  } catch (err) { respond(res, err, 'listSettings', 'Failed to load settings.'); }
};

// PATCH /api/settings — { key: value, … }, saved together.
const update = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await settings.update(req.body, req.user.id) });
  } catch (err) { respond(res, err, 'updateSettings', 'Failed to save settings.'); }
};

// GET /api/settings/connections — every outside service, checked now.
const connections = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await checkConnections() });
  } catch (err) {
    return respond(res, err, 'connections', 'Could not check the connections.');
  }
};

export default { list, update, connections };
