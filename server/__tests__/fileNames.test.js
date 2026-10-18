// ─────────────────────────────────────────────────────────────
// __tests__/fileNames.test.js
//
// Two mistakes with file names that Windows hides:
//
//   1. Two modules in one folder whose names differ only by capitals.
//      An import of one can be resolved to the other.
//   2. An import whose capitals do not match the file's. Windows opens
//      it anyway; the Linux server this runs on in production does
//      not, and the app fails to start.
//
// The client has the same check (client/src/tests/FileNames.test.js).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /\.(js|mjs|cjs)$/;
const SKIP = new Set(['node_modules', 'coverage', 'uploads']);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
};
const modules = walk(ROOT).filter((f) => CODE.test(f));

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
  while (dir.length >= ROOT.length) {
    if (!namesIn(dir).has(name)) return false;
    const parent = dirname(dir);
    name = dir.slice(parent.length + 1);
    dir = parent;
  }
  return true;
};
const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
const ENDINGS = ['', '.js', '.mjs', '.json', '/index.js'];
const IMPORT = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|vi\.mock\s*\(\s*|export\s[^'"]*?from\s*)['"](\.[^'"]+)['"]/g;

describe('file names', () => {
  it('has no two modules in one folder that differ only by capitals', () => {
    const seen = new Map();
    const clashes = [];
    for (const f of modules) {
      const key = f.replace(CODE, '').toLowerCase();
      if (seen.has(key)) clashes.push(`${seen.get(key).slice(ROOT.length + 1)}  and  ${f.slice(ROOT.length + 1)}`);
      else seen.set(key, f);
    }
    expect(clashes).toEqual([]);
  });

  it('imports every local file by its exact name, capitals included', () => {
    const wrong = [];
    for (const f of modules) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(IMPORT)) {
        const base = resolve(dirname(f), m[1].split('?')[0]);
        const line = text.slice(0, m.index).split('\n').pop();
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (!ENDINGS.some((e) => isFile(base + e) && existsExactly(base + e))) wrong.push(`${f.slice(ROOT.length + 1)}  imports  ${m[1]}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
