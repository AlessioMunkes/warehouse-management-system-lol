// ─────────────────────────────────────────────────────────────
// server/src/config/cookie.js
//
// One definition of the auth cookie, shared by everything that
// sets or clears it (login, guest sign-in, logout, session check).
//
// This exists because res.clearCookie() only clears a cookie when
// the options it is given MATCH the ones the cookie was set with.
// When those definitions were copy-pasted into three route files,
// any drift in sameSite/secure/path meant clearCookie silently did
// nothing and the stale session survived a logout.
// ─────────────────────────────────────────────────────────────

export const AUTH_COOKIE = 'wms_token';

const IS_PRODUCTION = () => process.env.NODE_ENV === 'production';

// Read at call time, not at import time: the tests build apps with
// different NODE_ENV values in the same process, and a value frozen
// at import would be wrong for all but the first.
export const authCookieOptions = () => ({
  httpOnly: true,          // not readable by JS, so XSS can't steal it
  secure:   IS_PRODUCTION(), // HTTPS-only in production
  sameSite: 'strict',      // never sent cross-site
  path:     '/',           // must match on clear, or the clear is a no-op
});

// maxAge is only used when SETTING the cookie — clearCookie must not
// receive it, so it is kept separate from the options above.
export const sessionMaxAge = (hours) => hours * 60 * 60 * 1000;