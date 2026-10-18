// ─────────────────────────────────────────────────────────────
// client/src/components/layout/navSections.js
//
// The sidebar menu for each role (used by ManagerLayout and AppNav),
// built from routes/routeTable.js — each route says which menus list
// it, under which group, with which label and icon. The menu cannot
// offer a screen the route guard would refuse, because both read the
// same entry.
//
// Workers get the floor tasks; managers run the day-to-day; admins
// look after accounts, master data, the logs and donations.
//
// The two never open each other's screens (routeTable.js), apart from
// the two donation screens both run.
// ─────────────────────────────────────────────────────────────
import { ROUTES, MENU_GROUPS } from '../../routes/routeTable';
import { STAFF, ADMIN } from '../../routes/paths';

const menuFor = (role) =>
  role === 'warehouse_worker' ? 'worker'
  : role === 'admin'         ? 'admin'
  : 'manager';

// [{ label, items: [{ to, label, icon, count? }] }], groups in
// MENU_GROUPS order, items in route-table order. Built once per menu.
const build = (menu) => MENU_GROUPS[menu]
  .map((group) => ({
    label: group,
    items: ROUTES.flatMap((route) => (route.nav ?? [])
      .filter((n) => n.menu === menu && n.group === group)
      .map(({ label, icon, count }) => ({ to: route.path, label, icon, ...(count ? { count } : {}) }))),
  }))
  .filter((section) => section.items.length > 0);

const SECTIONS = {
  worker:  build('worker'),
  manager: build('manager'),
  admin:   build('admin'),
};

export const NAV_SECTIONS = (role) => SECTIONS[menuFor(role)];

// Each role's home screen (where the logo links to).
export const homeForRole = (role) =>
  role === 'warehouse_worker' ? STAFF.home
  : role === 'admin' ? ADMIN.dashboard
  : '/manager';
