// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/navSections.js
//
// The sidebar menu for each role (used by ManagerLayout and AppNav).
//
// Each role gets its own list. Admins look after accounts, products,
// suppliers, donations and the logs; managers run the day-to-day
// (beneficiaries, picking slips, orders, reports); workers get the floor
// tasks. Admins can still open manager screens by URL; this only
// decides what the menu shows, not what's allowed.
// ─────────────────────────────────────────────────────────────
import {
  LayoutDashboard, Users2, ClipboardList, ShoppingCart,
  BarChart3, HeartHandshake, Package, Truck, /* FileText, */
  Gift, HandHeart, Boxes, ReceiptText, Activity, Archive,
  PackageOpen, PackageCheck, FlaskConical, ClipboardCheck, HandCoins,
  PhoneCall,
  ScrollText,
  Mail,
  Sprout,
  MessageCircle,
} from 'lucide-react';
import { STAFF, ADMIN, VOLUNTEERS, PACKING } from '../../../routes/paths';

// Warehouse workers: the floor tasks only.
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
      { to: STAFF.feedTheSoil, label: 'Feed the Soil', icon: Sprout },
    ],
  },
];

// Admins: accounts, master data, logs and donations.
const ADMIN_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: ADMIN.dashboard, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Master data',
    items: [
      { to: ADMIN.users,     label: 'User Management',     icon: Users2 },
      { to: ADMIN.products,  label: 'Product Management',  icon: Package },
      { to: ADMIN.suppliers, label: 'Supplier Management', icon: Truck },
    ],
  },
  // Records of what happened: user activity, the door log and the archive.
  {
    label: 'Logs',
    items: [
      { to: ADMIN.activity, label: 'User Activity', icon: Activity },
      { to: ADMIN.volunteerLog, label: 'Volunteer Log', icon: HandHeart },
      { to: ADMIN.archive, label: 'Archive', icon: Archive },
    ],
  },
  {
    label: 'Donations',
    items: [
      { to: ADMIN.donationManagement, label: 'Classification Queue', icon: Gift },
      { to: ADMIN.section18aManagement, label: 'Section 18A Management', icon: ScrollText },
      { to: ADMIN.emailIntegration, label: 'Email Integration', icon: Mail },
    ],
  },
];

// Grouped by the way stock moves through the building: what comes in,
// what is held, what goes out, the programmes beside the main flow,
// and the reports on all of it.
//
// `count` reads the manager's attention counts (useAttention) and puts
// a number beside the item when something there needs dealing with.
// Only problems are counted — a slip nobody has claimed yet this week
// is the normal state of the queue, so it is on the dashboard's list
// but not here.
const MANAGER_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/manager', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Inbound',
    items: [
      { to: STAFF.purchaseOrders, label: 'Purchase Orders', icon: ShoppingCart,
        count: (a) => a.purchaseOrders.awaitingApproval + a.purchaseOrders.followUp },
      { to: STAFF.receipts, label: 'Receipts', icon: ReceiptText },
    ],
  },
  {
    label: 'Stock',
    items: [
      { to: '/noc/inventory', label: 'Inventory', icon: Boxes,
        count: (a) => a.inventory.shortfall + a.inventory.expiring },
      { to: STAFF.stockLedger, label: 'Stock Ledger', icon: ScrollText },
    ],
  },
  {
    label: 'Outbound',
    items: [
      { to: STAFF.pickingSlips, label: 'Picking Slips', icon: ClipboardList,
        count: (a) => a.pickingSlips.notCollected },
      { to: STAFF.beneficiaries, label: 'Beneficiaries', icon: Users2 },
      { to: STAFF.collectionReminders, label: 'Collection Reminders', icon: MessageCircle },
      { to: STAFF.communityRequests, label: 'Benevolent Requests', icon: PhoneCall,
        count: (a) => a.communityRequests.pending },
    ],
  },
  // The floor flows (receiving, packing, decanting, dispatch) and
  // donation intake aren't in the manager's menu.
  {
    label: 'Programmes',
    items: [
      { to: STAFF.feedTheSoil, label: 'Feed the Soil', icon: Sprout },
      { to: VOLUNTEERS.events, label: 'Volunteer Events', icon: HandHeart },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: STAFF.reporting, label: 'Operations Reports', icon: BarChart3 },
      { to: STAFF.impactReport, label: 'Impact Reports', icon: HeartHandshake },
    ],
  },
];

export const NAV_SECTIONS = (role) =>
  role === 'warehouse_worker' ? WORKER_SECTIONS
  : role === 'admin'         ? ADMIN_SECTIONS
  : MANAGER_SECTIONS;

// Each role's home screen (where the logo links to).
export const homeForRole = (role) =>
  role === 'warehouse_worker' ? STAFF.home
  : role === 'admin' ? ADMIN.dashboard
  : '/manager';
