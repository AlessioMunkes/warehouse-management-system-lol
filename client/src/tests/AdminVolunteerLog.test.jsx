// ─────────────────────────────────────────────────────────────
// client/src/tests/AdminVolunteerLog.test.jsx
//
// The admin and the manager must not land on the same volunteer
// screen. They did: every admin entry point pointed at
// VOLUNTEERS.events — the coordinator's event workflow — while
// VolunteerManagementPage, the guest log, sat unrouted with its import
// commented out in App.jsx.
//
// This test is a source scan rather than a render, deliberately. What
// broke was wiring, not behaviour: an import, a route, and two links.
// A render test would have passed throughout, because the page it
// would have rendered was never the page an admin actually reached.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ADMIN, VOLUNTEERS } from '../routes/paths';

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const app   = read('../App.jsx');
const nav   = read('../features/taskdashboard/components/navSections.js');
const admin = read('../pages/AdminActivityScreen.jsx');

describe('the admin volunteer log is its own screen', () => {
  it('has a path of its own, under /admin', () => {
    expect(ADMIN.volunteerLog).toBe('/admin/volunteer-log');
    expect(ADMIN.volunteerLog).not.toBe(VOLUNTEERS.events);
  });

  it('imports the page rather than leaving it commented out', () => {
    expect(app).toMatch(/^import VolunteerManagementPage\s+from '\.\/pages\/VolunteerManagementPage';$/m);
    expect(app).not.toMatch(/^\s*\/\/\s*import VolunteerManagementPage/m);
  });

  it('routes it, and inside the admin-only guard', () => {
    expect(app).toContain('<Route path={ADMIN.volunteerLog} element={<VolunteerManagementPage />} />');

    // Walk the route table and find which <ProtectedRoute> group the
    // log sits in — the same trick AssistantScreenRoles.test.js uses.
    let group = null;
    let found = null;
    for (const line of app.split('\n')) {
      const opener = line.match(/<Route element=\{<ProtectedRoute([^>]*)\/>\}>/);
      if (opener) { group = opener[1]; continue; }
      if (/^\s*<\/Route>\s*$/.test(line)) { group = null; continue; }
      if (line.includes('ADMIN.volunteerLog')) found = group;
    }
    expect(found, 'the volunteer log route is not inside a ProtectedRoute group').toBeTruthy();
    expect(found).toMatch(/roles=\{\['admin'\]\}/);
  });

  it('is what the admin sidebar and dashboard link to', () => {
    expect(nav).toContain('ADMIN.volunteerLog');
    expect(admin).toContain('ADMIN.volunteerLog');
  });

  it('leaves the manager pointed at the events screen', () => {
    // The nav still links VOLUNTEERS.events — from MANAGER_SECTIONS.
    expect(nav).toContain('VOLUNTEERS.events');
    expect(nav).toContain("label: 'Volunteer Events'");
    // And no admin surface does any more.
    expect(admin).not.toContain('VOLUNTEERS');
  });
});
