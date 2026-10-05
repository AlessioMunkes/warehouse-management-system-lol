// ─────────────────────────────────────────────────────────────
// server/__tests__/routeRoles.test.js
//
// Who may call every route, pinned.
//
// fixtures/routeRoles.baseline.json was recorded from the routers
// BEFORE the role lists moved into constants/permissions.js, so the
// refactor is proven to have changed no one's access: every route,
// every method, the same roles. From here on it is the record — a
// change to who may call a route fails this test until the baseline is
// updated in the same commit, which puts the change in front of a
// reviewer instead of inside a diff of route files.
//
// To accept a deliberate change: regenerate the table with
// routeRoleTable() (helpers/routeRoles.js) and commit the new baseline.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// Route files reach db.js through their repositories; it connects on
// import. Nothing here runs a query.
const poolMock = { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn(), on: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { routeRoleTable } = await import('./helpers/routeRoles.js');
const baseline = JSON.parse(readFileSync(new URL('./fixtures/routeRoles.baseline.json', import.meta.url), 'utf8'));

describe('route roles', () => {
  it('match the recorded baseline, route by route', { timeout: 120000 }, async () => {
    const table = await routeRoleTable();
    // toEqual on the whole map names every route that differs, added
    // or removed, in one failure.
    expect(table).toEqual(baseline);
  });

  it('are never declared as a local list in a route file', () => {
    const dir = new URL('../src/routes/', import.meta.url);
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => {
        const src = readFileSync(new URL(f, dir), 'utf8');
        return /const\s+[A-Z_]+\s*=\s*(Object\.freeze\()?\[\s*ROLES\./.test(src)
          || /requireRole\(\s*ROLES\./.test(src);
      });
    expect(offenders).toEqual([]);
  });
});
