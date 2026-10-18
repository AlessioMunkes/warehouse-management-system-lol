#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// server/scripts/migrate.mjs — database migrations for every warehouse
//
// Run from the server folder:
//
//   npm run migrate                      same as "status"
//   npm run migrate -- status            what is applied and pending, per database
//   npm run migrate -- up                apply pending migrations to EVERY database
//   npm run migrate -- init <code>       build a NEW, empty warehouse database
//   npm run migrate -- mark-baseline     one-off, for a database that predates
//                                        this runner: record the migrations
//                                        baseline.sql already contains
//
// Add --only <code> to status / up / mark-baseline to limit to one database.
// mark-baseline shows what it would do and changes nothing without --yes.
//
// Which databases: every entry in WAREHOUSE_DB_URLS, or DATABASE_URL
// (shown as "default") when that is unset. Read from server/.env, the
// same file the app uses.
//
// Rules the runner enforces:
//   - Files in database/migrations/ named NNN_lowercase_words.sql run in
//     name order. Each runs inside its own transaction together with
//     the row recording it, so a failure leaves nothing half-applied.
//   - "up" checks EVERY database is reachable and every pending file is
//     safe to wrap in a transaction BEFORE changing anything.
//   - It stops at the first failure and says which databases are done,
//     which one failed, and which were not touched.
//   - Never apply a migration to one warehouse by hand. Every site must
//     run the same schema, and this runner is how that stays true.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg   from 'pg';
import { parseWarehouseUrls } from '../src/config/dbRouter.js';
import {
  listMigrationFiles, readManifest, unsafeMigrationReason, pendingMigrations,
  appliedMigrations, publicTableCount, applyMigration, initialiseDatabase, recordMigration,
} from './lib/migrator.js';

const here      = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR    = path.resolve(here, '..', 'database');
const MIG_DIR   = path.join(DB_DIR, 'migrations');
const BASELINE  = path.join(DB_DIR, 'baseline.sql');
const SEED      = path.join(DB_DIR, 'seed.sql');
const MANIFEST  = path.join(DB_DIR, 'baseline-migrations.txt');

const ssl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };

// ── Arguments ─────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args[0] : 'status';
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] || fail(`${name} needs a value.`);
};

// ── Which databases ───────────────────────────────────────────
const allTargets = () => {
  let urls;
  try {
    urls = parseWarehouseUrls(process.env.WAREHOUSE_DB_URLS);
  } catch (err) {
    fail(err.message);
  }
  if (urls) return Object.entries(urls).map(([code, url]) => ({ code, url }));
  if (!process.env.DATABASE_URL) fail('Neither WAREHOUSE_DB_URLS nor DATABASE_URL is set (server/.env).');
  return [{ code: 'default', url: process.env.DATABASE_URL }];
};

const selectTargets = () => {
  const targets = allTargets();
  const only = option('--only');
  if (!only) return targets;
  const match = targets.filter((t) => t.code === only);
  if (!match.length) fail(`No database "${only}". Configured: ${targets.map((t) => t.code).join(', ')}.`);
  return match;
};

const connect = async (target) => {
  const client = new pg.Client({ connectionString: target.url, ssl });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`[${target.code}] cannot connect: ${err.message}`);
  }
  return client;
};

const withClients = async (targets, fn) => {
  const clients = [];
  try {
    for (const t of targets) clients.push({ target: t, client: await connect(t) });
    return await fn(clients);
  } finally {
    await Promise.all(clients.map(({ client }) => client.end().catch(() => {})));
  }
};

const loadMigrations = () => {
  try {
    return listMigrationFiles(MIG_DIR).map((m) => ({ ...m, sql: fs.readFileSync(m.path, 'utf8') }));
  } catch (err) {
    return fail(err.message);
  }
};

// ── status ────────────────────────────────────────────────────
const status = async () => {
  const migrations = loadMigrations();
  await withClients(selectTargets(), async (clients) => {
    for (const { target, client } of clients) {
      const applied = await appliedMigrations(client);
      if (applied === null) {
        const tables = await publicTableCount(client);
        console.log(`\n[${target.code}] ` + (tables === 0
          ? 'empty database: run  npm run migrate -- init ' + target.code
          : `${tables} tables but no schema_migrations table. Not managed by this runner.`));
        continue;
      }
      const pending = pendingMigrations(migrations, applied);
      console.log(`\n[${target.code}] ${applied.size} recorded, ${pending.length} pending`);
      for (const m of pending) console.log(`    pending  ${m.file}`);
    }
  });
};

