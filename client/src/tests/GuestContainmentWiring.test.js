// ──────────────────────────────────────────────────────────
// client/src/tests/GuestContainmentWiring.test.js
//
// Every ProtectedRoute in App.jsx must declare `roles`.
//
// GuestContainment.test.jsx proves ProtectedRoute redirects a guest when
// it is GIVEN a role list. It cannot prove App.jsx actually gives it one:
// it builds its own <Routes> tree, so deleting `roles` from App.jsx
// leaves that suite green while the app ships wide open again. This is
// the half that watches the real wiring.
//
// ProtectedRoute skips its check entirely when `roles` is undefined:
//
//     if (roles && !roles.includes(user.role)) { ...redirect... }
//
// so a bare <ProtectedRoute /> means "any logged-in user", guests
// included. That is exactly how guests came to render the warehouse
// floor. A route group that genuinely should admit everyone must say so
// explicitly with a role list, not by omission.
//
// Static source analysis, following duplicate-imports.test.js — the
// wiring is a fact about the file, and asserting it against the text
// costs nothing and needs no render.
// ──────────────────────────────────────────────────────────
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../App.jsx', import.meta.url));

describe('App.jsx route guards', () => {
  it('declares roles on every ProtectedRoute element', () => {
    const source = readFileSync(APP, 'utf8');

    // Only real route elements: `element={<ProtectedRoute ... />}`.
    //
    // Anchoring on `element={` matters. A looser /<ProtectedRoute[^>]*\/>/
    // also matches the string "<ProtectedRoute />" written inside a
    // comment — including the one in App.jsx explaining this very bug —
    // and reports a guard that does not exist.
    const uses = source.match(/element=\{\s*<ProtectedRoute\b[^>]*\/>\s*\}/g) ?? [];

    // If this is 0 the regex has drifted from the file; failing here is
    // better than passing vacuously.
    expect(uses.length).toBeGreaterThan(0);

    const missingRoles = uses.filter((use) => !/\broles=/.test(use));

    expect(
      missingRoles,
      `These <ProtectedRoute> elements in App.jsx declare no roles, so they admit ` +
      `ANY logged-in user including guests:\n  ${missingRoles.join('\n  ')}\n\n` +
      `Add an explicit roles={...} list (STAFF_ROLES for the warehouse floor).`,
    ).toEqual([]);
  });
});
