-- ─────────────────────────────────────────────────────────────
-- 057_lock_down_data_api.sql
--
-- Closes Supabase's public Data API to this schema.
--
-- Supabase gives its API roles, anon and authenticated, full rights on
-- every new table in public, and leaves row-level security off. With
-- the Data API on, anyone holding the project URL and the anon key
-- (which is designed to be public) could read, change or empty those
-- tables. The app never uses that API: it connects straight to
-- Postgres as the database owner, which bypasses row-level security,
-- so none of this changes what the app can do.
--
--   1. Row-level security on for every table in public. No policies are
--      added, so the API roles see no rows even if a grant comes back.
--   2. The API roles lose every right on tables, views, sequences and
--      functions in public.
--   3. Tables, sequences and functions made later by this role no longer
--      hand those rights out automatically.
--
-- A plain Postgres without Supabase has no anon or authenticated role;
-- steps 2 and 3 are skipped there.
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p')
       AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END
$$;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', current_user, api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', current_user, api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', current_user, api_role);
    END IF;
  END LOOP;
END
$$;
