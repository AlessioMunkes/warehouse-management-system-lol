// ─────────────────────────────────────────────────────────────
// src/tests/AppRoutes.test.jsx
//
// The route table (routes/routeTable.js) is the one place a screen's
// path, guard and menu entry are written. These pin that it is whole
// and consistent:
//   - every route has a page (routes/pages.jsx) and every page a route
//   - no path is served twice
//   - every menu item opens a screen that role is allowed into
//   - each role's sidebar is exactly what it was when the menus were
//     hand-written lists (navSections.js before the table)
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { ROUTES, REDIRECTS } from '../routes/routeTable';
import { PAGES } from '../routes/pages';
import { NAV_SECTIONS } from '../components/layout/navSections';
import { ALL_STAFF, MANAGERS_UP, MANAGER_ONLY, ADMIN_ONLY, GUEST_ONLY, WORKERS_ONLY } from '../routes/permissions';

const ROLE_OF_MENU = { worker: 'warehouse_worker', manager: 'manager', admin: 'admin' };

describe('route table', () => {
  it('has a page for every route, and a route for every page', () => {
    expect(Object.keys(PAGES).sort()).toEqual(ROUTES.map((r) => r.id).sort());
  });

  it('serves each path once', () => {
    const paths = [...ROUTES.map((r) => r.path), ...REDIRECTS.map((r) => r.from)];
    expect(paths.length).toBe(new Set(paths).size);
  });

  it('guards every non-public route with a named group', () => {
    const groups = [ALL_STAFF, MANAGERS_UP, MANAGER_ONLY, ADMIN_ONLY, GUEST_ONLY, WORKERS_ONLY];
    for (const r of ROUTES.filter((x) => x.roles)) {
      expect(groups, `${r.id} uses a role list that is not in permissions.js`).toContain(r.roles);
    }
  });

  // Each role sees only its own screens: nothing a warehouse worker can
  // open is open to a manager or admin, and the reverse.
  it('never shares a screen between the floor and the office', () => {
    for (const r of ROUTES.filter((x) => x.roles)) {
      const worker = r.roles.includes('warehouse_worker');
      const office = r.roles.includes('manager') || r.roles.includes('admin');
      expect(worker && office, `${r.id} is open to the floor and the office alike`).toBe(false);
    }
  });

  it('lists a screen in a menu only for a role allowed to open it', () => {
    for (const r of ROUTES) {
      for (const n of r.nav ?? []) {
        expect(r.roles, `${r.id} is in the ${n.menu} menu but is public`).toBeTruthy();
        expect(r.roles, `${r.id} is in the ${n.menu} menu but ${ROLE_OF_MENU[n.menu]} cannot open it`)
          .toContain(ROLE_OF_MENU[n.menu]);
      }
    }
  });
});

const menu = (role) => NAV_SECTIONS(role).map((s) => [s.label, s.items.map((i) => `${i.label} ${i.to}`)]);

describe('sidebars built from the table', () => {
  it('worker', () => {
    expect(menu('warehouse_worker')).toEqual([
      ['Overview', ['Dashboard /noc']],
      ['Warehouse', [
        'Receiving /noc/procurement',
        'Packing /noc/packing',
        'Decanting /noc/decanting',
        'Dispatch /staff/dispatch',
        'Donation intake /donations/new',
        'Benevolent requests /staff/community-requests',
        'Feed the Soil /staff/feed-the-soil',
      ]],
    ]);
  });

  it('manager', () => {
    expect(menu('manager')).toEqual([
      ['Overview', ['Dashboard /manager']],
      ['Inbound', ['Purchase orders /noc/purchase-orders', 'Receipts /noc/receipts']],
      ['Donations', ['Classification queue /admin/donation-management', 'Section 18A /admin/section-18a']],
      ['Stock', ['Inventory /noc/inventory', 'Stock ledger /noc/stock-ledger']],
      ['Outbound', [
        'Picking slips /noc/picking-slips',
        'Beneficiaries /noc/beneficiaries',
        'Collection reminders /noc/collection-reminders',
        'Operating calendar /noc/operating-calendar',
        'Benevolent requests /noc/community-requests',
      ]],
      ['Programmes', ['Feed the Soil /noc/feed-the-soil', 'Volunteer events /volunteers']],
      ['Insights', ['Operations reports /noc/reporting', 'Impact report /noc/impact-report']],
    ]);
  });

  it('admin', () => {
    expect(menu('admin')).toEqual([
      ['Overview', ['Dashboard /admin', 'Finance report /admin/finance-report']],
      ['Master data', [
        'Users /admin/users',
        'Products /admin/products',
        'Suppliers /admin/suppliers',
      ]],
      ['Logs', [
        'Activity log /admin/activity-log', 'Archive /admin/archive',
        'Message history /admin/messages',
      ]],
      ['Donations', [
        'Classification queue /admin/donation-management',
        'Section 18A /admin/section-18a',
      ]],
      // The Gmail screen is Settings' Email section now.
      ['Setup', ['Settings /admin/settings']],
    ]);
  });

  it('opens Section 18A to managers and admins, in both menus, and never to the floor', () => {
    const route = ROUTES.find((r) => r.id === 'section18a');
    expect([...route.roles].sort()).toEqual(['admin', 'manager']);
    expect(menu('manager').find(([group]) => group === 'Donations')[1]).toContain('Section 18A /admin/section-18a');
    expect(menu('admin').find(([group]) => group === 'Donations')[1]).toContain('Section 18A /admin/section-18a');
    expect(menu('warehouse_worker').some(([group]) => group === 'Donations')).toBe(false);
    expect(route.roles).not.toContain('warehouse_worker');
  });

  it('opens the classification queue to managers and admins, in both menus', () => {
    const route = ROUTES.find((r) => r.id === 'donationManagement');
    expect([...route.roles].sort()).toEqual(['admin', 'manager']);
    expect(menu('manager').find(([group]) => group === 'Donations')[1][0]).toBe('Classification queue /admin/donation-management');
    expect(menu('admin').find(([group]) => group === 'Donations')[1]).toContain('Classification queue /admin/donation-management');
  });

  it('keeps the attention counts on the manager items that had them', () => {
    const counted = NAV_SECTIONS('manager').flatMap((s) => s.items).filter((i) => i.count).map((i) => i.label);
    expect(counted).toEqual(['Purchase orders', 'Inventory', 'Picking slips', 'Benevolent requests']);
  });
});
