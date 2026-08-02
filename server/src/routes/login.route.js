// ─────────────────────────────────────────────────────────────
// server/src/routes/login.route.js
//
// token is now set as an httpOnly cookie instead of
// being returned in the response body.
//
// httpOnly = JavaScript on the page cannot read this cookie.
// secure   = cookie only sent over HTTPS (set true in production).
// sameSite = 'strict' prevents cross-site request forgery.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import jwt     from 'jsonwebtoken';
import bcrypt  from 'bcrypt';
import pool    from '../config/db.js';

const router = express.Router();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ── POST /api/login ───────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

   const result = await pool.query(
      `SELECT id, username, first_name, last_name, role, password_hash
       FROM users
       WHERE LOWER(username) = LOWER($1)`,
      [username]
    );

    // Same message for wrong username OR wrong password — never reveal which
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // ── Set the token as an httpOnly cookie ───────────────────
    // The browser stores and sends this automatically.
    // JavaScript on the page (including any XSS attack) cannot read it.
    res.cookie('wms_token', token, {
      httpOnly: true,                  // not accessible via JS
      secure:   IS_PRODUCTION,         // HTTPS only in production, HTTP ok in dev
      sameSite: 'strict',              // never sent on cross-site requests
      maxAge:   8 * 60 * 60 * 1000,   // 8 hours in milliseconds — matches token expiry
    });

    // Return the safe user info (no token in the body anymore)
    res.json({
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
    console.error('[login]', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ── POST /api/logout ──────────────────────────────────────────
// Clears the cookie server-side so the session is properly ended.
// The client just calls this then clears its local user state.
router.post('/logout', (req, res) => {
  res.clearCookie('wms_token', {
    httpOnly: true,
    secure:   IS_PRODUCTION,
    sameSite: 'strict',
  });
  res.json({ success: true });
});

export default router;