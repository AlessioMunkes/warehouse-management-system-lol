// ─────────────────────────────────────────────────────────────
// server/src/routes/login.route.js
//
// token is now set as an httpOnly cookie instead of
// being returned in the response body.
//
// httpOnly = JavaScript on the page cannot read this cookie.
// secure   = cookie only sent over HTTPS (set true in production).
// sameSite = 'strict' prevents cross-site request forgery.
//
// Multi-warehouse (WAREHOUSE_DB_URLS set): there is no central user
// list. Each warehouse's own `users` table records who works there.
// Login looks the username up in every warehouse, keeps the ones where
// the password matches and the account is active, and puts all of
// them in the token with the person's id and role AT EACH SITE. See
// auth.middleware.js for how a request then picks one.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import jwt     from 'jsonwebtoken';
import bcrypt  from 'bcrypt';
import pool    from '../config/db.js';
import { AUTH_COOKIE, authCookieOptions, sessionMaxAge } from '../config/cookie.js';
import { runInWarehouse } from '../config/warehouseContext.js';
import { parseWarehouseNames, warehouseName } from '../config/warehouses.js';

const router = express.Router();

const SESSION_HOURS = 8;

const USER_SQL =
  `SELECT id, username, first_name, last_name, role, password_hash, is_active
   FROM users
   WHERE LOWER(username) = LOWER($1)`;

// A bad WAREHOUSE_NAMES should stop the deploy, not the first login.
if (pool.isMultiWarehouse) {
  try {
    parseWarehouseNames(process.env.WAREHOUSE_NAMES);
  } catch (err) {
    console.error(`[login] ${err.message}`);
    process.exit(1);
  }
}

const setSessionCookie = (res, claims) => {
  const token = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });

  // ── Set the token as an httpOnly cookie ───────────────────
  // The browser stores and sends this automatically.
  // JavaScript on the page (including any XSS attack) cannot read it.
  res.cookie(AUTH_COOKIE, token, {
    ...authCookieOptions(),
    maxAge: sessionMaxAge(SESSION_HOURS), // matches the token's own expiry
  });
};

// ── Single warehouse: unchanged behaviour ─────────────────────
const loginSingle = async (req, res, username, password) => {
  const result = await pool.query(USER_SQL, [username]);

  // Same message for wrong username OR wrong password — never reveal which
  if (result.rows.length === 0) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  const user = result.rows[0];
  const passwordMatch = await bcrypt.compare(password, user.password_hash);

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

  setSessionCookie(res, { id: user.id, username: user.username, role: user.role });

  // Return the safe user info (no token in the body anymore)
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
};

// ── Several warehouses ────────────────────────────────────────
const loginMulti = async (req, res, username, password) => {
  // Look the username up in every warehouse at once. One site's
  // database being down must not lock everyone else out, so failures
  // are logged and that site is skipped. Only if EVERY lookup fails is
  // it a server error.
  const codes = pool.warehouseCodes;
  const lookups = await Promise.allSettled(
    codes.map((code) => runInWarehouse(code, () => pool.query(USER_SQL, [username])))
  );

  const found = [];
  lookups.forEach((outcome, i) => {
    if (outcome.status === 'rejected') {
      console.error(`[login] Lookup failed in warehouse "${codes[i]}":`, outcome.reason?.message);
      return;
    }
    if (outcome.value.rows[0]) found.push({ code: codes[i], user: outcome.value.rows[0] });
  });

  if (lookups.every((o) => o.status === 'rejected')) {
    throw new Error('Every warehouse database failed the login lookup.');
  }

  // Same message for wrong username OR wrong password — never reveal which
  if (found.length === 0) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  // A person working at two sites has a row, and a password hash, in
  // each. Only sites where THIS password matches are granted: if the
  // two passwords ever differ, the session covers only the sites whose
  // password was typed. Fails closed, never open.
  const matched = [];
  for (const entry of found) {
    if (await bcrypt.compare(password, entry.user.password_hash)) matched.push(entry);
  }
  if (matched.length === 0) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  const active = matched.filter((entry) => entry.user.is_active);
  if (active.length === 0) {
    return res.status(403).json({ message: 'This account has been deactivated. Speak to your manager.' });
  }

  // Configured order, so the first warehouse in WAREHOUSE_DB_URLS is
  // the one a multi-site user lands in by default.
  const primary = active[0];

  setSessionCookie(res, {
    username:   primary.user.username,
    warehouses: Object.fromEntries(
      active.map(({ code, user }) => [code, { id: user.id, role: user.role }])
    ),
  });

  return res.json({
    success: true,
    user: {
      // id and role are for the default warehouse, so a client that
      // does not yet know about warehouses still gets the shape it expects.
      id:         primary.user.id,
      username:   primary.user.username,
      firstName:  primary.user.first_name,
      lastName:   primary.user.last_name,
      role:       primary.user.role,
      warehouse:  primary.code,
      warehouses: active.map(({ code, user }) => ({
        code,
        name: warehouseName(code),
        role: user.role,
      })),
    },
  });
};

// ── POST /api/login ───────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    return pool.isMultiWarehouse
      ? await loginMulti(req, res, username, password)
      : await loginSingle(req, res, username, password);

  } catch (error) {
    console.error('[login] failed:', error);
    return res.status(500).json({ message: 'Server error during login.' });
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
