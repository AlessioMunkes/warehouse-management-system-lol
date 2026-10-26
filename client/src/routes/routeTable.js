// ─────────────────────────────────────────────────────────────
// client/src/routes/routeTable.js
//
// Every screen the app serves, once: its path, who may open it, whether
// it sits inside the manager/admin shell, and where (if anywhere) it
// appears in each role's sidebar. App.jsx builds its <Routes> from this
// and navSections.js builds every sidebar from it, so a route cannot be
// guarded one way and listed in a menu another.
//
// Data only — no page components — so tests and the assistant's screen
// checks can read it without loading the app. App.jsx maps each `id`
// to its page (and a test fails if one is missing on either side).
//
//   id     — the key App.jsx's PAGES map uses
//   path   — from paths.js
//   roles  — a group from permissions.js; null for a public route
//   shell  — wrapped in the sidebar shell by ProtectedRoute. Floor
//            screens bring their own layout (StaffShell) and leave it off
//   nav    — [{ menu, group, label, icon, count? }] — one entry per
//            sidebar it appears in. `menu` is 'worker' | 'manager' |
//            'admin'; `count` reads the manager's attention counts
//            (features/dashboard/useAttention.js)
//
// ORDER MATTERS FOR THE MENUS: items appear in a sidebar group in the
// order their routes appear below. React Router matches by specificity,
// not order, so the order is free to serve the menus.
//
// Manager and admin are separate too: a manager's screens are
// MANAGER_ONLY and an admin's ADMIN_ONLY, and neither opens the other's.
// The two donation screens (the classification queue and Section 18A)
// are the exception, run by both.
//
// The floor is separate: its screens are WORKERS_ONLY, and no worker
// may open a manager or admin screen. A screen two sides both work on
// (Benevolent Requests, Feed the Soil) is two routes, one per side.
// ─────────────────────────────────────────────────────────────
// Phosphor, not lucide: the menu's icons are drawn duotone (fill when
// the item is open) by AppNav.jsx, a look the stock shadcn set has no
// weight for.
import {
  Archive, Bank, Basket, BowlFood, CalendarDots, ChartBar, ChatCircleText,
  ClipboardText, Flask, Gear, Gift, HandCoins, HandHeart, MapPin, MapTrifold, Package, PhoneCall, Plant,
  Pulse, Receipt, Scroll, ShoppingCart, SquaresFour, Storefront, Tray, TrayArrowDown,
  Truck, UsersThree, Warehouse,
} from '@phosphor-icons/react';
import { STAFF, ADMIN, VOLUNTEERS, PACKING, DONATIONS, LEGAL, NOTIFICATIONS } from './paths';
import {
  MANAGERS_UP, MANAGER_ONLY, ADMIN_ONLY, GUEST_ONLY, WORKERS_ONLY,
} from './permissions';

// Each sidebar's groups, top to bottom.
export const MENU_GROUPS = {
  worker:  ['Overview', 'Warehouse'],
  manager: ['Overview', 'Inbound', 'Donations', 'Stock', 'Outbound', 'Programmes', 'Insights'],
  admin:   ['Overview', 'Master data', 'Logs', 'Donations', 'Setup'],
};

const nav = (menu, group, label, icon, count) => ({ menu, group, label, icon, ...(count ? { count } : {}) });

