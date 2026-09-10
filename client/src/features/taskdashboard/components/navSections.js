// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/navSections.js
//
// What each role can navigate to. Data only — no components — so that
// AppNav.jsx and ManagerLayout.jsx can both import it without tripping
// react-refresh/only-export-components.
//
// THREE SETS, NOT ONE WITH BITS ADDED
// The admin list used to be the manager list plus an Admin section,
// which said admin is a manager with extra powers. users.role does not
// work that way here: an admin looks after accounts, suppliers, the
// product catalog and how donations are routed, while beneficiaries,
// picking slips, purchase orders and reporting are the manager's daily
// work. Showing an admin all of it buried the four screens only they
// can open.
//
// The manager routes stay reachable by URL for an admin — App.jsx gates
// them to ['manager','admin'] because the server does the same — this
// is about what the app steers each role toward, not a second gate.
// ─────────────────────────────────────────────────────────────
import {
  LayoutDashboard, Users2, ClipboardList, ShoppingCart,
  BarChart3, HeartHandshake, Package, Truck, FileText,
  Gift, Route, Tags, HandHeart, Boxes, ReceiptText,
  PackageOpen, PackageCheck, FlaskConical, ClipboardCheck, HandCoins,
  PhoneCall,
  ScrollText,
} from 'lucide-react';
import { STAFF, ADMIN, VOLUNTEERS, PACKING } from '../../../routes/paths';

// A warehouse worker's routes are a different set, not a subset: they
// cannot open Beneficiaries, Purchase Orders, Reporting or any of the
// admin screens, and they are the only role that lives in the four
// floor flows.
const WORKER_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: STAFF.home, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Warehouse',
    items: [
      { to: STAFF.receiving, label: 'Receiving', icon: PackageOpen },
      { to: PACKING.board, label: 'Packing', icon: PackageCheck },
      { to: STAFF.decanting, label: 'Decanting', icon: FlaskConical },
      { to: STAFF.dispatch, label: 'Dispatch', icon: ClipboardCheck },
      { to: STAFF.donation, label: 'Donation Intake', icon: HandCoins },
      { to: STAFF.communityRequests, label: 'Benevolent Requests', icon: PhoneCall },
    ],
  },
];

// Accounts, master data, and where donations end up. Every one of these
// is either admin-only in App.jsx or master data an admin owns.
const ADMIN_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: ADMIN.dashboard, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'People',
    items: [
      { to: ADMIN.users, label: 'Users', icon: Users2 },
      { to: VOLUNTEERS.events, label: 'Volunteer Events', icon: HandHeart },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: STAFF.communityRequests, label: 'Benevolent Requests', icon: PhoneCall },
    ],
  },
  {
    label: 'Master data',
    items: [
      { to: ADMIN.products, label: 'Products', icon: Package },
      { to: ADMIN.suppliers, label: 'Suppliers', icon: Truck },
    ],
  },
  {
    label: 'Donations',
    items: [
      { to: ADMIN.donationManagement, label: 'Donation Management', icon: Gift },
      { to: ADMIN.donationClassification, label: 'Donation Classification', icon: Tags },
      { to: ADMIN.categoryRouting, label: 'Category Routing', icon: Route },
      { to: ADMIN.evaluateRouting, label: 'Explain Routing', icon: Route },
    ],
  },
];

const MANAGER_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/manager', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: STAFF.beneficiaries, label: 'Beneficiaries', icon: Users2 },
      { to: STAFF.pickingSlips, label: 'Picking Slips', icon: ClipboardList },
      { to: STAFF.purchaseOrders, label: 'Purchase Orders', icon: ShoppingCart },
      { to: '/noc/inventory', label: 'Inventory', icon: Boxes },
      { to: STAFF.receipts, label: 'Receipts', icon: ReceiptText },
      { to: STAFF.documents, label: 'Documents', icon: FileText },
      { to: STAFF.communityRequests, label: 'Benevolent Requests', icon: PhoneCall },
    ],
  },
  // Receiving, Packing, Decanting and Dispatch are reached through the
  // staff shell rather than from here, so they are deliberately absent.
  {
    label: 'Warehouse',
    items: [
      { to: STAFF.donation, label: 'Donation Intake', icon: HandCoins },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: ADMIN.products, label: 'Products', icon: Package },
    ],
  },
  {
    label: 'Volunteers',
    items: [
      { to: VOLUNTEERS.events, label: 'Volunteer Events', icon: HandHeart },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: STAFF.stockLedger, label: 'Stock Ledger', icon: ScrollText },
      { to: STAFF.reporting, label: 'Reporting', icon: BarChart3 },
      { to: STAFF.impactReport, label: 'Impact Report', icon: HeartHandshake },
    ],
  },
];

export const NAV_SECTIONS = (role) =>
  role === 'warehouse_worker' ? WORKER_SECTIONS
  : role === 'admin'         ? ADMIN_SECTIONS
  : MANAGER_SECTIONS;

// Where the brand link goes, per role. Hard-coding /manager sent a
// warehouse worker to a route ProtectedRoute bounces.
export const homeForRole = (role) =>
  role === 'warehouse_worker' ? STAFF.home
  : role === 'admin' ? ADMIN.dashboard
  : '/manager';
