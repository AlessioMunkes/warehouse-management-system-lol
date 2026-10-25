#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// server/scripts/export-new-database.mjs — write docs/new-database.sql
//
// Run from the server folder:
//
//   npm run export-database
//
// Reads the database in server/.env (DATABASE_URL, or the first entry
// of WAREHOUSE_DB_URLS) and writes one SQL file that builds a NEW,
// EMPTY database into the same shape: every table, column, default,
// check, key, index and sequence in "public", its enum types, row-level
// security and policies, the starter rows a warehouse needs, and the
// record of migrations already applied. It can be pasted into the
// Supabase SQL editor, run with psql, or used by
// `npm run migrate -- init <code>`.
//
// It only ever READS the source database. Run it again after adding a
// migration, so a new warehouse starts where the others are.
//
// WHAT IS COPIED AS DATA: only configuration every warehouse shares
// (STARTER_TABLES below). Never people, stock, donations, dispatches,
// connections or settings holding someone's contact details.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg   from 'pg';
import { parseWarehouseUrls } from '../src/config/dbRouter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT  = path.resolve(here, '..', '..', 'docs', 'new-database.sql');

// Configuration a new warehouse starts with. Each was read and holds no
// personal data, tokens or one site's own records.
const STARTER_TABLES = [
  'reporting_factors',          // impact factors: kg to meals, etc.
  'programmes',                 // Nourish Our Children, Feed the Soil, Love Activism
  'storage_locations',          // Dry Store, Cold Room, ...
  'donation_category_routing',  // where each donation category goes
  'picking_settings',           // cohort anchor date, default bag sizes
  'donation_settings',          // the Section 18A threshold
];

// The permission lock-down the live schema carries (migration 057),
// copied in so a new database is closed to Supabase's Data API too.
const LOCKDOWN = path.resolve(here, '..', 'database', 'migrations', '057_lock_down_data_api.sql');

const sourceUrl = () => {
  const multi = parseWarehouseUrls(process.env.WAREHOUSE_DB_URLS);
  if (multi) return [...multi.values()][0];
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  console.error('✗ No DATABASE_URL or WAREHOUSE_DB_URLS in server/.env');
  process.exit(1);
};

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;
// A dollar-quote tag that cannot occur in the text it wraps.
const dollar = (text) => {
  let tag = 'json';
  while (text.includes(`$${tag}$`)) tag += '_';
  return `$${tag}$${text}$${tag}$`;
};

const client = new pg.Client({
  connectionString: sourceUrl(),
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
});
await client.connect();
// Names outside public print schema-qualified (extensions.gen_random_uuid()).
await client.query('SET search_path TO public');
const q = async (sql, params) => (await client.query(sql, params)).rows;

const out = [];
const say = (...lines) => out.push(...lines);

// ── Header and guard ──────────────────────────────────────────
const { rows: [{ server_version: version }] } = await client.query('SHOW server_version');
const migrations = await q('SELECT id, notes FROM public.schema_migrations ORDER BY id');
say(
  '-- -------------------------------------------------------------',
  '-- new-database.sql — a new, empty Batches warehouse database',
  '--',
  `-- Written by server/scripts/export-new-database.mjs on ${new Date().toISOString().slice(0, 10)},`,
  `-- from a database on PostgreSQL ${version}, with ${migrations.length} migrations applied`,
  `-- (the last: ${migrations.at(-1)?.id ?? 'none'}). Do not edit by hand: change the`,
  '-- database through a migration, then run `npm run export-database` again.',
  '--',
  '-- HOW TO RUN IT',
  '--   Supabase: open the new project, SQL Editor, New query, paste this',
  '--   whole file, set the first admin below (optional), press Run.',
  '--   psql:     psql "<connection string>" --single-transaction -f docs/new-database.sql',
  '--   The app:  npm run migrate -- init <code>   (from the server folder)',
  '--',
  '-- It builds every table, type, key, index and sequence the app uses,',
  '-- turns on row-level security and closes Supabase\'s Data API (the app',
  '-- connects to Postgres directly), adds the starter configuration every',
  '-- warehouse shares, and records the migrations it already contains, so',
  '-- `npm run migrate -- up` carries on from here.',
  '--',
  '-- It stops without changing anything if the database already has tables:',
  '-- it is for a new, empty database only.',
  '--',
  '-- It holds no data from any warehouse: no people, stock, donations,',
  '-- dispatches, centres, connections or contact details.',
  '-- -------------------------------------------------------------',
  '',
  'DO $$',
  'BEGIN',
  "  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public') THEN",
  "    RAISE EXCEPTION 'This database already has tables in public. new-database.sql is for a new, empty database only. Nothing was changed.';",
  '  END IF;',
  'END',
  '$$;',
  '',
);

