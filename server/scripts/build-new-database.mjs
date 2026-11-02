#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// server/scripts/build-new-database.mjs — write docs/new-database.sql
//
//   cd server && npm run build-new-database
//
// docs/new-database.sql is the ONE file a new installation runs: the
// whole schema (database/schema.sql) followed by every seed migration
// (database/migrations/NNN_seed_*.sql), with all of them recorded in
// schema_migrations so `npm run migrate -- up` carries on from there.
// Paste it into the Supabase SQL editor, or run it with psql.
//
// It is built from the files in the repository, never from a live
// database, so it holds no warehouse's data. Run it again after changing
// schema.sql or adding a seed migration.
// ─────────────────────────────────────────────────────────────
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listMigrationFiles } from './lib/migrator.js';

const here    = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR  = path.resolve(here, '..', 'database');
const SCHEMA  = path.join(DB_DIR, 'schema.sql');
const OUT     = path.resolve(here, '..', '..', 'docs', 'new-database.sql');
const ADMIN   = '-- -- First admin (optional) ---------------------------------';

export const buildNewDatabaseSql = () => {
  const schema = fs.readFileSync(SCHEMA, 'utf8').replace(/\r\n/g, '\n');
  const cut = schema.indexOf(ADMIN);
  if (cut === -1) throw new Error('schema.sql has no "First admin" section; cannot build.');
  const seeds = listMigrationFiles(path.join(DB_DIR, 'migrations')).filter((m) => /^\d{3}_seed_/.test(m.id));
  const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

  const body = schema.slice(0, cut)
    // Its own header is replaced by the one below.
    .replace(/^(--.*\n)+\n?/, '');

  return [
    '-- -------------------------------------------------------------',
    '-- new-database.sql — a new Batches warehouse database, in one file',
    '--',
    '-- Built by server/scripts/build-new-database.mjs from',
    '-- server/database/schema.sql (every table, type, key and index) and',
    '-- the seed migrations in server/database/migrations/ (the starter',
    '-- settings and the Summer and Winter recipes). Do not edit by hand:',
    '-- change those files and run `npm run build-new-database` again.',
    '--',
    '-- HOW TO RUN IT (on a NEW, EMPTY database only; it refuses otherwise)',
    '--   Supabase: SQL Editor, New query, paste this whole file, set the',
    '--             first admin at the bottom (optional), press Run.',
    '--   psql:     psql "<connection string>" --single-transaction -f docs/new-database.sql',
    '--   The app:  cd server && npm run migrate -- init <code>  (does the same',
    '--             from schema.sql and the migrations)',
    '--',
    '-- It holds no warehouse\'s data: no people, stock, donations, centres,',
    '-- connections or contact details.',
    '-- -------------------------------------------------------------',
    '',
    body.trimEnd(),
    '',
    '',
    '-- -- Starter data (seed migrations) --------------------------',
    ...seeds.flatMap((m) => [
      `-- from server/database/migrations/${m.file}`,
      fs.readFileSync(m.path, 'utf8').replace(/\r\n/g, '\n').replace(/^(--.*\n)+/, '').trim(),
      '',
    ]),
    'INSERT INTO public.schema_migrations (id, notes) VALUES',
    seeds.map((m) => `  (${literal(m.id)}, 'In new-database.sql')`).join(',\n') + '\nON CONFLICT (id) DO NOTHING;',
    '',
    schema.slice(cut).trimEnd(),
    '',
  ].join('\n');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(OUT, buildNewDatabaseSql());
  console.log(`✓ ${path.relative(process.cwd(), OUT)} written from schema.sql and the seed migrations.`);
}
