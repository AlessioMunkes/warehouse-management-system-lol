// ─────────────────────────────────────────────────────────────
// server/src/routes/push.routes.js
//
// Phone notifications: the key a phone needs to subscribe, and
// turning them on or off for the person signed in. Sending lives in
// push.service.js.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF } from '../constants/permissions.js';
import pushService from '../services/push.service.js';
import { sendError } from '../utils/httpError.js';

const router = express.Router();

// Staff only. A subscription is saved against a users row, and a
// guest's id is a volunteers row: saving it would attach the phone to
// whichever staff member happens to share that number.
router.use(auth, requireRole(...ALL_STAFF));

const respondError = (res, err, label) => {
  if (!err.status || err.status >= 500) console.error(`[${label}]`, err.message);
  // A status the service set means its message was written for the
  // reader, 5xx included (push being switched off, say).
  sendError(res, err, 'Could not update phone notifications.', { passThrough: err.status ? [err.status] : [] });
};

// GET /api/push/public-key → { publicKey } (null when push is off)
router.get('/public-key', (_req, res) => {
  res.status(200).json({ success: true, data: { publicKey: pushService.publicKey() } });
});

// POST /api/push/subscribe  { subscription }
router.post('/subscribe', async (req, res) => {
  try {
    await pushService.subscribe(req.user, req.body?.subscription, req.get('user-agent'));
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    respondError(res, err, 'pushSubscribe');
  }
});

// POST /api/push/unsubscribe  { endpoint }
router.post('/unsubscribe', async (req, res) => {
  try {
    await pushService.unsubscribe(req.user, req.body?.endpoint);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    respondError(res, err, 'pushUnsubscribe');
  }
});

export default router;
