#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 18-fix-duplicate-import.sh
#
# RUN THIS FIRST — the server does not boot without it.
#
#   SyntaxError: Identifier 'STORAGE_AREAS' has already been declared
#   at reportCatalog.js:37
#
# reportCatalog.js imports STORAGE_AREAS twice. Duplicate bindings are
# a hard SyntaxError at module load, so `npm run dev` dies before it
# listens and Render would fail the same way on deploy. It has been on
# staging since d1f8fab.
#
# HOW IT GOT THERE
# Script 15 decides it has already run by testing for its inserted
# block as one CONTIGUOUS string: comment + import + blank line + the
# "Enum values" header. An early build of script 16 put its own import
# in the middle of that block. The block was no longer contiguous, so a
# re-run of 15 did not recognise its own work and inserted a second
# copy. Script 16 stopped doing that, but the file it had already
# damaged went to origin.
#
# The fix restores the layout 15 expects — its block contiguous, with
# the MOVEMENT_TYPES import ABOVE it rather than inside it — so the
# same re-run is a no-op instead of a third copy.
#
# WHY NO TEST CAUGHT IT
# module-loads.test.js compiles each file as a classic Script with
# `.replace(/^\s*import\s[^;]*;?\s*$/gm, '')` — every import line is
# stripped before parsing, so duplicate imports are invisible to it by
# construction. That is a reasonable trade for a brace-balance check,
# but it leaves a gap that has now cost a broken staging twice. This
# script adds the test that closes it.
#
# Idempotent. Aborts without writing if the source has drifted.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ ! -f server/src/features/reporting/reportCatalog.js ]; then
  echo "ERROR: run this from the repository root (the folder containing client/ and server/)." >&2
  exit 1
fi

python3 - <<'PYEOF'
import os, re, sys, collections

CHANGES = 0
FAILED  = []

def _read(p):
    with open(p, 'rb') as f:
        b = f.read()
    return b.decode('utf-8').replace('\r\n', '\n'), (b'\r\n' in b)

def _write(p, s, crlf):
    with open(p, 'wb') as f:
        f.write((s.replace('\n', '\r\n') if crlf else s).encode('utf-8'))

def patch(path, old, new, label):
    global CHANGES
    if not os.path.exists(path):
        FAILED.append("%s: file not found (%s)" % (label, path)); return
    s, crlf = _read(path)
    if new in s:
        print("  = %s (already applied)" % label); return
    if old not in s:
        FAILED.append("%s: anchor not found in %s" % (label, path)); return
    n = s.count(old)
    if n != 1:
        FAILED.append("%s: anchor appears %d times in %s (expected 1)" % (label, n, path)); return
    _write(path, s.replace(old, new, 1), crlf)
    CHANGES += 1
    print("  + %s" % label)

def write_file(path, body, label):
    global CHANGES
    if os.path.exists(path):
        cur, _ = _read(path)
        if cur == body:
            print("  = %s (already written)" % label); return
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    _write(path, body, False)
    CHANGES += 1
    print("  + %s" % label)

CATALOG = 'server/src/features/reporting/reportCatalog.js'

# ══════════════════════════════════════════════════════════════
print("1  remove the duplicate import")
# ══════════════════════════════════════════════════════════════