// ── up ────────────────────────────────────────────────────────
const up = async () => {
  const migrations = loadMigrations();
  const targets = selectTargets();

  await withClients(targets, async (clients) => {
    // Preflight: nothing is changed until every database has been
    // checked and every pending file is known to be safe.
    const plan = [];
    for (const { target, client } of clients) {
      const applied = await appliedMigrations(client);
      if (applied === null) {
        fail(`[${target.code}] has no schema_migrations table. ` +
             `If it is new and empty, run init ${target.code}. Nothing was changed anywhere.`);
      }
      const pending = pendingMigrations(migrations, applied);
      for (const m of pending) {
        const reason = unsafeMigrationReason(m.sql);
        if (reason) fail(`${m.file} cannot be applied: ${reason} Nothing was changed anywhere.`);
      }
      plan.push({ target, client, pending });
    }

    const total = plan.reduce((n, p) => n + p.pending.length, 0);
    if (total === 0) {
      console.log('\nEvery database is up to date.');
      return;
    }

    console.log('\nPlan:');
    for (const p of plan) {
      console.log(`  [${p.target.code}] ${p.pending.length ? p.pending.map((m) => m.id).join(', ') : 'up to date'}`);
    }

    const done = [];
    for (const { target, client, pending } of plan) {
      for (const m of pending) {
        process.stdout.write(`  [${target.code}] ${m.file} ... `);
        try {
          await applyMigration(client, m, m.sql);
        } catch (err) {
          console.log('FAILED');
          const untouched = plan.map((p) => p.target.code)
            .filter((c) => c !== target.code && !done.includes(c));
          fail(
            `[${target.code}] ${m.file} failed and was rolled back: ${err.message}\n` +
            `  Finished: ${done.length ? done.join(', ') : 'none'}\n` +
            `  Stopped at: ${target.code} (earlier files on this database were applied)\n` +
            `  Not touched: ${untouched.length ? untouched.join(', ') : 'none'}\n` +
            '  Fix the migration, then run "up" again. It picks up where it stopped.'
          );
        }
        console.log('ok');
      }
      done.push(target.code);
    }
    console.log(`\n✓ Applied ${total} migration(s). Every database is on the same schema.`);
  });
};

// ── init <code> ───────────────────────────────────────────────
const init = async () => {
  const code = args[1];
  if (!code || code.startsWith('--')) fail('Usage: npm run migrate -- init <warehouse code>');
  const target = allTargets().find((t) => t.code === code);
  if (!target) fail(`No database "${code}" in WAREHOUSE_DB_URLS. Add it there first.`);

  for (const f of [BASELINE, SEED, MANIFEST]) {
    if (!fs.existsSync(f)) fail(`Missing ${path.relative(process.cwd(), f)}.`);
  }
  const migrations = loadMigrations();
  const manifest = readManifest(MANIFEST);

  await withClients([target], async ([{ client }]) => {
    console.log(`\n[${code}] building from baseline.sql + seed.sql ...`);
    try {
      await initialiseDatabase(client, {
        baselineSql: fs.readFileSync(BASELINE, 'utf8'),
        seedSql:     fs.readFileSync(SEED, 'utf8'),
        manifest,
      });
    } catch (err) {
      fail(`[${code}] ${err.message}\n  Nothing was created (the whole init is one transaction).`);
    }
    console.log(`[${code}] schema and starter rows created`);

    const pending = pendingMigrations(migrations, await appliedMigrations(client));
    for (const m of pending) {
      const reason = unsafeMigrationReason(m.sql);
      if (reason) fail(`${m.file} cannot be applied: ${reason}`);
      process.stdout.write(`[${code}] ${m.file} ... `);
      try {
        await applyMigration(client, m, m.sql);
      } catch (err) {
        console.log('FAILED');
        fail(`[${code}] ${m.file} failed and was rolled back: ${err.message}`);
      }
      console.log('ok');
    }
    console.log(`\n✓ Warehouse "${code}" is ready. Next: create its first admin account.`);
  });
};

// ── mark-baseline ─────────────────────────────────────────────
// For a database that existed before this runner (the live Cape Town
// one). Its schema already contains everything in baseline.sql, but
// its schema_migrations table never recorded the numbered files, so
// "up" would try to apply them again.
const markBaseline = async () => {
  if (!fs.existsSync(MANIFEST)) fail('Missing database/baseline-migrations.txt.');
  const manifest = readManifest(MANIFEST);

  await withClients(selectTargets(), async (clients) => {
    for (const { target, client } of clients) {
      const applied = await appliedMigrations(client);
      if (applied === null) {
        fail(`[${target.code}] has no schema_migrations table. mark-baseline is only for an existing database.`);
      }
      const missing = manifest.filter((id) => !applied.has(id));
      if (!missing.length) {
        console.log(`[${target.code}] already records every baseline migration.`);
        continue;
      }
      console.log(`[${target.code}] would record as already applied:\n    ${missing.join('\n    ')}`);
      if (!flag('--yes')) continue;
      for (const id of missing) await recordMigration(client, id, 'Recorded by mark-baseline (already in schema)');
      console.log(`[${target.code}] recorded ${missing.length}.`);
    }
    if (!flag('--yes')) {
      console.log('\nNothing was written. Only run this against a database whose schema ALREADY');
      console.log('contains these migrations (the one baseline.sql was taken from). Then add --yes.');
    }
  });
};

const commands = { status, up, init, 'mark-baseline': markBaseline };
if (!commands[command]) fail(`Unknown command "${command}". Use status, up, init or mark-baseline.`);

commands[command]().catch((err) => fail(err.message));
