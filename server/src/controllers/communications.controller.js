// ─────────────────────────────────────────────────────────────
// server/src/controllers/communications.controller.js
// ─────────────────────────────────────────────────────────────
import { listMessages as list } from '../services/communications.service.js';

// GET /api/communications/messages?type=&status=&limit=&cursor=
const listMessages = async (req, res) => {
  try {
    const data = await list(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[listMessages]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to load the message history.',
    });
  }
};

export default { listMessages };