# Both copies go, and one is written back in the layout script 15
# tests for: its comment block and import CONTIGUOUS, with the
# MOVEMENT_TYPES import above rather than between them. Restoring the
# single import in the wrong position would fix the crash and leave
# the next re-run of 15 free to duplicate it again.
#
# The first copy also has two spaces before `from` — cosmetic
# alignment from the same early build of 16, and the exact byte that
# stopped 15 recognising its own line.
patch(CATALOG,
"""// The storage-area vocabulary is shared with the delivery service,
// which validates put-away locations against it, so it is declared
// once in constants/ and re-exported here to keep this catalog's flat
// shape for its own consumers.
import { STORAGE_AREAS }  from '../../constants/storageAreas.js';
import { MOVEMENT_TYPES } from '../../constants/movementTypes.js';

// The storage-area vocabulary is shared with the delivery service,
// which validates put-away locations against it, so it is declared
// once in constants/ and re-exported here to keep this catalog's flat
// shape for its own consumers.
import { STORAGE_AREAS } from '../../constants/storageAreas.js';

// ── Enum values (confirmed from pg_enum, 22 Aug 2026) ─────────""",
"""// The movement_type vocabulary is shared with the stock service,
// which validates ledger filters against it, so it is declared once in
// constants/ and re-exported here to keep this catalog's flat shape.
import { MOVEMENT_TYPES } from '../../constants/movementTypes.js';

// The storage-area vocabulary is shared with the delivery service,
// which validates put-away locations against it, so it is declared
// once in constants/ and re-exported here to keep this catalog's flat
// shape for its own consumers.
import { STORAGE_AREAS } from '../../constants/storageAreas.js';

// ── Enum values (confirmed from pg_enum, 22 Aug 2026) ─────────""",
"reportCatalog: one STORAGE_AREAS import, in the position script 15 expects")

# ══════════════════════════════════════════════════════════════
print("2  the test that would have caught it")
# ══════════════════════════════════════════════════════════════

write_file('server/__tests__/duplicate-imports.test.js', """// ─────────────────────────────────────────────────────────────
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
const IMPORT = /^import\\s+(?:(\\w+)\\s*,\\s*)?(?:\\*\\s+as\\s+(\\w+)|\\{([^}]*)\\})?\\s*(?:from\\s+)?['"][^'"]+['"]/gm;

const boundNames = (source) => {
  const names = [];
  for (const m of source.matchAll(IMPORT)) {
    const [, def, ns, named] = m;
    if (def) names.push(def);
    if (ns) names.push(ns);
    if (named) {
      for (const part of named.split(',')) {
        const name = part.trim().split(/\\s+as\\s+/).pop().trim();
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
""", "server/__tests__/duplicate-imports.test.js")

# ══════════════════════════════════════════════════════════════
print("3  the same guard on the client")
# ══════════════════════════════════════════════════════════════

# The client needs it too, and for the same reason: two scripts that
# both insert after the same import line take turns breaking each
# other's "already applied" check, and the second copy is a parse
# error. That produced a duplicate `import { ToastProvider }` in
# App.jsx while this was being written. eslint does catch it — but
# only as a parse error on one file, buried among warnings, and only
# if someone runs lint before starting the app.
write_file('client/src/tests/duplicate-imports.test.js', """// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// client/src/tests/duplicate-imports.test.js
//
// No module may bind the same imported name twice.
//
// The server has the same test, for the same reason: a duplicate
// binding is a hard SyntaxError, the module never loads, and nothing
// in a normal test run says so. On the client it surfaces as a
// Vite/rolldown parse failure at build time \u2014 after CI has already
// gone green on the unit tests.
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// This one file runs in node, not jsdom. It reads the source tree off
// disk and renders nothing, and under jsdom import.meta.url is not a
// file: URL \u2014 fileURLToPath throws \"The URL must be of scheme file\".
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
    else if (/\\.jsx?$/.test(entry)) acc.push(full);
  }
  return acc;
};

const IMPORT = /^import\\s+(?:(\\w+)\\s*,\\s*)?(?:\\*\\s+as\\s+(\\w+)|\\{([^}]*)\\})?\\s*(?:from\\s+)?['\"][^'\"]+['\"]/gm;

const boundNames = (source) => {
  const names = [];
  for (const m of source.matchAll(IMPORT)) {
    const [, def, ns, named] = m;
    if (def) names.push(def);
    if (ns) names.push(ns);
    if (named) {
      for (const part of named.split(',')) {
        const name = part.trim().split(/\\s+as\\s+/).pop().trim();
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
""", "client/src/tests/duplicate-imports.test.js")

# ══════════════════════════════════════════════════════════════
print("4  de-duplicate repeated import lines")
# ══════════════════════════════════════════════════════════════

