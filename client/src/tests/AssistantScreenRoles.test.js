// ─────────────────────────────────────────────────────────────
// client/src/tests/AssistantScreenRoles.test.js
//
// The assistant can navigate. This is the test that says it can only
// navigate somewhere the app would actually let you in.
//
// It reads the role guards out of App.jsx — the real route table —
// and compares them against the `roles` on each screen in the
// server's help catalogue. Two files, in two packages, that have to
// agree, and nothing but this would notice if they stopped: a screen
// whose catalogue roles are too wide produces a confident "Opened
// Purchase Orders" followed by a bounce to somebody's dashboard,
// which reads as a broken system rather than a permission.
//
// It cannot be a rule that lives in one place, because the route
// guard belongs to the router and the offer belongs to the
// assistant. So it is a rule that lives in a test.
//
// NOTE ON WHAT THIS DOES NOT CLAIM. ProtectedRoute and the server's
// requireRole are the actual access control and are untouched by any
// of this. Widening a catalogue entry cannot let anyone in anywhere.
// The failure this prevents is the assistant OFFERING a locked door.
//
// Runs in node: it reads source off disk and imports across the
// package boundary. Same directive, same reason, as
// duplicate-imports.test.js.
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCREEN_PATHS } from '../features/assistant/screenPaths';
import { STAFF, ADMIN, PACKING, DONATIONS, VOLUNTEERS } from '../routes/paths';
import {
  SCREENS,
} from '../../../server/src/features/assistant/helpCatalog.js';

const ALL = ['warehouse_worker', 'manager', 'admin'];

const appSource = readFileSync(
  fileURLToPath(new URL('../App.jsx', import.meta.url)), 'utf8'
);

const CONSTANTS = { STAFF, ADMIN, PACKING, DONATIONS, VOLUNTEERS };

// The role lists App.jsx refers to by name. Kept here rather than
// imported wholesale so that a change to one of them shows up as a
// failing test with a name, not a silently different expectation.
const ROLE_LISTS = {
  DONATION_INTAKE_ROLES:      ['warehouse_worker', 'manager', 'admin'],
  COMMUNITY_REQUEST_ROLES:    ['warehouse_worker', 'manager', 'admin'],
  VOLUNTEER_MANAGEMENT_ROLES: ['manager', 'admin'],
};

/**
 * path -> the roles App.jsx lets through, by walking the file and
 * tracking which <ProtectedRoute> group each <Route> sits in.
 *
 * Deliberately simple: it keys off the `roles=` on the group opener
 * and resets at the closing tag. The route table is a flat list of
 * groups, and the two guard tests below fail loudly if that ever
 * stops being true.
 */
const routeRoles = (() => {
  const out = new Map();
  let current = null;

  for (const line of appSource.split('\n')) {
    const group = line.match(/<Route element=\{<ProtectedRoute([^>]*)\/>\}>/);
    if (group) {
      const attrs = group[1];
      const inline = attrs.match(/roles=\{\[([^\]]*)\]\}/);
      const named  = attrs.match(/roles=\{([A-Z_]+)\}/);
      if (inline)      current = inline[1].split(',').map((r) => r.trim().replace(/['"]/g, '')).filter(Boolean);
      else if (named)  current = ROLE_LISTS[named[1]] ?? null;
      else             current = ALL;   // <ProtectedRoute /> — any signed-in role
      continue;
    }
    if (/^\s*<\/Route>\s*$/.test(line)) { current = null; continue; }
    if (!current) continue;

    // `path=` on its own line, not necessarily after `<Route` — the
    // donation routes wrap their element in a provider and are
    // formatted across several lines. Inside a group, a bare `path=`
    // is unambiguous.
    const lit = line.match(/\bpath=["']([^"']+)["']/);
    if (lit) { out.set(lit[1], current); continue; }

    const con = line.match(/\bpath=\{([A-Z_]+)\.([A-Za-z0-9_]+)\}/);
    if (con) {
      const value = CONSTANTS[con[1]]?.[con[2]];
      if (typeof value === 'string') out.set(value, current);
    }
  }
  return out;
})();

describe('reading the route table', () => {
  // If the parse breaks, every comparison below passes vacuously.
  it('found the guarded routes in App.jsx', () => {
    expect(routeRoles.size).toBeGreaterThan(20);
  });

  it('found groups of more than one kind', () => {
    const shapes = new Set([...routeRoles.values()].map((r) => [...r].sort().join(',')));
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });
});

describe('what the assistant offers matches what the app allows', () => {
  const checkable = SCREENS
    .map((s) => ({ screen: s, path: SCREEN_PATHS[s.id] }))
    // `home` has no single path — it is per role by definition.
    .filter(({ path }) => Boolean(path))
    .map((x) => ({ ...x, allowed: routeRoles.get(x.path) }));

  it('can check almost all of them', () => {
    const unmatched = checkable.filter((c) => !c.allowed).map((c) => `${c.screen.id} (${c.path})`);
    expect(unmatched, `no guard found in App.jsx for: ${unmatched.join(', ')}`).toEqual([]);
  });

  // THE test. A screen whose catalogue roles are wider than its route
  // guard is the assistant offering a door the app will slam.
  it.each(
    SCREENS.map((s) => [s.id, s])
  )('%s is never offered to someone the route would refuse', (id, screen) => {
    const path = SCREEN_PATHS[id];
    if (!path) return;                     // `home`, per role by design
    const allowed = routeRoles.get(path);
    if (!allowed) return;                  // reported by the test above

    for (const role of screen.roles) {
      expect(
        allowed,
        `the assistant offers ${id} to a ${role}, but App.jsx would bounce them`
      ).toContain(role);
    }
  });

  // The opposite slip: a screen quietly narrowed here, so the
  // assistant refuses to open something the person can reach from
  // the sidebar. Harmless but confusing, and always a mistake.
  it.each(
    SCREENS.map((s) => [s.id, s])
  )('%s is offered to everyone the route does allow', (id, screen) => {
    const path = SCREEN_PATHS[id];
    if (!path) return;
    const allowed = routeRoles.get(path);
    if (!allowed) return;

    for (const role of allowed) {
      if (role === 'guest') continue;      // never offered the assistant at all
      expect(
        screen.roles,
        `App.jsx lets a ${role} open ${id}, but the assistant will not take them`
      ).toContain(role);
    }
  });
});

describe('spot checks, in case the parser is ever fooled', () => {
  const rolesFor = (id) => SCREENS.find((s) => s.id === id)?.roles ?? [];

  it('keeps a worker off the manager screens', () => {
    for (const id of ['inventory', 'purchaseOrders', 'reporting', 'beneficiaries', 'pickingSlips']) {
      expect(rolesFor(id), id).not.toContain('warehouse_worker');
    }
  });

  it('keeps a manager off the admin screens', () => {
    for (const id of ['products', 'suppliers', 'users', 'section18a', 'emailIntegration']) {
      expect(rolesFor(id), id).not.toContain('manager');
    }
  });

  it('lets a worker onto the floor screens', () => {
    for (const id of ['receiving', 'decanting', 'packing', 'dispatch', 'donation']) {
      expect(rolesFor(id), id).toContain('warehouse_worker');
    }
  });
});