export const ROUTES = [
  // ── Public ─────────────────────────────────────────────────
  { id: 'landing',        path: '/',                      roles: null },
  { id: 'login',          path: '/login',                 roles: null },
  { id: 'guestLogin',     path: '/guest',                 roles: null },
  { id: 'financePublic',  path: '/finance/report/:token', roles: null },
  { id: 'section18aForm', path: '/section-18a/:token',    roles: null },
  // Accepting an invite: the person has no account yet.
  { id: 'inviteAccept',   path: '/invite/:token',         roles: null },
  // Resetting a password: an account, but no session.
  { id: 'resetPassword',  path: '/reset-password/:token', roles: null },
  // The page behind each pallet's QR code (BR-22): only what is
  // already printed on the label.
  { id: 'slipPreview',    path: '/slip/:token',           roles: null },
  // What the system keeps and the terms of using it. Linked from the
  // landing page, the sign-in page and Google's consent screen.
  { id: 'privacy',        path: LEGAL.privacy,            roles: null },
  { id: 'terms',          path: LEGAL.terms,              roles: null },

  // ── Dashboards ─────────────────────────────────────────────
  { id: 'managerDashboard', path: '/manager', roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Overview', 'Dashboard', SquaresFour)] },
  { id: 'adminDashboard', path: ADMIN.dashboard, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Overview', 'Dashboard', SquaresFour)] },
  { id: 'staffHome', path: STAFF.home, roles: WORKERS_ONLY,
    nav: [nav('worker', 'Overview', 'Dashboard', SquaresFour)] },

  // ── Inbound ────────────────────────────────────────────────
  { id: 'purchaseOrders', path: STAFF.purchaseOrders, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Inbound', 'Purchase orders', ShoppingCart,
      (a) => a.purchaseOrders.awaitingApproval + a.purchaseOrders.followUp
        + (a.purchaseOrders.financeEmailFailed ?? 0) + (a.purchaseOrders.needsQuickbooksMatch ?? 0))] },
  { id: 'receipts', path: STAFF.receipts, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Inbound', 'Receipts', Receipt)] },

  // ── Stock ──────────────────────────────────────────────────
  { id: 'inventory', path: STAFF.inventory, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Stock', 'Inventory', Warehouse,
      (a) => a.inventory.shortfall + a.inventory.expiring)] },
  { id: 'stockLedger', path: STAFF.stockLedger, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Stock', 'Stock ledger', Scroll)] },

  // ── Outbound ───────────────────────────────────────────────
  // Unclaimed slips are the queue's normal state, so only pallets not
  // collected are counted.
  { id: 'pickingSlips', path: STAFF.pickingSlips, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Outbound', 'Picking slips', ClipboardText, (a) => a.pickingSlips.notCollected + (a.pickingSlips.neverPacked ?? 0))] },
  { id: 'beneficiaries', path: STAFF.beneficiaries, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Outbound', 'Beneficiaries', UsersThree)] },
  { id: 'collectionReminders', path: STAFF.collectionReminders, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Outbound', 'Collection reminders', ChatCircleText)] },
  { id: 'operatingCalendar', path: STAFF.operatingCalendar, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Outbound', 'Operating calendar', CalendarDots)] },

  // ── The warehouse floor (warehouse staff only) ──────────────
  { id: 'receiving', path: STAFF.receiving, roles: WORKERS_ONLY,
    nav: [nav('worker', 'Warehouse', 'Receiving', TrayArrowDown)] },
  { id: 'deliveries', path: STAFF.deliveries, roles: WORKERS_ONLY },
  { id: 'packing', path: PACKING.board, roles: WORKERS_ONLY,
    nav: [nav('worker', 'Warehouse', 'Packing', Package)] },
  { id: 'packingDetail', path: PACKING.detailPattern, roles: WORKERS_ONLY },
  { id: 'decanting', path: STAFF.decanting, roles: WORKERS_ONLY,
    nav: [nav('worker', 'Warehouse', 'Decanting', Flask)] },
  { id: 'decantingRecords', path: STAFF.decantingRecords, roles: WORKERS_ONLY },
  { id: 'dispatch', path: STAFF.dispatch, roles: WORKERS_ONLY,
    nav: [nav('worker', 'Warehouse', 'Dispatch', Truck)] },
  { id: 'dispatchHistory', path: STAFF.dispatchHistory, roles: WORKERS_ONLY },
  { id: 'donationIntake', path: STAFF.donation, roles: WORKERS_ONLY,
    nav: [nav('worker', 'Warehouse', 'Donation intake', HandCoins)] },
  { id: 'donationReview', path: DONATIONS.review, roles: WORKERS_ONLY },
  { id: 'donationHistory', path: DONATIONS.history, roles: WORKERS_ONLY },
  { id: 'floorRequests', path: STAFF.floorRequests, roles: WORKERS_ONLY,
    nav: [nav('worker', 'Warehouse', 'Benevolent requests', PhoneCall)] },
  { id: 'floorFeedTheSoil', path: STAFF.floorFeedTheSoil, roles: WORKERS_ONLY,
    nav: [nav('worker', 'Warehouse', 'Feed the Soil', Plant)] },

  // ── The manager's side of those two programmes ─────────────
  { id: 'communityRequests', path: STAFF.communityRequests, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Outbound', 'Benevolent requests', PhoneCall, (a) => (a.communityRequests.pending ?? 0) + (a.communityRequests.needsItems ?? 0) + (a.communityRequests.overdue ?? 0))] },
  { id: 'feedTheSoil', path: STAFF.feedTheSoil, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Programmes', 'Feed the Soil', Plant, (a) => a.feedTheSoil?.idleKits ?? 0)] },

  // ── Programmes ─────────────────────────────────────────────
  { id: 'volunteerEvents', path: VOLUNTEERS.events, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Programmes', 'Volunteer events', HandHeart)] },
  { id: 'volunteerEvent', path: VOLUNTEERS.eventPattern, roles: MANAGER_ONLY, shell: true },

  // ── Insights ───────────────────────────────────────────────
  { id: 'reporting', path: STAFF.reporting, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Insights', 'Operations reports', ChartBar)] },
  { id: 'impactReport', path: STAFF.impactReport, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Insights', 'Impact report', BowlFood)] },
  { id: 'impactMap', path: STAFF.impactMap, roles: MANAGER_ONLY, shell: true,
    nav: [nav('manager', 'Insights', 'Impact map', MapPin)] },

  // ── Admin ──────────────────────────────────────────────────
  { id: 'users', path: ADMIN.users, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Master data', 'Users', UsersThree)] },
  { id: 'products', path: ADMIN.products, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Master data', 'Products', Basket)] },
  { id: 'suppliers', path: ADMIN.suppliers, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Master data', 'Suppliers', Storefront)] },
  // Staff activity and the door sign-in log. Managers use Volunteer
  // Events instead.
  { id: 'activityLog', path: ADMIN.activityLog, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Logs', 'Activity log', Pulse)] },
  { id: 'archive', path: ADMIN.archive, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Logs', 'Archive', Archive)] },
  { id: 'messageHistory', path: ADMIN.messageHistory, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Logs', 'Message history', Tray)] },
  // Reached from the bell, so no nav entry.
  { id: 'notifications', path: NOTIFICATIONS.manager, roles: MANAGER_ONLY, shell: true },
  { id: 'adminNotifications', path: NOTIFICATIONS.admin, roles: ADMIN_ONLY, shell: true },
  { id: 'floorNotifications', path: NOTIFICATIONS.floor, roles: WORKERS_ONLY },
  // The queue is run by managers and admins together, so it is in both menus.
  { id: 'donationManagement', path: ADMIN.donationManagement, roles: MANAGERS_UP, shell: true,
    nav: [
      nav('admin', 'Donations', 'Classification queue', Gift),
      nav('manager', 'Donations', 'Classification queue', Gift),
    ] },
  { id: 'section18a', path: ADMIN.section18aManagement, roles: MANAGERS_UP, shell: true,
    nav: [
      nav('admin', 'Donations', 'Section 18A', Scroll),
      nav('manager', 'Donations', 'Section 18A', Scroll),
    ] },
  // Settings' Email section, at the address Google's sign-in returns to
  // and older links use. Listed in the menu as Settings.
  { id: 'emailIntegration', path: ADMIN.emailIntegration, roles: ADMIN_ONLY, shell: true },
  // The warehouse movement report finance works from. It was routed
  // but in no menu; listed beside the dashboard.
  { id: 'financeReport', path: ADMIN.financeReport, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Overview', 'Finance report', Bank)] },

  { id: 'warehouseLayout', path: ADMIN.warehouseLayout, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Setup', 'Warehouse layout', MapTrifold)] },
  { id: 'settings', path: ADMIN.settings, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Setup', 'Settings', Gear)] },

  // ── Guests (Love Activist volunteers) ──────────────────────
  { id: 'guestHome', path: '/guest-home', roles: GUEST_ONLY },
  { id: 'guestPack', path: '/guest/pack', roles: GUEST_ONLY },
  { id: 'guestDone', path: '/guest/done', roles: GUEST_ONLY },
];

// Old URLs that still get linked to.
export const REDIRECTS = [
  { from: '/inventory', to: STAFF.inventory },
  { from: '/decanting', to: STAFF.decanting },
  { from: '/programmes/noc/packing', to: PACKING.board },
  { from: '/programmes/noc/packing/:slipId', to: PACKING.board },
  { from: ADMIN.legacyActivity, to: `${ADMIN.activityLog}?view=staff` },
  { from: ADMIN.legacyVolunteerLog, to: ADMIN.activityLogVolunteers },
];

export const routeById = (id) => ROUTES.find((r) => r.id === id);

// The roles that may open a path, or null for a public one / undefined
// for a path the app does not serve.
export const rolesForPath = (path) => {
  const route = ROUTES.find((r) => r.path === path);
  return route ? route.roles : undefined;
};
