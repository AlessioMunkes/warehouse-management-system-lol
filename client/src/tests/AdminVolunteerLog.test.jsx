// ─────────────────────────────────────────────────────────────
// client/src/tests/AdminVolunteerLog.test.jsx
//
// The admin and the manager must not land on the same volunteer
// screen. They did: every admin entry point pointed at
// VOLUNTEERS.events — the coordinator's event workflow — while
// VolunteerManagementPage, the guest log, sat unrouted with its import
// commented out in App.jsx.
//
// What broke was wiring, not behaviour: an import, a route, and two
// links. So this reads the wiring — the route table, the page map and
// the sidebars built from them — rather than rendering a page, which
// would have passed throughout.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isValidElement } from 'react';
import { ADMIN, VOLUNTEERS } from '../routes/paths';
import { ROUTES } from '../routes/routeTable';
import { PAGES } from '../routes/pages';
import { NAV_SECTIONS } from '../features/taskdashboard/components/navSections';
import VolunteerManagementPage from '../pages/VolunteerManagementPage';

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// The admin dashboard's links now live in its widget catalogue.
const admin = read('../features/dashboard/widgetCatalog.jsx');
const links = (role) => NAV_SECTIONS(role).flatMap((s) => s.items).map((i) => i.to);
const route = ROUTES.find((r) => r.path === ADMIN.volunteerLog);

describe('the admin volunteer log is its own screen', () => {
  it('has a path of its own, under /admin', () => {
    expect(ADMIN.volunteerLog).toBe('/admin/volunteer-log');
    expect(ADMIN.volunteerLog).not.toBe(VOLUNTEERS.events);
  });

  it('is routed to the guest log page, not the events screen', () => {
    expect(route).toBeTruthy();
    expect(isValidElement(PAGES[route.id])).toBe(true);
    expect(PAGES[route.id].type).toBe(VolunteerManagementPage);
  });

  it('sits behind the admin-only guard', () => {
    expect([...route.roles]).toEqual(['admin']);
  });

  it('is what the admin sidebar and dashboard link to', () => {
    expect(links('admin')).toContain(ADMIN.volunteerLog);
    expect(admin).toContain('ADMIN.volunteerLog');
  });

  it('leaves the manager pointed at the events screen', () => {
    expect(links('manager')).toContain(VOLUNTEERS.events);
    expect(links('manager')).not.toContain(ADMIN.volunteerLog);
    // And no admin surface does any more.
    expect(links('admin')).not.toContain(VOLUNTEERS.events);
    expect(admin).not.toContain('VOLUNTEERS');
  });
});
