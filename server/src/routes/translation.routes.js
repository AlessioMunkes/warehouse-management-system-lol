// ─────────────────────────────────────────────────────────────
// server/src/routes/translation.routes.js
//
// Settings → Wording (translation.service.js).
//   GET    /api/translations   the overrides, for every signed-in screen
//                              that is shown in Afrikaans or isiXhosa:
//                              staff and volunteers alike. Not secret.
//   PUT    /api/translations   { language, kind, source, text } — admin
//   DELETE /api/translations?language=..&kind=..&source=..  back to the
//                              built-in wording — admin
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { SIGNED_IN, ADMIN_ONLY } from '../constants/permissions.js';
import translationService from '../services/translation.service.js';
import { sendError } from '../utils/httpError.js';

const router = express.Router();

const handle = (fn, label) => async (req, res) => {
  try {
    return res.json({ success: true, data: await fn(req) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error(`[translations] ${label}:`, error.message);
    return sendError(res, error, `Could not ${label}.`);
  }
};

router.get('/', auth, requireRole(...SIGNED_IN),
  handle(() => translationService.overrides(), 'load the wording'));
router.put('/', auth, requireRole(...ADMIN_ONLY),
  handle((req) => translationService.save(req.body, req.user.id), 'save the wording'));
router.delete('/', auth, requireRole(...ADMIN_ONLY),
  handle((req) => translationService.reset(req.query), 'reset the wording'));

export default router;
