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
// (routes/routeTable.js, which App.jsx is built from) rather than a list someone remembered to update,
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
import { SCREEN_PATHS, pathForScreen, matchScreen } from '../features/assistant/screenPaths';
import { ROUTES, REDIRECTS } from '../routes/routeTable';

// Every path the app serves, from the route table App.jsx is built
// from (routes/routeTable.js) — real routes, not a transcription.
const declaredPaths = new Set([...ROUTES.map((r) => r.path), ...REDIRECTS.map((r) => r.from)]);

describe('every screen the assistant can point at', () => {
  const entries = Object.entries(SCREEN_PATHS).filter(([, p]) => p);

  it('has at least one route to point at', () => {
    // Guards against the whole map being emptied by a bad refactor
    // and every test below passing vacuously.
    expect(entries.length).toBeGreaterThan(10);
  });

  // The same guard for the other side: an emptied route table would
  // fail every row below; this says why in one line.
  it('found the route table', () => {
    expect(declaredPaths.size).toBeGreaterThan(20);
  });

  it.each(entries)('%s resolves to a route the app actually serves', (id, path) => {
    const served = [...declaredPaths].some(
      (p) => p === path || p.startsWith(`${path}/`) || path.startsWith(`${p}/`)
    );
    expect(served, `${id} -> ${path} is not in the route table`).toBe(true);
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

// Benevolent Requests and Feed the Soil are one screen to the
// assistant but a page per side: the floor's and the manager's.
describe('screens with a page per side', () => {
  it('sends a worker to the floor page and a manager to theirs', () => {
    expect(pathForScreen('communityRequests', 'warehouse_worker')).toBe('/staff/community-requests');
    expect(pathForScreen('communityRequests', 'manager')).toBe('/noc/community-requests');
    expect(pathForScreen('feedTheSoil', 'warehouse_worker')).toBe('/staff/feed-the-soil');
    expect(pathForScreen('feedTheSoil', 'manager')).toBe('/noc/feed-the-soil');
  });

  // An answer never links someone to a screen of another role's.
  it('gives no link to a screen the reader cannot open', () => {
    expect(pathForScreen('feedTheSoil', 'admin')).toBeNull();
    expect(pathForScreen('pickingSlips', 'admin')).toBeNull();
    expect(pathForScreen('products', 'manager')).toBeNull();
    expect(pathForScreen('inventory', 'warehouse_worker')).toBeNull();
    expect(pathForScreen('products', 'admin')).toBe('/admin/products');
    expect(pathForScreen('donationManagement', 'manager')).toBe('/admin/donation-management');
  });

  it('recognises either page as the same screen', () => {
    expect(matchScreen('/staff/community-requests')).toBe('communityRequests');
    expect(matchScreen('/noc/feed-the-soil')).toBe('feedTheSoil');
    expect(matchScreen('/staff/feed-the-soil')).toBe('feedTheSoil');
  });
});
