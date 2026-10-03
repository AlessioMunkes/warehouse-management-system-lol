// ─────────────────────────────────────────────────────────────
// client/src/tests/AssistantScreenRoles.test.js
//
// The assistant can navigate. This is the test that says it can only
// navigate somewhere the app would actually let you in.
//
// It reads the role guards out of routes/routeTable.js — the table
// App.jsx builds its routes from — and compares them against the `roles` on each screen in the
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
// Runs in node: it imports across the package boundary. Same directive, same reason, as
// duplicate-imports.test.js.
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { SCREEN_PATHS, pathForScreen } from '../features/assistant/screenPaths';
import { ROUTES } from '../routes/routeTable';
import {
  SCREENS,
} from '../../../server/src/features/assistant/helpCatalog.js';

// path -> the roles the app lets through, straight from the route
// table App.jsx is built from (routes/routeTable.js). Public routes
// have no roles and are left out: the assistant only offers screens
// behind a login.
const routeRoles = new Map(ROUTES.filter((r) => r.roles).map((r) => [r.path, [...r.roles]]));

describe('reading the route table', () => {
  // If the parse breaks, every comparison below passes vacuously.
  it('found the guarded routes in the route table', () => {
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
    // Per role: Benevolent Requests and Feed the Soil send a worker to
    // the floor's page and everyone else to the manager's.
    for (const role of screen.roles) {
      const path = pathForScreen(id, role);
      if (!path) continue;                 // `home`, per role by design
      const allowed = routeRoles.get(path);
      if (!allowed) continue;              // reported by the test above
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
    for (const role of ['warehouse_worker', 'manager', 'admin']) {
      const path = pathForScreen(id, role);
      if (!path) continue;
      const allowed = routeRoles.get(path);
      if (!allowed || !allowed.includes(role)) continue;
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
