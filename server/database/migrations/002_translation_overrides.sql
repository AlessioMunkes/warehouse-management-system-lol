-- ─────────────────────────────────────────────────────────────
-- 002_translation_overrides.sql
--
-- Settings → Translations: an admin's own wording for the floor and
-- volunteer screens in Afrikaans and isiXhosa.
--
-- The built-in wording is in the app (client/src/translations). A row
-- here replaces one piece of it for this warehouse:
--   kind 'key'     source is a message key (packing.claim); for wording
--                  that changes with a count, key#one or key#other
--   kind 'phrase'  source is the English exactly as the screen shows it
-- Deleting the row goes back to the built-in wording.
--
-- Additive: one new table. Safe to run again.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.translation_overrides (
  language   varchar(5)  NOT NULL CHECK (language IN ('af', 'xh')),
  kind       varchar(10) NOT NULL CHECK (kind IN ('key', 'phrase')),
  source     text        NOT NULL CHECK (length(source) BETWEEN 1 AND 500),
  text       text        NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 1000),
  updated_by integer     REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (language, kind, source)
);

-- Like every table: closed to Supabase's Data API (the app connects to
-- Postgres directly and is not affected).
ALTER TABLE public.translation_overrides ENABLE ROW LEVEL SECURITY;
