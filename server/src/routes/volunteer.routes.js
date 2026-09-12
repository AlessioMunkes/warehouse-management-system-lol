// ─────────────────────────────────────────────────────────────
// server/src/routes/volunteer.routes.js
//
// POST /api/volunteers/sign-in
//
// Public by necessity — a volunteer has no session until this
// call creates one. Mirrors login.route.js: inserts the sign-in,
// signs a short-lived JWT with role 'guest', sets it as the same
// httpOnly wms_token cookie.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import jwt     from 'jsonwebtoken';
import pool    from '../config/db.js';
import { AUTH_COOKIE, authCookieOptions, sessionMaxAge } from '../config/cookie.js';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import volunteerRepo                from '../repositories/volunteer.repository.js';

const router = express.Router();

// Manager and admin. A warehouse worker has no reason to read a list
// of who else was in the building, and 'guest' is emphatically not on
// this list — a volunteer signing in must not be able to read every
// other volunteer's name and arrival time off the back of their own
// twelve-hour token.
const LOG_READERS = [ROLES.MANAGER, ROLES.ADMIN];

// A date string as the browser's <input type="date"> sends it, or
// nothing. Anything else is dropped rather than passed to Postgres to
// be rejected as a cast error, which would surface as a 500.
const asDate = (value) =>
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

const SESSION_HOURS = 12;

router.post('/sign-in', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    if (name.trim().length > 200) {
      return res.status(400).json({ message: 'Name is too long.' });
    }

    // signed_in_at comes from the DB default — never from the client
    const result = await pool.query(
      `INSERT INTO volunteers (full_name, source)
       VALUES ($1, 'guest_login')
       RETURNING id, full_name, signed_in_at`,
      [name.trim()]
    );

    const volunteer = result.rows[0];

    const token = jwt.sign(
      { id: volunteer.id, role: 'guest' },
      process.env.JWT_SECRET,
      { expiresIn: `${SESSION_HOURS}h` }
    );

    res.cookie(AUTH_COOKIE, token, {
      ...authCookieOptions(),
      maxAge: sessionMaxAge(SESSION_HOURS),
    });

    return res.status(201).json({
      success: true,
      user: {
        id:        volunteer.id,
        firstName: volunteer.full_name,
        role:      'guest',
      },
    });

  } catch (error) {
    console.error('[volunteers]', error.message);
    return res.status(500).json({ message: 'Server error recording sign-in.' });
  }
});

// ── GET /api/volunteers ───────────────────────────────────────
// The guest log. Every sign-in POST /sign-in has recorded, newest
// first. Optional name search and an inclusive SAST date range.
router.get('/',
  auth, requireRole(...LOG_READERS),
  async (req, res) => {
    try {
      const data = await volunteerRepo.listGuestLog({
        search: typeof req.query.search === 'string' && req.query.search.trim()
          ? req.query.search.trim()
          : null,
        from: asDate(req.query.from),
        to:   asDate(req.query.to),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('[volunteers:log]', error.message);
      return res.status(500).json({ success: false, message: 'Failed to load the guest log.' });
    }
  });

// ── POST /api/volunteers/:id/sign-out ─────────────────────────
// Closes an open visit and stamps signed_out_at — the writer that has
// never existed. See the note at the top of volunteer.repository.js:
// the volunteer-hours figure in Reporting is built on this column and
// has been returning an empty series for want of anything setting it.
//
// The server supplies the time. A sign-out time posted by a client is
// a time somebody's laptop clock decided, on a record that is partly a
// safety document.
router.post('/:id/sign-out',
  auth, requireRole(...LOG_READERS), validateIntId,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await volunteerRepo.signOutVolunteer(id);
      if (updated) return res.status(200).json({ success: true, data: updated });

      // Nothing was open to close: either no such visit, or it was
      // already signed out. Distinguishing the two matters — one is a
      // mistake and the other is someone pressing twice, and returning
      // the existing row makes the second case a no-op rather than an
      // error the screen has to explain.
      const existing = await volunteerRepo.getVolunteerById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Visit not found.' });
      }
      return res.status(200).json({ success: true, data: existing });
    } catch (error) {
      console.error('[volunteers:sign-out]', error.message);
      return res.status(500).json({ success: false, message: 'Failed to sign the visit out.' });
    }
  });

export default router;