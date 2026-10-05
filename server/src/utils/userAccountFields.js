// ─────────────────────────────────────────────────────────────
// server/src/utils/userAccountFields.js
//
// Validation shared between creating a user directly (user.service.js)
// and accepting an invite (userInvite.service.js). Both paths end at
// the same users row with the same constraints, so the rules — max
// lengths, the password floor, the role whitelist — live here once.
// Two copies of "username <= 50 chars" is exactly the kind of drift
// audit_log.repository.js's own header comment warns about.
//
// ROLES ARE THE LIVE DB CHECK CONSTRAINT, NOT A WISH LIST. See
// users_role_check — warehouse_worker / manager / admin are the only
// values users.role accepts.
// ─────────────────────────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 8;
export const ROLE_VALUES = ['warehouse_worker', 'manager', 'admin'];

export const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const clean = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

export const capped = (value, max, label) => {
  const v = clean(value);
  if (v !== null && v.length > max) {
    throw fail(400, `${label} must be ${max} characters or fewer.`);
  }
  return v;
};

export const validUsername = (value) => {
  const username = clean(value);
  if (!username) throw fail(400, 'Username is required.');
  if (username.length > 50) throw fail(400, 'Username must be 50 characters or fewer.');
  return username;
};

export const validFirstName = (value) => {
  const firstName = capped(value, 100, 'First name');
  if (!firstName) throw fail(400, 'First name is required.');
  return firstName;
};

export const validLastName = (value) => {
  const lastName = capped(value, 100, 'Last name');
  if (!lastName) throw fail(400, 'Last name is required.');
  return lastName;
};

export const validRole = (value) => {
  if (!ROLE_VALUES.includes(value)) {
    throw fail(400, `Role must be one of: ${ROLE_VALUES.join(', ')}.`);
  }
  return value;
};

// Optional email for an account. Blank / null clears it (null); a value
// is trimmed and lowercased so the case-insensitive unique index
// (idx_users_email_unique, LOWER(email)) and what is stored agree. The
// format check matches the invite flow's: enough to catch typos, not
// RFC 5322.
export const validOptionalEmail = (value) => {
  const email = clean(value)?.toLowerCase() ?? null;
  if (email === null) return null;
  if (email.length > 255) throw fail(400, 'Use an email address of 255 characters or fewer.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw fail(400, 'Enter a valid email address, like name@example.org.');
  }
  return email;
};

export const validPassword = (value) => {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw fail(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return value;
};
