// ─────────────────────────────────────────────────────────────
// server/__tests__/module-loads.test.js
//
// Every other suite in here vi.mock()s the repositories, which means
// vitest substitutes the module and never parses the real file. A
// syntax error in a mocked repository is therefore completely
// invisible: the full 801-test suite went green against a
// dispatch.repository.js that Node refused to load at all, and the
// break only surfaced when someone ran `npm run dev`.
//
// (The cause was a backtick inside a SQL comment inside a template
// literal, which closed the literal early. Any typo of that shape
// would be equally invisible.)
//
// This parses every source file instead of importing it. Parsing is
// the right depth: importing would run module-level side effects —
// config/db.js calls process.exit(1) when DATABASE_URL is unset — so
// a full import would need a live database and would test far more
// than "can Node read this file".
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';

// Resolve relative to this test file (not process.cwd()) so the suite
// passes whether vitest runs from the repo root or from server/.
const SRC = join(import.meta.dirname, '..', 'src');

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.js')) acc.push(full);
  }
  return acc;
};

const files = walk(SRC);

describe('every source module parses', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))('parses %s', (_name, full) => {
    const source = readFileSync(full, 'utf8');
    // SourceTextModule is behind a flag, so compile as a classic
    // Script with the import/export lines stripped. That still catches
    // every unbalanced brace, paren, quote and backtick, which is the
    // entire point.
    const stripped = source
      .replace(/^\s*import\s[^;]*;?\s*$/gm, '')
      .replace(/^\s*export\s+default\s+/gm, 'void ')
      .replace(/^\s*export\s+/gm, '');
    expect(() => new vm.Script(stripped, { filename: full })).not.toThrow();
  });
});
