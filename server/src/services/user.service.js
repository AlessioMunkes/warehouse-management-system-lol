// ─────────────────────────────────────────────────────────────
// server/src/services/user.service.js
//
// Validation and business rules for staff account management. The
// repository does SQL (and owns the audit transaction); this file
// decides what is allowed and what an error means.
//
// ERRORS CARRY .status — same fail(status, message) convention as
// supplier.service.js, read by user.controller.js via err.status||500.
//
// ROLES ARE THE LIVE DB CHECK CONSTRAINT, NOT A WISH LIST.
// warehouse_worker / manager / admin are the only values users.role
// accepts. 'guest' is deliberately absent: guests are volunteers, not
// users — they have no username or password, and session.route.js
// already reads them from a different table entirely.
//
// SELF-LOCKOUT GUARD.
// An admin must not be able to lock themselves out: deactivating their
// own account, or changing their own role away from admin. Enforced
// here by comparing the target id against actorId (req.user.id from
// the controller) — never left to the UI alone.
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcrypt';
import repo from '../repositories/user.repository.js';
import { isPositiveInt } from '../utils/validation.js';

const BCRYPT_COST        = 10;
const MIN_PASSWORD_LENGTH = 8;
const ROLE_VALUES = ['warehouse_worker', 'manager', 'admin'];

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// ── Value cleaning ────────────────────────────────────────────
const clean = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const capped = (value, max, label) => {
  const v = clean(value);
  if (v !== null && v.length > max) {
    throw fail(400, `${label} must be ${max} characters or fewer.`);
  }
  return v;
};

const requireId = (id, label = 'User') => {
  if (!isPositiveInt(id)) throw fail(400, `A valid ${label.toLowerCase()} ID is required.`);
  return Number(id);
};

const validRole = (value) => {
  if (!ROLE_VALUES.includes(value)) {
    throw fail(400, `Role must be one of: ${ROLE_VALUES.join(', ')}.`);
  }
  return value;
};

const validPassword = (value) => {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw fail(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return value;
};

// ── User payload (create) ───────────────────────────────────────
const buildUserPayload = (body = {}) => {
  const username = clean(body.username);
  if (!username) throw fail(400, 'Username is required.');
  if (username.length > 50) throw fail(400, 'Username must be 50 characters or fewer.');

  const firstName = capped(body.firstName, 100, 'First name');
  if (!firstName) throw fail(400, 'First name is required.');

  const lastName = capped(body.lastName, 100, 'Last name');
  if (!lastName) throw fail(400, 'Last name is required.');

  const role = validRole(body.role);

  return { username, firstName, lastName, role };
};

// ── Reads ─────────────────────────────────────────────────────
const listUsers = async ({ includeInactive, search } = {}) =>
  repo.listUsers({
    // Query strings arrive as strings, so `Boolean("false")` is true.
    includeInactive: includeInactive === true || includeInactive === 'true',
    search: clean(search),
  });

const getUser = async (rawId) => {
  const id = requireId(rawId);
  const user = await repo.getUserById(id);
  if (!user) throw fail(404, 'User not found.');
  return user;
};

// ── Create ────────────────────────────────────────────────────
const createUser = async (body, actorId) => {
  const payload  = buildUserPayload(body);
  const password = validPassword(body.password);

  const clash = await repo.findUserByUsername(payload.username);
  if (clash) {
    throw fail(409, `A user with the username "${clash.username}" already exists${clash.is_active ? '' : ' (currently inactive)'}.`);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  return repo.insertUser({ ...payload, passwordHash }, actorId);
};

// ── Update ────────────────────────────────────────────────────
const updateUser = async (rawId, body, actorId) => {
  const id = requireId(rawId);

  const existing = await repo.getUserById(id);
  if (!existing) throw fail(404, 'User not found.');

  // Only fields actually present in the body are validated and sent.
  // A PATCH that omits lastName must not null it out.
  const patch = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('username')) {
    const username = clean(body.username);
    if (!username) throw fail(400, 'Username is required.');
    if (username.length > 50) throw fail(400, 'Username must be 50 characters or fewer.');
    const clash = await repo.findUserByUsername(username, { excludeId: id });
    if (clash) throw fail(409, `A user with the username "${clash.username}" already exists.`);
    patch.username = username;
  }
  if (has('firstName')) {
    const firstName = capped(body.firstName, 100, 'First name');
    if (!firstName) throw fail(400, 'First name is required.');
    patch.firstName = firstName;
  }
  if (has('lastName')) {
    const lastName = capped(body.lastName, 100, 'Last name');
    if (!lastName) throw fail(400, 'Last name is required.');
    patch.lastName = lastName;
  }
  if (has('role')) {
    const role = validRole(body.role);
    // Self-lockout guard (b): an admin cannot change their own role
    // away from admin — there would be nobody left to undo it.
    if (id === actorId && existing.role === 'admin' && role !== 'admin') {
      throw fail(400, 'You cannot change your own role away from admin.');
    }
    patch.role = role;
  }

  if (!Object.keys(patch).length) throw fail(400, 'No changes were supplied.');

  return repo.updateUser(id, patch, existing, actorId);
};

// ── Activate / deactivate ────────────────────────────────────
const setUserStatus = async (rawId, body, actorId) => {
  const id = requireId(rawId);
  if (typeof body?.isActive !== 'boolean') {
    throw fail(400, 'isActive must be true or false.');
  }

  // Self-lockout guard (a): an admin cannot deactivate their own
  // account — there would be nobody left with access to undo it.
  if (id === actorId && body.isActive === false) {
    throw fail(400, 'You cannot deactivate your own account.');
  }

  const existing = await repo.getUserById(id);
  if (!existing) throw fail(404, 'User not found.');
  if (existing.is_active === body.isActive) return existing;

  return repo.setUserActive(id, body.isActive, existing, actorId);
};

export default {
  listUsers,
  getUser,
  createUser,
  updateUser,
  setUserStatus,
};
