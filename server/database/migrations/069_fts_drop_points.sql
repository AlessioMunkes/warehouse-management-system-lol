-- ─────────────────────────────────────────────────────────────
-- 069_fts_drop_points.sql
--
-- Feed the Soil drop-off sites, and the compost logged at them.
--
-- Feed the Soil was built on every kit coming back to the warehouse to
-- be weighed. In practice people bring their compost to pop-up stands
-- and other sites. Each site now has a QR code, printed and hung there;
-- scanning it opens a public form (no account) where the person enters
-- the weight and, if they like, an email address for a thank-you.
--
--   fts_drop_points   the sites. public_token is what the QR code
--                     carries: unguessable, so the form cannot be
--                     reached by counting through site ids.
--   fts_dropoffs      one row per form sent. Counted in compost
--                     processed unless staff reject it (a test, a typo,
--                     a joke). The email is kept only to send the
--                     thank-you the person asked for.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fts_drop_points (
  id           serial PRIMARY KEY,
  name         varchar(120) NOT NULL CHECK (btrim(name) <> ''),
  suburb       varchar(120),
  address      text,
  public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  is_active    boolean NOT NULL DEFAULT true,
  created_by   integer REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fts_drop_points_name ON fts_drop_points (lower(name));

CREATE TABLE IF NOT EXISTS fts_dropoffs (
  id             serial PRIMARY KEY,
  drop_point_id  integer NOT NULL REFERENCES fts_drop_points(id),
  kg_compost     numeric(7,2) NOT NULL CHECK (kg_compost > 0 AND kg_compost <= 200),
  donor_name     varchar(120),
  donor_email    varchar(254),
  status         varchar(20) NOT NULL DEFAULT 'logged' CHECK (status IN ('logged', 'rejected')),
  thanks_status  varchar(20) CHECK (thanks_status IN ('sent', 'stubbed', 'failed')),
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_by    integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_fts_dropoffs_point_time ON fts_dropoffs (drop_point_id, submitted_at DESC);
