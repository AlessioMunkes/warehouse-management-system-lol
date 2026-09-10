// ─────────────────────────────────────────────────────────────
// server/__tests__/duplicate-imports.test.js
//
// No module may bind the same imported name twice.
//
// This exists because it happened, twice, and nothing caught it:
//
//   SyntaxError: Identifier 'STORAGE_AREAS' has already been declared
//
// A duplicate binding is a hard SyntaxError at module load, so the
// server does not start — but it reaches production perfectly happily,
// because the whole suite passes. module-loads.test.js is the test
// that ought to catch it and cannot: it compiles each file as a
// classic Script with every import line stripped first, since
// SourceTextModule is behind a flag. Stripping imports is the right
// call for a brace-balance check and it leaves this exact gap.
//
// So: parse the import statements textually and count the names. Not
// as rigorous as a real module loader, but it covers the failure mode
// that has actually bitten, and it costs milliseconds.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.js')) acc.push(full);
  }
  return acc;
};

// Handles the shapes this codebase actually uses:
//   import x from '...'
//   import { a, b as c } from '...'
//   import x, { a } from '...'
//   import * as ns from '...'
// Bare side-effect imports bind nothing and are ignored.
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

    // The message matters: the failure this guards against is a boot
    // crash, and the name is the whole diagnosis.
    expect(duplicates, `duplicate import binding(s): ${duplicates.join(', ')}`).toEqual([]);
  });
});
