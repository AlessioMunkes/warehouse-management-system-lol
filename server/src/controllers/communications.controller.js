// ─────────────────────────────────────────────────────────────
// server/src/controllers/communications.controller.js
// ─────────────────────────────────────────────────────────────
import { listMessages as list } from '../services/communications.service.js';
import { sendError } from '../utils/httpError.js';

// GET /api/communications/messages?type=&status=&limit=&cursor=
const listMessages = async (req, res) => {
  try {
    const data = await list(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[listMessages]', err.message);
    sendError(res, err, 'Failed to load the message history.');
  }
};

export default { listMessages };
