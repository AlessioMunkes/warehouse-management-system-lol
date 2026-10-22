// ─────────────────────────────────────────────────────────────
// server/src/utils/sessionVersion.js
//
// users.session_version (migration 055) goes up by 1 whenever the
// password changes or the account is deactivated or archived. A token
// carries the number from when it was issued (`sv`), and
// auth.middleware.js turns it away once the two differ.
// ─────────────────────────────────────────────────────────────

// Read through to_jsonb so a database the migration has not reached
// yet reads it as 0 instead of failing every login and request.
export const SESSION_VERSION_SQL = `COALESCE((to_jsonb(users) ->> 'session_version')::int, 0)`;

// The version a token carries. Tokens issued before 055 carry none,
// which counts as 0, so nobody is signed out by the migration itself.
export const tokenSessionVersion = (claims) =>
  (Number.isInteger(claims?.sv) ? claims.sv : 0);