// ── Extensions ────────────────────────────────────────────────
say(
  '-- -- Extensions ---------------------------------------------',
  '-- In the "extensions" schema, where Supabase keeps them.',
  'CREATE SCHEMA IF NOT EXISTS extensions;',
  'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',
  'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;',
  '',
);

// ── Enum types ────────────────────────────────────────────────
const enums = await q(`
  SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE n.nspname = 'public'
   GROUP BY t.typname
   ORDER BY t.typname`);
say('-- -- Types --------------------------------------------------');
for (const e of enums) {
  say(`CREATE TYPE public.${ident(e.name)} AS ENUM (${e.labels.map(literal).join(', ')});`);
}
say('');

// ── Sequences (not the ones identity columns make for themselves) ──
const sequences = await q(`
  SELECT s.sequencename AS name, s.data_type, s.start_value, s.increment_by,
         s.min_value, s.max_value, s.cache_size, s.cycle
    FROM pg_sequences s
   WHERE s.schemaname = 'public'
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d
        WHERE d.objid = (quote_ident(s.schemaname) || '.' || quote_ident(s.sequencename))::regclass
          AND d.deptype = 'i')
   ORDER BY s.sequencename`);
say('-- -- Sequences ----------------------------------------------');
for (const s of sequences) {
  say(`CREATE SEQUENCE public.${ident(s.name)} AS ${s.data_type} INCREMENT BY ${s.increment_by}`
    + ` MINVALUE ${s.min_value} MAXVALUE ${s.max_value} START WITH ${s.start_value}`
    + ` CACHE ${s.cache_size}${s.cycle ? ' CYCLE' : ' NO CYCLE'};`);
}
say('');

// ── Tables ────────────────────────────────────────────────────
const tables = await q(`
  SELECT c.oid, c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
   ORDER BY c.relname`);
const columnsOf = new Map();
say('-- -- Tables -------------------------------------------------');
for (const t of tables) {
  const cols = await q(`
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS not_null, a.attidentity AS identity, a.attgenerated AS generated,
           pg_get_expr(d.adbin, d.adrelid) AS expr
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`, [t.oid]);
  columnsOf.set(t.name, cols);
  const lines = cols.map((c) => {
    let line = `  ${ident(c.name)} ${c.type}`;
    if (c.generated === 's') line += ` GENERATED ALWAYS AS (${c.expr}) STORED`;
    else if (c.identity === 'a') line += ' GENERATED ALWAYS AS IDENTITY';
    else if (c.identity === 'd') line += ' GENERATED BY DEFAULT AS IDENTITY';
    else if (c.expr !== null) line += ` DEFAULT ${c.expr}`;
    if (c.not_null) line += ' NOT NULL';
    return line;
  });
  say(`CREATE TABLE public.${ident(t.name)} (`, lines.join(',\n'), ');', '');
}

// ── Keys, uniques and checks, then foreign keys ───────────────
const constraints = await q(`
  SELECT c.conname AS name, c.contype AS kind, r.relname AS table_name,
         pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
   WHERE r.relnamespace = 'public'::regnamespace AND r.relkind = 'r'
   ORDER BY CASE c.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'x' THEN 2 WHEN 'c' THEN 3 ELSE 4 END,
            r.relname, c.conname`);
