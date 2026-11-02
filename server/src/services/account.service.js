// ─────────────────────────────────────────────────────────────
// server/src/services/account.service.js
//
// A signed-in staff member changing their own password or email, from
// Profile. Both need the current password: a session left open on a
// shared floor tablet must not be enough to take over the account.
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcrypt';
import repo from '../repositories/account.repository.js';
import { fail, validPassword, validOptionalEmail } from '../utils/userAccountFields.js';

const BCRYPT_COST = 10;

const checkCurrentPassword = async (userId, currentPassword) => {
  if (typeof currentPassword !== 'string' || currentPassword === '') {
    throw fail(400, 'Enter your current password.');
  }
  const account = await repo.getCredentials(userId);
  if (!account || !account.is_active) throw fail(401, 'Your session has ended. Please log in again.');
  const ok = await bcrypt.compare(currentPassword, account.password_hash ?? '');
  if (!ok) throw fail(403, 'Your current password is not right.');
  return account;
};

const changePassword = async (userId, { currentPassword, newPassword } = {}) => {
  await checkCurrentPassword(userId, currentPassword);
  const password = validPassword(newPassword);
  if (password === currentPassword) throw fail(400, 'Choose a password different from your current one.');
  await repo.setPasswordHash(userId, await bcrypt.hash(password, BCRYPT_COST));
  return { changed: true };
};

const changeEmail = async (userId, { currentPassword, email } = {}) => {
  const account = await checkCurrentPassword(userId, currentPassword);
  const next = validOptionalEmail(email);
  if (!next) throw fail(400, 'Enter an email address.');
  if ((account.email ?? '').toLowerCase() === next) return { email: next };
  if (await repo.findOtherUserWithEmail(next, userId)) {
    throw fail(409, 'Another account in your role already has this email address. Use a different one.');
  }
  try {
    await repo.setEmail(userId, account.email ?? null, next);
  } catch (err) {
    if (err?.code === '23505') throw fail(409, 'Another account in your role already has this email address. Use a different one.');
    throw err;
  }
  return { email: next };
};

export default { changePassword, changeEmail };
