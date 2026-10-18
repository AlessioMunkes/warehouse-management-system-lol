// ─────────────────────────────────────────────────────────────
// server/__tests__/migrator.test.js
//
// Script 50: the migration runner's safety checks, and the real
// migration files and manifest in this repo. The database side of the
// runner (init / up / mark-baseline) was verified against real
// PostgreSQL; see the script 50 note in the project docs.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listMigrationFiles, readManifest, stripSqlNoise, unsafeMigrationReason, pendingMigrations,
} from '../scripts/lib/migrator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(here, '..', 'database');

describe('unsafeMigrationReason', () => {
  it('accepts plain DDL', () => {
    expect(unsafeMigrationReason('ALTER TABLE a ADD COLUMN b int;\nCREATE INDEX i ON a(b);')).toBeNull();
  });

  it('accepts DO blocks, whose BEGIN/END are PL/pgSQL, not transactions', () => {
    const sql = "DO $$\nBEGIN\n  IF true THEN RAISE NOTICE 'x'; END IF;\nEND\n$$;\nDO $tag$ BEGIN NULL; END $tag$;";
    expect(unsafeMigrationReason(sql)).toBeNull();
  });

  it('ignores BEGIN or COMMIT inside comments and strings', () => {
    const sql = "-- BEGIN;\n/* COMMIT; */\nINSERT INTO t VALUES ('BEGIN; it''s fine');";
    expect(unsafeMigrationReason(sql)).toBeNull();
  });

  it.each([
    ['BEGIN;\nALTER TABLE a ADD b int;\nCOMMIT;', /BEGIN/],
    ['ALTER TABLE a ADD b int;\ncommit;', /COMMIT/],
    ['start transaction;\nSELECT 1;', /START/],
    ['ROLLBACK;', /ROLLBACK/],
    ['CREATE INDEX CONCURRENTLY i ON a(b);', /CONCURRENTLY/],
  ])('refuses %j', (sql, pattern) => {
    expect(unsafeMigrationReason(sql)).toMatch(pattern);
  });

  it('does not mistake CONCURRENTLY in a comment for a real one', () => {
    expect(unsafeMigrationReason('-- never use CONCURRENTLY here\nCREATE INDEX i ON a(b);')).toBeNull();
  });
});

describe('stripSqlNoise', () => {
  it('keeps real SQL and removes comments, strings and dollar bodies', () => {
    const out = stripSqlNoise("SELECT 'x -- y' AS a; -- note\nDO $$ BEGIN END $$; /* c */ SELECT 2;");
    expect(out).toContain('SELECT');
    expect(out).not.toMatch(/note|BEGIN|\bc\b|x -- y/);
  });
});

describe('listMigrationFiles and pendingMigrations', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const f of ['002_b.sql', '001_a.sql', '010_c.sql', 'README.md']) fs.writeFileSync(path.join(dir, f), '');

  it('lists .sql files in name order, as ids without .sql', () => {
    expect(listMigrationFiles(dir).map((m) => m.id)).toEqual(['001_a', '002_b', '010_c']);
  });

  it('returns only unapplied migrations, in order', () => {
    const files = listMigrationFiles(dir);
    expect(pendingMigrations(files, new Set(['002_b'])).map((m) => m.id)).toEqual(['001_a', '010_c']);
  });

  it('rejects a badly named file rather than guessing its order', () => {
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    fs.writeFileSync(path.join(bad, '5-add Thing.sql'), '');
    expect(() => listMigrationFiles(bad)).toThrow(/does not match/);
  });
});

describe('this repo', () => {
  // The numbered files were cleared at handover: the database has them
  // all. No folder lists as no migrations; it comes back with the next
  // schema change.
  const migrations = listMigrationFiles(path.join(DB_DIR, 'migrations'));
  // baseline.sql, seed.sql and baseline-migrations.txt are only read by
  // `migrate init` and `mark-baseline`, and are not in the repo yet.
  // Their checks run once the files are added, and are skipped until then.
  const inDb = (name) => path.join(DB_DIR, name);
  const has = (name) => fs.existsSync(inDb(name));
  const manifest = has('baseline-migrations.txt') ? readManifest(inDb('baseline-migrations.txt')) : [];

  it('every migration file can be applied by the runner', () => {
    for (const m of migrations) {
      expect([m.file, unsafeMigrationReason(fs.readFileSync(m.path, 'utf8'))]).toEqual([m.file, null]);
    }
  });

  it.skipIf(!has('baseline-migrations.txt'))('every id in baseline-migrations.txt is a real migration file', () => {
    const ids = new Set(migrations.map((m) => m.id));
    for (const id of manifest) expect([id, ids.has(id)]).toEqual([id, true]);
  });

  it.skipIf(!has('baseline-migrations.txt'))('baseline-migrations.txt lists each id once', () => {
    expect(new Set(manifest).size).toBe(manifest.length);
  });

  it.skipIf(!has('seed.sql'))('seed.sql manages no transaction of its own (init wraps it)', () => {
    const seed = fs.readFileSync(inDb('seed.sql'), 'utf8');
    expect(unsafeMigrationReason(seed)).toBeNull();
  });

  it.skipIf(!has('baseline.sql'))('baseline.sql contains no Supabase-only schema', () => {
    const baseline = fs.readFileSync(inDb('baseline.sql'), 'utf8');
    const sql = stripSqlNoise(baseline);
    expect(sql).not.toMatch(/\b(auth|storage|realtime|vault|graphql|pgbouncer)\.\w/);
    expect(sql).not.toMatch(/^\\(un)?restrict/m);
  });
});
