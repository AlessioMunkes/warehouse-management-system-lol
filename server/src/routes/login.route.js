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
// DEBUG: temporary logging to diagnose login 500 error

console.log("========== LOGIN ROUTE LOADED ==========");
import express from 'express';
import jwt     from 'jsonwebtoken';
import bcrypt  from 'bcrypt';
import pool    from '../config/db.js';
import { AUTH_COOKIE, authCookieOptions, sessionMaxAge } from '../config/cookie.js';
import fs from 'fs';

const router = express.Router();

const SESSION_HOURS = 8;
const DEBUG_LOG = 'C:\\Users\\abukw\\Documents\\Projects\\warehouse-management-system-lol\\server\\login-debug.log';

console.log('[LOGIN ROUTE] Loading login route module');
console.log('[LOGIN ROUTE] DEBUG_LOG path:', DEBUG_LOG);

const debugLog = (msg) => {
  console.log('[DEBUG]', msg);
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {
    console.log('[DEBUG] File write error:', e.message);
  }
};

// Clear log on startup
try { fs.writeFileSync(DEBUG_LOG, ''); console.log('[LOGIN ROUTE] Debug log cleared'); } catch (e) { console.log('[LOGIN ROUTE] Clear error:', e.message); }

// ── POST /api/login ───────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    console.log("[SERVER] Login request received");
    const { username, password } = req.body;
    console.log("[SERVER] Username:", username);

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    console.log("[SERVER] Querying user");
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, role, password_hash, is_active
       FROM users
       WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    console.log("[SERVER] Rows:", result.rows.length);

    // Same message for wrong username OR wrong password — never reveal which
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    console.log("[SERVER] Comparing password");
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log("[SERVER] Password match:", passwordMatch);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // is_active was previously never checked, so deactivating a staff
    // member in the database did not actually stop them logging in.
    // The compare above still runs first, deliberately: answering
    // faster for a disabled account than a wrong password would leak
    // which usernames exist.
    if (!user.is_active) {
      return res.status(403).json({ message: 'This account has been deactivated. Speak to your manager.' });
    }

    console.log("[SERVER] Creating JWT");
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: `${SESSION_HOURS}h` }
    );

    console.log("[SERVER] Setting auth cookie");
    // ── Set the token as an httpOnly cookie ───────────────────
    // The browser stores and sends this automatically.
    // JavaScript on the page (including any XSS attack) cannot read it.
    res.cookie(AUTH_COOKIE, token, {
      ...authCookieOptions(),
      maxAge: sessionMaxAge(SESSION_HOURS), // matches the token's own expiry
    });

    console.log("[SERVER] Login success");
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
    console.error("[SERVER] Login exception");
    console.error(error);
    console.error(error.stack);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ── POST /api/logout ──────────────────────────────────────────
// Clears the cookie server-side so the session is properly ended.
// The client just calls this then clears its local user state.
// Mounted at /api/login, so the full path is POST /api/login/logout.
router.post('/logout', (req, res) => {
  // Same options the cookie was set with — clearCookie is a no-op
  // otherwise. See src/config/cookie.js.
  res.clearCookie(AUTH_COOKIE, authCookieOptions());
  res.json({ success: true });
});

export default router;