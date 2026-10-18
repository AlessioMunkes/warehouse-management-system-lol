// ─────────────────────────────────────────────────────────────
// src/tests/FileNames.test.js
//
// Two mistakes with file names that Windows hides and that have each
// taken a screen down:
//
//   1. Two modules in one folder whose names differ only by capitals
//      or by extension (overviewCards.js beside OverviewCards.jsx). An
//      import of one can be resolved to the other, and a dev server
//      that has already done so keeps serving the wrong file. That is
//      what blanked Operations reports.
//   2. An import whose capitals do not match the file's. Windows opens
//      it anyway; the Linux server the app is deployed to does not.
//
// Jsdom gives import.meta.url a non-file URL, so this runs in node.
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /\.(jsx?|mjs|cjs)$/;

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
};
const files = walk(SRC);
const modules = files.filter((f) => CODE.test(f));

// The names really in a folder, to compare letter for letter.
const listings = new Map();
const namesIn = (dir) => {
  if (!listings.has(dir)) {
    try { listings.set(dir, new Set(readdirSync(dir))); } catch { listings.set(dir, new Set()); }
  }
  return listings.get(dir);
};
const existsExactly = (path) => {
  let dir = dirname(path);
  let name = path.slice(dir.length + 1);
  // Walk up to src, checking each part's capitals.
  while (dir.length >= SRC.length) {
    if (!namesIn(dir).has(name)) return false;
    const parent = dirname(dir);
    name = dir.slice(parent.length + 1);
    dir = parent;
  }
  return true;
};
const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
const ENDINGS = ['', '.js', '.jsx', '.mjs', '.json', '.css', '/index.js', '/index.jsx'];
const IMPORT = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|vi\.mock\s*\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]/g;

describe('file names', () => {
  it('has no two modules in one folder that differ only by capitals or extension', () => {
    const seen = new Map();
    const clashes = [];
    for (const f of modules) {
      const key = f.replace(CODE, '').toLowerCase();
      if (seen.has(key)) clashes.push(`${seen.get(key).slice(SRC.length + 1)}  and  ${f.slice(SRC.length + 1)}`);
      else seen.set(key, f);
    }
    expect(clashes).toEqual([]);
  });

  it('imports every local file by its exact name, capitals included', () => {
    const wrong = [];
    for (const f of modules) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(IMPORT)) {
        const spec = m[1].split('?')[0];
        const base = spec.startsWith('.') ? resolve(dirname(f), spec) : spec.startsWith('@/') ? resolve(SRC, spec.slice(2)) : null;
        if (!base) continue;
        // A commented-out import is not one.
        const line = text.slice(0, m.index).split('\n').pop();
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        const found = ENDINGS.some((e) => isFile(base + e) && existsExactly(base + e));
        if (!found) wrong.push(`${f.slice(SRC.length + 1)}  imports  ${spec}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
