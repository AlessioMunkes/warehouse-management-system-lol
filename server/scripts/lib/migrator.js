// ─────────────────────────────────────────────────────────────
// server/scripts/lib/migrator.js
//
// The logic behind scripts/migrate.mjs, kept free of process.exit and
// console so it can be unit tested. See migrate.mjs for usage.
//
// One rule holds throughout: every warehouse database runs the same
// schema. Migrations are applied to ALL of them, in file-name order,
// and the run stops at the first failure so no site is left ahead of
// another without the operator knowing exactly where it stopped.
// ─────────────────────────────────────────────────────────────
import fs   from 'node:fs';
import path from 'node:path';

export const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;

/** Migration files in dir, sorted by name, as { id, file, path }. */
export const listMigrationFiles = (dir) =>
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      if (!MIGRATION_FILE.test(file)) {
        throw new Error(
          `Migration file name "${file}" does not match NNN_lowercase_words.sql. ` +
          'Rename it before running migrations.'
        );
      }
      return { id: file.slice(0, -4), file, path: path.join(dir, file) };
    });

/** Ids listed in baseline-migrations.txt (one per line, # comments). */
export const readManifest = (file) =>
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);

// Removes comments, quoted strings and dollar-quoted bodies, so the
// checks below only see real top-level SQL. A DO $$ BEGIN ... END $$
// block must not look like a transaction statement.
export const stripSqlNoise = (sql) => {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    const dollar = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? sql.length : end + tag.length;
      out += ' $body$ ';
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      i = j + 1;
      out += " '' ";
      continue;
    }
    out += sql[i];
    i++;
  }
  return out;
};

/**
 * Why this migration cannot be run inside the runner's transaction,
 * or null if it can. The runner wraps each file in BEGIN/COMMIT so a
 * failure leaves nothing half-applied; a file that manages its own
 * transaction, or uses CONCURRENTLY, would break that.
 */
export const unsafeMigrationReason = (sql) => {
  const clean = stripSqlNoise(sql);
  const statementStarts = clean
    .split(';')
    .map((s) => s.trim().split(/\s+/).slice(0, 2).join(' ').toUpperCase());

  for (const start of statementStarts) {
    if (/^(BEGIN|COMMIT|ROLLBACK|END)\b/.test(start) || start === 'START TRANSACTION') {
      return `it contains its own "${start.split(' ')[0]}". Remove it: the runner wraps every file in a transaction.`;
    }
  }
  if (/\bCONCURRENTLY\b/i.test(clean)) {
    return 'it uses CONCURRENTLY, which cannot run inside a transaction. Drop CONCURRENTLY (these tables are small enough to lock briefly).';
  }
  return null;
};

/** Migrations in files that are not in applied (a Set of ids), in order. */
export const pendingMigrations = (files, applied) =>
  files.filter((m) => !applied.has(m.id));

// ── Database helpers (take a connected pg.Client) ─────────────

export const publicTableCount = async (client) => {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`
  );
  return rows[0].n;
};

/** Set of applied ids, or null when schema_migrations does not exist. */
export const appliedMigrations = async (client) => {
  const { rows: [exists] } = await client.query(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`
  );
  if (!exists.ok) return null;
  const { rows } = await client.query('SELECT id FROM public.schema_migrations');
  return new Set(rows.map((r) => r.id));
};

export const recordMigration = (client, id, notes) =>
  client.query(
    `INSERT INTO public.schema_migrations (id, notes) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [id, notes]
  );

/** Applies one migration file inside its own transaction. */
export const applyMigration = async (client, migration, sql) => {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await recordMigration(client, migration.id, 'Applied by scripts/migrate.mjs');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    // A migration can change search_path for the session (pg_dump
    // output does). Never let that leak into the next file.
    await client.query('RESET search_path').catch(() => {});
  }
};

/**
 * Builds an empty database into a working warehouse: baseline schema,
 * starter rows, and a record of the migrations the baseline already
 * contains. One transaction: it either all lands or none of it does.
 */
export const initialiseDatabase = async (client, { baselineSql, seedSql, manifest }) => {
  const tables = await publicTableCount(client);
  if (tables > 0) {
    throw new Error(
      `Refusing to initialise: the database already has ${tables} table(s) in "public". ` +
      'init is only for a new, empty database.'
    );
  }
  await client.query('BEGIN');
  try {
    await client.query(baselineSql);
    // baseline.sql (pg_dump output) empties search_path for the session.
    await client.query('SET LOCAL search_path TO public');
    await client.query(seedSql);
    for (const id of manifest) {
      await recordMigration(client, id, 'In baseline.sql');
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.query('RESET search_path').catch(() => {});
  }
};