say('-- -- Keys and checks ----------------------------------------');
for (const c of constraints.filter((x) => x.kind !== 'f')) {
  say(`ALTER TABLE public.${ident(c.table_name)} ADD CONSTRAINT ${ident(c.name)} ${c.def};`);
}
say('', '-- -- Foreign keys -------------------------------------------');
for (const c of constraints.filter((x) => x.kind === 'f')) {
  say(`ALTER TABLE public.${ident(c.table_name)} ADD CONSTRAINT ${ident(c.name)} ${c.def};`);
}
say('');

// ── Indexes not already made by a key or unique constraint ────
const indexes = await q(`
  SELECT pg_get_indexdef(i.indexrelid) AS def
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
   WHERE t.relnamespace = 'public'::regnamespace AND t.relkind = 'r'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
   ORDER BY t.relname, i.indexrelid::regclass::text`);
say('-- -- Indexes ------------------------------------------------');
for (const i of indexes) say(`${i.def};`);
say('');

// ── Which column owns each sequence ───────────────────────────
const owned = await q(`
  SELECT s.relname AS sequence_name, t.relname AS table_name, a.attname AS column_name
    FROM pg_depend d
    JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
   WHERE d.deptype = 'a' AND s.relnamespace = 'public'::regnamespace
   ORDER BY s.relname`);
say('-- -- Sequence owners ----------------------------------------');
for (const o of owned) {
  say(`ALTER SEQUENCE public.${ident(o.sequence_name)} OWNED BY public.${ident(o.table_name)}.${ident(o.column_name)};`);
}
say('');

// ── Row-level security and policies ───────────────────────────
say('-- -- Row-level security -------------------------------------');
for (const t of tables) {
  if (t.rls) say(`ALTER TABLE public.${ident(t.name)} ENABLE ROW LEVEL SECURITY;`);
  if (t.force_rls) say(`ALTER TABLE public.${ident(t.name)} FORCE ROW LEVEL SECURITY;`);
}
const policies = await q(`
  SELECT p.polname AS name, c.relname AS table_name, p.polpermissive AS permissive,
         CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
                       WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS command,
         COALESCE((SELECT array_agg(CASE WHEN r = 0 THEN 'public' ELSE quote_ident(pg_get_userbyid(r)) END)
                     FROM unnest(p.polroles) AS r), ARRAY['public']) AS roles,
         pg_get_expr(p.polqual, p.polrelid) AS using_expr,
         pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
   ORDER BY c.relname, p.polname`);
for (const p of policies) {
  // A policy for a role this database does not have (Supabase's API
  // roles on plain Postgres) is skipped there rather than failing.
  const roles = p.roles.join(', ');
  const body = `CREATE POLICY ${ident(p.name)} ON public.${ident(p.table_name)}`
    + ` AS ${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'} FOR ${p.command} TO ${roles}`
    + (p.using_expr ? ` USING (${p.using_expr})` : '')
    + (p.check_expr ? ` WITH CHECK (${p.check_expr})` : '');
  const needed = p.roles.filter((r) => r !== 'public').map((r) => literal(r.replace(/^"|"$/g, '')));
  say(needed.length
    ? `DO $$ BEGIN IF (SELECT count(*) FROM pg_roles WHERE rolname IN (${needed.join(', ')})) = ${needed.length} THEN EXECUTE ${literal(body)}; END IF; END $$;`
    : `${body};`);
}
say('');

// ── Closing Supabase's Data API (migration 057) ───────────────
say(
  '-- -- Closing the Data API -----------------------------------',
  '-- From migration 057_lock_down_data_api.sql: the API roles lose every',
  '-- right in public. Skipped where those roles do not exist.',
  fs.readFileSync(LOCKDOWN, 'utf8').replace(/\r\n/g, '\n').replace(/^(--.*\n)+/, '').trim(),
  '',
);

