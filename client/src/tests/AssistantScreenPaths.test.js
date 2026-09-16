// ─────────────────────────────────────────────────────────────
// client/src/tests/AssistantScreenPaths.test.js
//
// The join between the server's screen vocabulary and this app's
// routes.
//
// The assistant can say "that is on Inventory" and offer a link. The
// server does not send URLs — it sends ids — precisely so that a
// renamed route cannot become a dead link handed to a volunteer. But
// that only holds if this file is kept in step, and a stale entry
// here is silent: the id simply resolves to a path nothing serves.
//
// So this is the thing that notices. It reads the real route table
// out of App.jsx rather than a list someone remembered to update,
// which means renaming a route breaks this test in the same commit
// that renames it.
//
// Runs in node, not jsdom: it reads the source tree off disk and
// renders nothing, and under jsdom import.meta.url is not a file:
// URL, so fileURLToPath throws "The URL must be of scheme file".
// Same directive, same reason, as duplicate-imports.test.js.
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCREEN_PATHS, pathForScreen, matchScreen } from '../features/assistant/screenPaths';
import { STAFF, ADMIN, PACKING, DONATIONS, VOLUNTEERS } from '../routes/paths';

const appSource = readFileSync(
  fileURLToPath(new URL('../App.jsx', import.meta.url)), 'utf8'
);

// App.jsx writes most routes as path={ADMIN.products}, not as a
// string, so a regex for quoted literals alone finds about half the
// table and passes the other half vacuously. Both forms are read,
// and the constants are resolved through the same paths.js the app
// uses — so this compares real routes, not a transcription of them.
const CONSTANTS = { STAFF, ADMIN, PACKING, DONATIONS, VOLUNTEERS };

const declaredPaths = (() => {
  const found = new Set();

  // path="/noc/inventory"  and  path={'/noc/inventory'}
  for (const m of appSource.matchAll(/path=\{?["'`]([^"'`]+)["'`]\}?/g)) {
    found.add(m[1]);
  }
  // path={ADMIN.products}
  for (const m of appSource.matchAll(/path=\{([A-Z_]+)\.([A-Za-z0-9_]+)\}/g)) {
    const value = CONSTANTS[m[1]]?.[m[2]];
    if (typeof value === 'string') found.add(value);
  }
  return found;
})();

describe('every screen the assistant can point at', () => {
  const entries = Object.entries(SCREEN_PATHS).filter(([, p]) => p);

  it('has at least one route to point at', () => {
    // Guards against the whole map being emptied by a bad refactor
    // and every test below passing vacuously.
    expect(entries.length).toBeGreaterThan(10);
  });

  // The same guard for the other side. If the extraction below ever
  // stops finding routes — App.jsx restructured, a new way of
  // declaring them — every row would fail loudly rather than
  // quietly, but this says why in one line.
  it('found the route table in App.jsx', () => {
    expect(declaredPaths.size).toBeGreaterThan(20);
  });

  it.each(entries)('%s resolves to a route the app actually serves', (id, path) => {
    const served = [...declaredPaths].some(
      (p) => p === path || p.startsWith(`${path}/`) || path.startsWith(`${p}/`)
    );
    expect(served, `${id} -> ${path} is not in App.jsx`).toBe(true);
  });

  it('points each id somewhere different', () => {
    const paths = entries.map(([, p]) => p);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // The failure mode this prevents is a link in a help answer that
  // goes nowhere. Returning null instead means the answer renders
  // without a button, which still reads correctly.
  it('returns null for an id it does not know, rather than undefined', () => {
    expect(pathForScreen('not-a-screen')).toBeNull();
    expect(pathForScreen(undefined)).toBeNull();
  });
});

describe('working out which screen someone is on', () => {
  it.each([
    ['/noc/procurement',            'receiving'],
    ['/noc/procurement/deliveries', 'deliveries'],   // not swallowed by its parent
    ['/noc/decanting',              'decanting'],
    ['/noc/decanting/sheets',       'decantingRecords' in SCREEN_PATHS ? 'decantingRecords' : 'decanting'],
    ['/noc/packing',                'packing'],
    ['/noc/packing/42',             'packing'],      // a detail route is still its screen
    ['/staff/dispatch',             'dispatch'],
    ['/staff/dispatch/history',     'dispatchHistory'],
    ['/noc/inventory',              'inventory'],
    ['/noc/purchase-orders',        'purchaseOrders'],
    ['/admin/products',             'products'],
  ])('%s is %s', (path, expected) => {
    expect(matchScreen(path)).toBe(expected);
  });

  it.each(['/noc', '/manager', '/admin'])('treats %s as the home screen', (path) => {
    expect(matchScreen(path)).toBe('home');
  });

  // /noc is a prefix of almost everything, so matching it loosely
  // would make every staff screen look like the home screen.
  it('does not let /noc swallow the screens underneath it', () => {
    expect(matchScreen('/noc/reporting')).toBe('reporting');
    expect(matchScreen('/noc/beneficiaries')).toBe('beneficiaries');
  });

  it('returns null for somewhere it has no topics about', () => {
    expect(matchScreen('/login')).toBeNull();
    expect(matchScreen('')).toBeNull();
    expect(matchScreen(undefined)).toBeNull();
  });
});
