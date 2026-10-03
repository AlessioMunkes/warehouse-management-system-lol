// ─────────────────────────────────────────────────────────────
// client/src/routes/paths.js
//
// Every route path the app links to, in one place. routeTable.js
// builds the routes and the sidebars from these, and links use the same
// values, so a renamed route can't leave a link pointing nowhere.
//
// Several screens have one URL for every role and choose what to show
// by role (receiving, packing, decanting). Who may open each one is in
// routeTable.js, using the groups in permissions.js.
// ─────────────────────────────────────────────────────────────

const DONATIONS_NEW = '/donations/new';

export const LANDING = '/';

export const PACKING = {
  // Warehouse staff only (managers follow packing on Picking Slips).
  board: '/noc/packing',
  detailPattern: '/noc/packing/:slipId',
  detail: (slipId) => `/noc/packing/${slipId}`,
};

export const STAFF = {
  // The home screen for warehouse staff (TaskDashboardPage).
  home:      '/noc',
  // The floor screens below are for warehouse staff only.
  receiving: '/noc/procurement',
  // Past deliveries, reached from the receiving flow rather than the tab bar.
  deliveries: '/noc/procurement/deliveries',
  packing:   PACKING.board,
  decanting: '/noc/decanting',
  // Decanting sheets, reached from the decanting screen.
  decantingRecords: '/noc/decanting/sheets',
  dispatch:  '/staff/dispatch',
  // Collection history, reached from the gate queue.
  dispatchHistory: '/staff/dispatch/history',
  // Reporting, purchase orders, receipts, beneficiaries, reminders,
  // picking slips and the stock ledger are for managers and admins only.
  reporting: '/noc/reporting',
  donation:  DONATIONS_NEW,
  impactReport: '/noc/impact-report',
  purchaseOrders: '/noc/purchase-orders',
  // Past delivery notes and dispatch notes.
  receipts: '/noc/receipts',
  beneficiaries: '/noc/beneficiaries',
  collectionReminders: '/noc/collection-reminders',
  // Weekly slip generation, one-off slips, editing a slip still on the
  // floor, and releasing a claimed pallet back to the floor.
  pickingSlips: '/noc/picking-slips',
  inventory: '/noc/inventory',
  stockLedger: '/noc/stock-ledger',
  // The manager's screens for two programmes the floor also works on.
  communityRequests: '/noc/community-requests',
  feedTheSoil: '/noc/feed-the-soil',
  // The floor's own screens for the same two: logging a request, and
  // assigning kits and weighing compost in.
  floorRequests: '/staff/community-requests',
  floorFeedTheSoil: '/staff/feed-the-soil',
};

export const DONATIONS = {
  new:    DONATIONS_NEW,
  review: `${DONATIONS_NEW}/review`,
};

export const VOLUNTEERS = {
  events: '/volunteers',
  eventPattern: '/volunteers/events/:eventId',
  event: (eventId) => `/volunteers/events/${eventId}`,
};

// Admin-only screens.
export const ADMIN = {
  dashboard: '/admin',
  suppliers: '/admin/suppliers',
  donationManagement: '/admin/donation-management',
  section18aManagement: '/admin/section-18a',
  users:     '/admin/users',
  products:  '/admin/products',
  financeReport: '/admin/finance-report',
  emailIntegration: '/admin/email-integration',
  // Everything an admin can set up, in sections (?section=).
  settings: '/admin/settings',
  // Who signed in at the door, and for how long.
  volunteerLog: '/admin/volunteer-log',
  // What everyone did in the system, and everything deactivated or deleted.
  activity: '/admin/activity',
  // Every email the system has sent, whatever sent it.
  messageHistory: '/admin/messages',
  archive:  '/admin/archive',
};
