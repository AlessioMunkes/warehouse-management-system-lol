// ─────────────────────────────────────────────────────────────
// server/src/routes/session.route.js
//
// GET /api/me — "who am I, right now?"
//
// The client stores the safe user object in localStorage so the UI
// knows who is logged in after a refresh. localStorage has no expiry;
// the auth cookie expires after 8 hours. Without this endpoint the
// two drift apart: staff open the app the next morning, the UI reads
// the stale localStorage entry and renders them as logged in, and
// then every single request comes back 401. The app looks broken.
//
// So the client asks the server on boot instead of trusting its own
// cache, and the server is the only thing that decides whether a
// session is still real.
//
// This deliberately re-reads the database rather than just echoing
// the JWT claims back. A token is a snapshot from up to 8 hours ago:
// re-reading means a deactivated account loses access on next load
// instead of at token expiry, and a role change takes effect then
// too, rather than the user keeping stale permissions for the rest
// of the shift.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { authIdentity } from '../middleware/auth.middleware.js';
import accountRepository from '../repositories/account.repository.js';
import volunteerRepository from '../repositories/volunteer.repository.js';
import sessionRepository from '../repositories/session.repository.js';
import { AUTH_COOKIE, authCookieOptions, setStaffSessionCookie } from '../config/cookie.js';
import { warehouseName, isMultiWarehouse } from '../config/warehouses.js';
import { accountChangeRateLimiter } from '../middleware/rateLimiter.middleware.js';
import accountService from '../services/account.service.js';
import { sendError } from '../utils/httpError.js';

const router = express.Router();

// In multi-warehouse mode, which site this response is about and which
// others the person can switch to. Absent in single-warehouse mode, so
// the response shape there is unchanged.
const warehouseFields = (req) => {
  if (!req.user?.warehouse) return {};
  const codes = req.user.warehouses || [req.user.warehouse];
  return {
    warehouse:  req.user.warehouse,
    warehouses: codes.map((code) => ({ code, name: warehouseName(code) })),
  };
};

// ── GET /api/me/warehouses ────────────────────────────────────
// The warehouses this session may enter, for the switcher. Works
// before a warehouse is chosen, so it reads only the session token and
// never touches a warehouse database. multiWarehouse:false means the
// deployment has one database and the client should show no switcher.
router.get('/warehouses', authIdentity, (req, res) => {
  const multiWarehouse = isMultiWarehouse();
  return res.json({
    success: true,
    multiWarehouse,
    warehouses: req.allowedWarehouses.map((code) => ({
      code,
      name: warehouseName(code),
      role: req.session.role === 'guest' ? 'guest' : req.session.warehouses?.[code]?.role,
    })),
  });
});

// Kill a session whose token is technically valid but whose account
// is gone or disabled. Clearing the cookie stops the browser
// re-sending a token we have already rejected on every subsequent
// request for the next 8 hours.
const rejectSession = (res, message) => {
  res.clearCookie(AUTH_COOKIE, authCookieOptions());
  return res.status(401).json({ success: false, message });
};

// ── GET / PATCH /api/me/language ──────────────────────────────
// The language this person reads the floor screens in (migration 042).
// On the account rather than the device, because tablets are shared.
// English for a guest, and for a database without the column yet:
// a missing preference must never stop anyone working.
const LANGUAGES = ['en', 'af', 'xh'];

router.get('/language', auth, async (req, res) => {
  if (req.user.role === 'guest') return res.json({ success: true, data: { language: 'en' } });
  try {
    const saved = await accountRepository.getLanguage(req.user.id);
    const language = LANGUAGES.includes(saved) ? saved : 'en';
    return res.json({ success: true, data: { language } });
  } catch (error) {
    console.error('[session] language not read, using English:', error.message);
    return res.json({ success: true, data: { language: 'en' } });
  }
});

router.patch('/language', auth, async (req, res) => {
  const language = req.body?.language;
  if (!LANGUAGES.includes(language)) {
    return res.status(400).json({ success: false, message: 'Choose English, Afrikaans or isiXhosa.' });
  }
  if (req.user.role === 'guest') {
    return res.status(403).json({ success: false, message: 'A language can only be saved on a staff account.' });
  }
  try {
    await accountRepository.setLanguage(req.user.id, language);
    return res.json({ success: true, data: { language } });
  } catch (error) {
    console.error('[session] language not saved:', error.message);
    return sendError(res, error, 'Could not save your language.');
  }
});

// ── PATCH /api/me/password and /api/me/email ──────────────────
// A staff member changing their own sign-in details from Profile. Both
// need the current password (account.service.js). Guests have no
// account to change.
const ownAccount = (change, label, after = null) => async (req, res) => {
  if (req.user.role === 'guest') {
    return res.status(403).json({ success: false, message: 'Only a staff account can be changed.' });
  }
  try {
    const data = await change(req.user.id, req.body ?? {});
    if (after) await after(req, res);
    return res.json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error(`[session] ${label} not changed:`, error.message);
    return sendError(res, error, `Could not change your ${label}.`);
  }
};

// A new password ends every session signed in with the old one (the
// account's session version goes up). The one making the change is
// signed again with the new version, so it carries on.
const keepThisSession = async (req, res) => {
  const account = await sessionRepository.findStaffSession(req.user.id);
  const sv = account?.session_version ?? 0;
  const { iat: _iat, exp: _exp, ...claims } = req.sessionClaims;
  if (claims.warehouses && req.user.warehouse) {
    const site = req.user.warehouse;
    claims.warehouses = { ...claims.warehouses, [site]: { ...claims.warehouses[site], sv } };
  } else {
    claims.sv = sv;
  }
  setStaffSessionCookie(res, claims);
};

router.patch('/password', auth, accountChangeRateLimiter,
  ownAccount(accountService.changePassword, 'password', keepThisSession));
router.patch('/email', auth, accountChangeRateLimiter, ownAccount(accountService.changeEmail, 'email'));

router.get('/', auth, async (req, res) => {
  try {
    // ── Guests live in `volunteers`, not `users` ────────────────
    // A guest token carries { id, role: 'guest' } and nothing else,
    // so there is no users row to look up — querying `users` with a
    // volunteer id would match an unrelated staff member.
    if (req.user.role === 'guest') {
      const volunteer = await volunteerRepository.getGuestSession(req.user.id);

      if (!volunteer)             return rejectSession(res, 'Session expired. Please sign in again.');
      if (volunteer.signed_out_at) return rejectSession(res, 'This visit has been signed out.');

      return res.json({
        success: true,
        user: { id: volunteer.id, firstName: volunteer.full_name, role: 'guest', ...warehouseFields(req) },
      });
    }

    // ── Staff ──────────────────────────────────────────────────
    const user = await accountRepository.findForSession(req.user.id);

    if (!user)           return rejectSession(res, 'Session expired. Please log in again.');
    if (!user.is_active) return rejectSession(res, 'This account has been deactivated.');

    // Shape matches POST /api/login's response exactly, so the client
    // can treat "restored session" and "just logged in" identically.
    return res.json({
      success: true,
      user: {
        id:        user.id,
        username:  user.username,
        firstName: user.first_name,
        lastName:  user.last_name,
        role:      user.role,
        // For the read-only Profile window. Changed by an admin only.
        email:     user.email ?? null,
        ...warehouseFields(req),
      },
    });

  } catch (error) {
    console.error('[session]', error.message);
    // A 500 here must NOT clear the cookie: the database being
    // briefly unreachable is not the same as the session being
    // invalid, and logging everyone out over a blip would be worse
    // than the outage.
    return sendError(res, error, 'Could not verify your session.');
  }
});

export default router;
