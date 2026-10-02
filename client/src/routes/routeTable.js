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
// Admins can open the manager screens (MANAGERS_UP includes admin) but
// their sidebar does not list them — a decision for the team; see the
// note in navSections.js.
// ─────────────────────────────────────────────────────────────
import {
  LayoutDashboard, Users2, ClipboardList, ShoppingCart, BarChart3, HeartHandshake,
  Package, Truck, Gift, HandHeart, Boxes, ReceiptText, Activity, Archive,
  PackageOpen, PackageCheck, FlaskConical, ClipboardCheck, HandCoins, PhoneCall,
  ScrollText, Mail, Sprout, MessageCircle,
} from 'lucide-react';
import { STAFF, ADMIN, VOLUNTEERS, PACKING, DONATIONS } from './paths';
import {
  ALL_STAFF, MANAGERS_UP, ADMIN_ONLY, GUEST_ONLY, DONATION_INTAKE,
} from './permissions';

// Each sidebar's groups, top to bottom.
export const MENU_GROUPS = {
  worker:  ['Overview', 'Warehouse'],
  manager: ['Overview', 'Inbound', 'Stock', 'Outbound', 'Programmes', 'Insights'],
  admin:   ['Overview', 'Master data', 'Logs', 'Donations'],
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

  // ── Dashboards ─────────────────────────────────────────────
  { id: 'managerDashboard', path: '/manager', roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Overview', 'Dashboard', LayoutDashboard)] },
  { id: 'adminDashboard', path: ADMIN.dashboard, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Overview', 'Dashboard', LayoutDashboard)] },
  { id: 'staffHome', path: STAFF.home, roles: ALL_STAFF,
    nav: [nav('worker', 'Overview', 'Dashboard', LayoutDashboard)] },

  // ── Inbound ────────────────────────────────────────────────
  { id: 'purchaseOrders', path: STAFF.purchaseOrders, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Inbound', 'Purchase Orders', ShoppingCart,
      (a) => a.purchaseOrders.awaitingApproval + a.purchaseOrders.followUp)] },
  { id: 'receipts', path: STAFF.receipts, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Inbound', 'Receipts', ReceiptText)] },

  // ── Stock ──────────────────────────────────────────────────
  { id: 'inventory', path: STAFF.inventory, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Stock', 'Inventory', Boxes,
      (a) => a.inventory.shortfall + a.inventory.expiring)] },
  { id: 'stockLedger', path: STAFF.stockLedger, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Stock', 'Stock Ledger', ScrollText)] },

  // ── Outbound ───────────────────────────────────────────────
  // Unclaimed slips are the queue's normal state, so only pallets not
  // collected are counted.
  { id: 'pickingSlips', path: STAFF.pickingSlips, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Outbound', 'Picking Slips', ClipboardList, (a) => a.pickingSlips.notCollected)] },
  { id: 'beneficiaries', path: STAFF.beneficiaries, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Outbound', 'Beneficiaries', Users2)] },
  { id: 'collectionReminders', path: STAFF.collectionReminders, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Outbound', 'Collection Reminders', MessageCircle)] },

  // ── The warehouse floor ────────────────────────────────────
  // One URL per task: each page shows the manager view or the staff
  // flow depending on the role. Guests are not allowed here.
  { id: 'receiving', path: STAFF.receiving, roles: ALL_STAFF,
    nav: [nav('worker', 'Warehouse', 'Receiving', PackageOpen)] },
  { id: 'deliveries', path: STAFF.deliveries, roles: ALL_STAFF },
  { id: 'packing', path: PACKING.board, roles: ALL_STAFF,
    nav: [nav('worker', 'Warehouse', 'Packing', PackageCheck)] },
  { id: 'packingDetail', path: PACKING.detailPattern, roles: ALL_STAFF },
  { id: 'decanting', path: STAFF.decanting, roles: ALL_STAFF,
    nav: [nav('worker', 'Warehouse', 'Decanting', FlaskConical)] },
  { id: 'decantingRecords', path: STAFF.decantingRecords, roles: ALL_STAFF },
  { id: 'dispatch', path: STAFF.dispatch, roles: ALL_STAFF,
    nav: [nav('worker', 'Warehouse', 'Dispatch', ClipboardCheck)] },
  { id: 'dispatchHistory', path: STAFF.dispatchHistory, roles: ALL_STAFF },
  // Donation intake: floor work, so not in the manager's menu.
  { id: 'donationIntake', path: STAFF.donation, roles: DONATION_INTAKE,
    nav: [nav('worker', 'Warehouse', 'Donation Intake', HandCoins)] },
  { id: 'donationReview', path: DONATIONS.review, roles: DONATION_INTAKE },

  // ── Open to all staff, each page choosing its layout by role ─
  { id: 'communityRequests', path: STAFF.communityRequests, roles: ALL_STAFF,
    nav: [
      nav('worker', 'Warehouse', 'Benevolent Requests', PhoneCall),
      nav('manager', 'Outbound', 'Benevolent Requests', PhoneCall, (a) => a.communityRequests.pending),
    ] },
  { id: 'feedTheSoil', path: STAFF.feedTheSoil, roles: ALL_STAFF,
    nav: [
      nav('worker', 'Warehouse', 'Feed the Soil', Sprout),
      nav('manager', 'Programmes', 'Feed the Soil', Sprout),
    ] },

  // ── Programmes ─────────────────────────────────────────────
  { id: 'volunteerEvents', path: VOLUNTEERS.events, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Programmes', 'Volunteer Events', HandHeart)] },
  { id: 'volunteerEvent', path: VOLUNTEERS.eventPattern, roles: MANAGERS_UP, shell: true },

  // ── Insights ───────────────────────────────────────────────
  { id: 'reporting', path: STAFF.reporting, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Insights', 'Operations Reports', BarChart3)] },
  { id: 'impactReport', path: STAFF.impactReport, roles: MANAGERS_UP, shell: true,
    nav: [nav('manager', 'Insights', 'Impact Reports', HeartHandshake)] },

  // ── Admin ──────────────────────────────────────────────────
  { id: 'users', path: ADMIN.users, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Master data', 'User Management', Users2)] },
  { id: 'products', path: ADMIN.products, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Master data', 'Product Management', Package)] },
  { id: 'suppliers', path: ADMIN.suppliers, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Master data', 'Supplier Management', Truck)] },
  { id: 'activity', path: ADMIN.activity, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Logs', 'User Activity', Activity)] },
  // The door sign-in log. Managers use Volunteer Events instead.
  { id: 'volunteerLog', path: ADMIN.volunteerLog, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Logs', 'Volunteer Log', HandHeart)] },
  { id: 'archive', path: ADMIN.archive, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Logs', 'Archive', Archive)] },
  { id: 'donationManagement', path: ADMIN.donationManagement, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Donations', 'Classification Queue', Gift)] },
  { id: 'section18a', path: ADMIN.section18aManagement, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Donations', 'Section 18A Management', ScrollText)] },
  // The Gmail account donation emails are sent from.
  { id: 'emailIntegration', path: ADMIN.emailIntegration, roles: ADMIN_ONLY, shell: true,
    nav: [nav('admin', 'Donations', 'Email Integration', Mail)] },
  // Routed, not in the menu — reached from the admin dashboard.
  { id: 'financeReport', path: ADMIN.financeReport, roles: ADMIN_ONLY, shell: true },

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
];

export const routeById = (id) => ROUTES.find((r) => r.id === id);

// The roles that may open a path, or null for a public one / undefined
// for a path the app does not serve.
export const rolesForPath = (path) => {
  const route = ROUTES.find((r) => r.path === path);
  return route ? route.roles : undefined;
};
