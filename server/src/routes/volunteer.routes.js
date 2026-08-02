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

const router = express.Router();

const IS_PRODUCTION  = process.env.NODE_ENV === 'production';
const SESSION_HOURS  = 12;

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

    res.cookie('wms_token', token, {
      httpOnly: true,
      secure:   IS_PRODUCTION,
      sameSite: 'strict',
      maxAge:   SESSION_HOURS * 60 * 60 * 1000,
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

export default router;