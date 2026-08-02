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
import auth    from '../middleware/auth.middleware.js';
import pool    from '../config/db.js';
import { AUTH_COOKIE, authCookieOptions } from '../config/cookie.js';

const router = express.Router();

// Kill a session whose token is technically valid but whose account
// is gone or disabled. Clearing the cookie stops the browser
// re-sending a token we have already rejected on every subsequent
// request for the next 8 hours.
const rejectSession = (res, message) => {
  res.clearCookie(AUTH_COOKIE, authCookieOptions());
  return res.status(401).json({ success: false, message });
};

router.get('/', auth, async (req, res) => {
  try {
    // ── Guests live in `volunteers`, not `users` ────────────────
    // A guest token carries { id, role: 'guest' } and nothing else,
    // so there is no users row to look up — querying `users` with a
    // volunteer id would match an unrelated staff member.
    if (req.user.role === 'guest') {
      const result = await pool.query(
        `SELECT id, full_name, signed_out_at FROM volunteers WHERE id = $1`,
        [req.user.id]
      );
      const volunteer = result.rows[0];

      if (!volunteer)             return rejectSession(res, 'Session expired. Please sign in again.');
      if (volunteer.signed_out_at) return rejectSession(res, 'This visit has been signed out.');

      return res.json({
        success: true,
        user: { id: volunteer.id, firstName: volunteer.full_name, role: 'guest' },
      });
    }

    // ── Staff ──────────────────────────────────────────────────
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, role, is_active
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];

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
      },
    });

  } catch (error) {
    console.error('[session]', error.message);
    // A 500 here must NOT clear the cookie: the database being
    // briefly unreachable is not the same as the session being
    // invalid, and logging everyone out over a blip would be worse
    // than the outage.
    return res.status(500).json({ success: false, message: 'Could not verify your session.' });
  }
});

export default router;