// ── Starter rows ──────────────────────────────────────────────
say('-- -- Starter configuration ----------------------------------');
for (const table of STARTER_TABLES) {
  const cols = (columnsOf.get(table) ?? []).filter((c) => c.generated !== 's');
  if (!cols.length) { console.warn(`  ! ${table}: not in this database, skipped`); continue; }
  const rows = await q(`SELECT * FROM public.${ident(table)}`);
  if (!rows.length) continue;
  // A column pointing at a table whose rows are not copied (who last
  // changed a setting: a user) has nothing to point at in a new database,
  // so it starts empty.
  const dangling = (await q(`
    SELECT a.attname AS name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class r ON r.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f' AND t.relnamespace = 'public'::regnamespace
       AND t.relname = $1 AND NOT (r.relname = ANY ($2::text[]))`, [table, STARTER_TABLES])).map((r) => r.name);
  for (const row of rows) for (const name of dangling) row[name] = null;
  const names = cols.map((c) => ident(c.name)).join(', ');
  const overriding = cols.some((c) => c.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : '';
  say(
    `INSERT INTO public.${ident(table)} (${names})${overriding}`,
    `SELECT ${names} FROM jsonb_populate_recordset(NULL::public.${ident(table)}, ${dollar(JSON.stringify(rows))});`,
  );
}
// Serial and identity counters carry on after the copied rows.
say(
  'DO $$',
  'DECLARE',
  '  s record;',
  'BEGIN',
  '  FOR s IN',
  '    SELECT c.relname AS table_name, a.attname AS column_name,',
  "           pg_get_serial_sequence(format('public.%I', c.relname), a.attname) AS seq",
  '      FROM pg_class c',
  '      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped',
  `     WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN (${STARTER_TABLES.map(literal).join(', ')})`,
  '  LOOP',
  '    IF s.seq IS NOT NULL THEN',
  "      EXECUTE format('SELECT setval(%L, GREATEST(1, COALESCE((SELECT max(%I) FROM public.%I), 0)), (SELECT count(*) > 0 FROM public.%I))',",
  '                     s.seq, s.column_name, s.table_name, s.table_name);',
  '    END IF;',
  '  END LOOP;',
  'END',
  '$$;',
  '',
);

// ── Migrations already contained ──────────────────────────────
say(
  '-- -- Migrations this file already contains ------------------',
  '-- So `npm run migrate -- up` only applies migrations added after it.',
  `INSERT INTO public.schema_migrations (id, notes) VALUES`,
  migrations.map((m) => `  (${literal(m.id)}, ${literal('In new-database.sql')})`).join(',\n') + ';',
  '',
);

// ── First admin (optional) ────────────────────────────────────
say(
  '-- -- First admin (optional) ---------------------------------',
  '-- Someone has to be able to sign in. Fill in the four values and run the',
  "-- file as it is; with the password left as 'CHANGE-ME', no admin is made",
  '-- and you can make one later with',
  '--   npm run warehouse-admin -- create-admin <code> --username <u> --first <name> --last <name>',
  '-- The password is stored hashed (bcrypt), never as typed. Change it',
  '-- after the first sign-in: Profile, Change password.',
  'DO $$',
  'DECLARE',
  "  admin_username   text := 'admin';",
  "  admin_first_name text := 'First';",
  "  admin_last_name  text := 'Admin';",
  "  admin_password   text := 'CHANGE-ME';   -- 8 to 72 characters",
  'BEGIN',
  "  IF admin_password = 'CHANGE-ME' THEN",
  "    RAISE NOTICE 'No first admin made: the password was left as CHANGE-ME.';",
  '    RETURN;',
  '  END IF;',
  '  IF length(admin_password) < 8 OR octet_length(admin_password) > 72 THEN',
  "    RAISE EXCEPTION 'The first admin password must be 8 to 72 characters. Nothing was changed.';",
  '  END IF;',
  '  INSERT INTO public.users (username, first_name, last_name, password_hash, role)',
  '  VALUES (admin_username, admin_first_name, admin_last_name,',
  "          extensions.crypt(admin_password, extensions.gen_salt('bf', 10)), 'admin');",
  'END',
  '$$;',
  '',
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.join('\n'));
await client.end();
console.log(`✓ ${path.relative(process.cwd(), OUT)}: ${tables.length} tables, ${enums.length} types, `
  + `${sequences.length} sequences, ${indexes.length} indexes, ${policies.length} policies, `
  + `${STARTER_TABLES.length} starter tables, ${migrations.length} migrations recorded.`);
