// ──────────────────────────────────────────────────────────
// client/src/tests/duplicate-imports.test.js
//
// No module may bind the same imported name twice.
//
// The server has the same test, for the same reason: a duplicate
// binding is a hard SyntaxError, the module never loads, and nothing
// in a normal test run says so. On the client it surfaces as a
// Vite/rolldown parse failure at build time — after CI has already
// gone green on the unit tests.
// ──────────────────────────────────────────────────────────
// This one file runs in node, not jsdom. It reads the source tree off
// disk and renders nothing, and under jsdom import.meta.url is not a
// file: URL — fileURLToPath throws "The URL must be of scheme file".
// process.cwd() would work too, but `process` is not in this project's
// client eslint globals, so it lints as no-undef.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../', import.meta.url));

const SKIP = new Set(['tests', 'assets']);

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.jsx?$/.test(entry)) acc.push(full);
  }
  return acc;
};

const IMPORT = /^import\s+(?:(\w+)\s*,\s*)?(?:\*\s+as\s+(\w+)|\{([^}]*)\})?\s*(?:from\s+)?['"][^'"]+['"]/gm;

const boundNames = (source) => {
  const names = [];
  for (const m of source.matchAll(IMPORT)) {
    const [, def, ns, named] = m;
    if (def) names.push(def);
    if (ns) names.push(ns);
    if (named) {
      for (const part of named.split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.push(name);
      }
    }
  }
  return names;
};

const files = walk(SRC);

describe('no module imports the same name twice', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))('%s', (_name, full) => {
    const names = boundNames(readFileSync(full, 'utf8'));
    const seen = new Set();
    const duplicates = [];

    for (const name of names) {
      if (seen.has(name)) duplicates.push(name);
      seen.add(name);
    }

    expect(duplicates, `duplicate import binding(s): ${duplicates.join(', ')}`).toEqual([]);
  });
});
