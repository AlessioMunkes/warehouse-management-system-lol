// ─────────────────────────────────────────────────────────────
// server/src/routes/push.routes.js
//
// Phone notifications: the key a phone needs to subscribe, and
// turning them on or off for the person signed in. Sending lives in
// push.service.js.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth from '../middleware/auth.middleware.js';
import pushService from '../services/push.service.js';

const router = express.Router();

const respondError = (res, err, label) => {
  const status = err.status || 500;
  if (status >= 500) console.error(`[${label}]`, err.message);
  res.status(status).json({
    success: false,
    message: status < 500 || err.status ? err.message : 'Could not update phone notifications.',
  });
};

// GET /api/push/public-key → { publicKey } (null when push is off)
router.get('/public-key', auth, (_req, res) => {
  res.status(200).json({ success: true, data: { publicKey: pushService.publicKey() } });
});

// POST /api/push/subscribe  { subscription }
router.post('/subscribe', auth, async (req, res) => {
  try {
    await pushService.subscribe(req.user, req.body?.subscription, req.get('user-agent'));
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    respondError(res, err, 'pushSubscribe');
  }
});

// POST /api/push/unsubscribe  { endpoint }
router.post('/unsubscribe', auth, async (req, res) => {
  try {
    await pushService.unsubscribe(req.user, req.body?.endpoint);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    respondError(res, err, 'pushUnsubscribe');
  }
});

export default router;
