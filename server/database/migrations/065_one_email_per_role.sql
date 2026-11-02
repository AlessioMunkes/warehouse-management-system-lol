-- ─────────────────────────────────────────────────────────────
-- 065_one_email_per_role.sql
--
-- One email address, one account per role.
--
-- Until now an email address could belong to one account. The sponsor's
-- staff wear more than one hat: Grizel is an admin and a manager, and
-- wants an account for each on her one address rather than a second
-- address to keep. Each account still has its own username and its own
-- password, and signs in as the role it is.
--
-- An address may now be on one account of each role: an admin and a
-- manager account, but not two manager accounts. A password reset for
-- the address sends a link for each of its accounts.
-- ─────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_users_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_role_unique
  ON users (lower(email), role)
  WHERE email IS NOT NULL;
