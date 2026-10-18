// ─────────────────────────────────────────────────────────────
// client/src/tests/AdminVolunteerLog.test.jsx
//
// The admin and the manager must not land on the same volunteer
// screen. They did: every admin entry point pointed at
// VOLUNTEERS.events — the coordinator's event workflow — while the
// guest log sat unrouted with its import commented out in App.jsx.
//
// The guest log is now the Volunteers view of the admin Activity log.
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
import { ROUTES, REDIRECTS } from '../routes/routeTable';
import { PAGES, PAGE_LOADERS } from '../routes/pages';
import { NAV_SECTIONS } from '../components/layout/navSections';
import AdminActivityLogPage from '../pages/AdminActivityLogPage';

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// The admin dashboard's links now live in its widget catalogue.
const admin = read('../features/dashboard/widgetCatalog.jsx');
const labels = (role) => NAV_SECTIONS(role).flatMap((s) => s.items).map((i) => i.label);
const links = (role) => NAV_SECTIONS(role).flatMap((s) => s.items).map((i) => i.to);
const route = ROUTES.find((r) => r.path === ADMIN.activityLog);

describe('the admin Activity log is its own screen', () => {
  it('has a path of its own, under /admin', () => {
    expect(ADMIN.activityLog).toBe('/admin/activity-log');
    expect(ADMIN.activityLog).not.toBe(VOLUNTEERS.events);
  });

  it('is routed to the Activity log page, not the events screen', async () => {
    expect(route).toBeTruthy();
    expect(isValidElement(PAGES[route.id])).toBe(true);
    // The screen is loaded when first opened; this is the file it loads.
    expect((await PAGE_LOADERS[route.id]()).default).toBe(AdminActivityLogPage);
  });

  it('sits behind the admin-only guard', () => {
    expect([...route.roles]).toEqual(['admin']);
  });

  it('has one sidebar entry, and the two old ones are gone', () => {
    expect(links('admin').filter((to) => to === ADMIN.activityLog)).toHaveLength(1);
    expect(labels('admin')).toContain('Activity log');
    expect(labels('admin')).not.toContain('User activity');
    expect(labels('admin')).not.toContain('Volunteer log');
    expect(ROUTES.find((r) => r.path === ADMIN.legacyActivity)).toBeUndefined();
    expect(ROUTES.find((r) => r.path === ADMIN.legacyVolunteerLog)).toBeUndefined();
  });

  it('is what the admin dashboard links to, volunteers included', () => {
    expect(admin).toContain('ADMIN.activityLog');
    expect(admin).toContain('ADMIN.activityLogVolunteers');
    expect(ADMIN.activityLogVolunteers).toBe('/admin/activity-log?view=volunteers');
  });

  it('sends the old URLs to the matching view', () => {
    const to = (from) => REDIRECTS.find((r) => r.from === from)?.to;
    expect(to('/admin/activity')).toBe('/admin/activity-log?view=staff');
    expect(to('/admin/volunteer-log')).toBe('/admin/activity-log?view=volunteers');
  });

  it('leaves the manager pointed at the events screen', () => {
    expect(links('manager')).toContain(VOLUNTEERS.events);
    expect(links('manager')).not.toContain(ADMIN.activityLog);
    // And no admin surface does any more.
    expect(links('admin')).not.toContain(VOLUNTEERS.events);
    expect(admin).not.toContain('VOLUNTEERS');
  });
});
