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
import { NAV_SECTIONS } from '../features/taskdashboard/components/navSections';
import { ALL_STAFF, MANAGERS_UP, ADMIN_ONLY, GUEST_ONLY, DONATION_INTAKE } from '../routes/permissions';

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
    const groups = [ALL_STAFF, MANAGERS_UP, ADMIN_ONLY, GUEST_ONLY, DONATION_INTAKE];
    for (const r of ROUTES.filter((x) => x.roles)) {
      expect(groups, `${r.id} uses a role list that is not in permissions.js`).toContain(r.roles);
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
        'Donation Intake /donations/new',
        'Benevolent Requests /noc/community-requests',
        'Feed the Soil /noc/feed-the-soil',
      ]],
    ]);
  });

  it('manager', () => {
    expect(menu('manager')).toEqual([
      ['Overview', ['Dashboard /manager']],
      ['Inbound', ['Purchase Orders /noc/purchase-orders', 'Receipts /noc/receipts']],
      ['Stock', ['Inventory /noc/inventory', 'Stock Ledger /noc/stock-ledger']],
      ['Outbound', [
        'Picking Slips /noc/picking-slips',
        'Beneficiaries /noc/beneficiaries',
        'Collection Reminders /noc/collection-reminders',
        'Benevolent Requests /noc/community-requests',
      ]],
      ['Programmes', ['Feed the Soil /noc/feed-the-soil', 'Volunteer Events /volunteers']],
      ['Insights', ['Operations Reports /noc/reporting', 'Impact Reports /noc/impact-report']],
    ]);
  });

  it('admin', () => {
    expect(menu('admin')).toEqual([
      ['Overview', ['Dashboard /admin']],
      ['Master data', [
        'User Management /admin/users',
        'Product Management /admin/products',
        'Supplier Management /admin/suppliers',
      ]],
      ['Logs', [
        'User Activity /admin/activity', 'Volunteer Log /admin/volunteer-log', 'Archive /admin/archive',
        'Message History /admin/messages',
      ]],
      ['Donations', [
        'Classification Queue /admin/donation-management',
        'Section 18A Management /admin/section-18a',
      ]],
      // The Gmail screen is Settings' Email section now.
      ['Setup', ['Settings /admin/settings']],
    ]);
  });

  it('keeps the attention counts on the manager items that had them', () => {
    const counted = NAV_SECTIONS('manager').flatMap((s) => s.items).filter((i) => i.count).map((i) => i.label);
    expect(counted).toEqual(['Purchase Orders', 'Inventory', 'Picking Slips', 'Benevolent Requests']);
  });
});