# A generic sweep, because fixing these one named identifier at a time
# is how the second one got missed. An import line that appears twice
# in the same file with the same module and the same bindings is
# always redundant: the first copy has already created the binding and
# the second is a SyntaxError. Keep the first, drop the rest.
#
# Comparison is on a whitespace-normalised form, so the two spaces
# before `from` in one copy of the STORAGE_AREAS import do not read as
# a different line.
#
# Deliberately narrow: only whole lines starting with `import`, only
# exact repeats. Anything subtler is left for a human, and the tree
# check below still fails loudly on it.
IMPORT_LINE = re.compile(r"^\s*import\s+.*?from\s+['\"][^'\"]+['\"]\s*;?\s*$")

def dedupe_imports(path):
    src, crlf = _read(path)
    lines = src.split('\n')
    seen, out, removed = set(), [], []

    for line in lines:
        if IMPORT_LINE.match(line):
            key = ' '.join(line.split())
            if key in seen:
                removed.append(line.strip())
                continue
            seen.add(key)
        out.append(line)

    if removed:
        _write(path, '\n'.join(out), crlf)
    return removed

deduped = 0
for base in ('server/src', 'client/src'):
    for root, _dirs, fs in os.walk(base):
        for f in fs:
            if not (f.endswith('.js') or f.endswith('.jsx')):
                continue
            path = os.path.join(root, f)
            gone = dedupe_imports(path)
            for line in gone:
                print("  + %s: removed repeated `%s`" % (path, line))
                deduped += 1

if deduped:
    CHANGES += deduped
else:
    print("  = no repeated import lines")

# ══════════════════════════════════════════════════════════════
print("5  check the whole tree")
# ══════════════════════════════════════════════════════════════

# The same sweep the test does, run here so this script reports the
# state rather than leaving it to be discovered by `npm test`.
IMPORT = re.compile(r"^import\s+(?:(\w+)\s*,\s*)?(?:\*\s+as\s+(\w+)|\{([^}]*)\})?\s*(?:from\s+)?['\"][^'\"]+['\"]", re.M)

def bound(src):
    out = []
    for m in IMPORT.finditer(src):
        d, ns, named = m.group(1), m.group(2), m.group(3)
        if d:  out.append(d)
        if ns: out.append(ns)
        if named:
            for part in named.split(','):
                n = re.split(r'\s+as\s+', part.strip())[-1].strip()
                if n: out.append(n)
    return out

offenders = []
for base in ('server/src', 'client/src'):
    for root, _dirs, fs in os.walk(base):
      for f in fs:
        if not (f.endswith('.js') or f.endswith('.jsx')):
            continue
        p = os.path.join(root, f)
        counts = collections.Counter(bound(_read(p)[0]))
        dupes = sorted(n for n, c in counts.items() if c > 1)
        if dupes:
            offenders.append((p, dupes))

if offenders:
    for p, d in offenders:
        print("  ! STILL DUPLICATED: %s -> %s" % (p, ', '.join(d)))
    FAILED.append("%d file(s) still bind an imported name twice" % len(offenders))
else:
    print("  = no module binds an imported name twice")

# ── Report ────────────────────────────────────────────────────
print("")
if FAILED:
    print("ABORTED — the failures below were not applied:")
    for f in FAILED:
        print("  ! %s" % f)
    print("")
    print("%d change(s) applied before the failure." % CHANGES)
    sys.exit(1)

print("%d change(s) applied." % CHANGES)
PYEOF

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Script 18 done. No migration."
echo ""
echo "Confirm the server boots:"
echo "  cd server && npm run dev"
echo ""
echo "Then verify:"
echo "  cd server && npm test"
echo "  cd ../client && npm run lint && npm test && npm run build"
echo ""
echo "Run this BEFORE 17 if you have not applied 17 yet — a server that"
echo "will not start makes everything after it harder to judge."
echo "─────────────────────────────────────────────────────────────"