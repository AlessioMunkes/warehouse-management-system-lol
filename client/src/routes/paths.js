// ─────────────────────────────────────────────────────────────
// client/src/routes/paths.js
//
// Every route path the app links to, in one place. App.jsx builds its
// routes from these, and the menus, tab bar and links use the same
// values, so a renamed route can't leave a link pointing nowhere.
//
// Several screens have one URL for every role and choose what to show
// by role (receiving, packing, decanting). The role lists below are the
// client's copy of the server's rules; change both together.
// ─────────────────────────────────────────────────────────────

const DONATIONS_NEW = '/donations/new';

export const LANDING = '/';

export const PACKING = {
  // Managers see the packing board; warehouse staff see their own flow.
  board: '/noc/packing',
  detailPattern: '/noc/packing/:slipId',
  detail: (slipId) => `/noc/packing/${slipId}`,
};

export const STAFF = {
  // The home screen for warehouse staff (TaskDashboardPage).
  home:      '/noc',
  // Managers get the procurement dashboard here; staff get the receiving flow.
  receiving: '/noc/procurement',
  // Past deliveries, reached from the receiving flow rather than the tab bar.
  deliveries: '/noc/procurement/deliveries',
  packing:   PACKING.board,
  // Staff get the decanting flow; managers get the week planner.
  decanting: '/noc/decanting',
  // Decanting sheets, reached from the decanting screen.
  decantingRecords: '/noc/decanting/sheets',
  dispatch:  '/staff/dispatch',
  // Collection history, reached from the gate queue.
  dispatchHistory: '/staff/dispatch/history',
  // Reporting, purchase orders, receipts, beneficiaries, reminders,
  // picking slips and the stock ledger are for managers and admins only.
  reporting: '/noc/reporting',
  // Donation intake (workers and admins; see DONATION_INTAKE_ROLES).
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
  stockLedger: '/noc/stock-ledger',
  // Open to warehouse staff as well as managers and admins.
  communityRequests: '/noc/community-requests',
  feedTheSoil: '/noc/feed-the-soil',
};

export const DONATIONS = {
  new:    DONATIONS_NEW,
  review: `${DONATIONS_NEW}/review`,
};

// Matches RECEIVERS_UP in server/src/routes/donation.routes.js, minus
// managers: logging a donation is floor work, so managers don't see the
// intake screens. Admins keep them for corrections.
export const DONATION_INTAKE_ROLES = ['warehouse_worker', 'admin'];

// Everyone who works the floor: the home screen and the receiving,
// packing, decanting and dispatch flows. Guests are left out on
// purpose; they only get /guest-home and the pallet QR flow.
export const STAFF_ROLES = ['warehouse_worker', 'manager', 'admin'];

// Match STAFF_UP on the server's community-request and collection-kit routes.
export const COMMUNITY_REQUEST_ROLES = ['warehouse_worker', 'manager', 'admin'];
export const FEED_THE_SOIL_ROLES = ['warehouse_worker', 'manager', 'admin'];

// Volunteer events are run by managers and admins.
export const VOLUNTEER_MANAGEMENT_ROLES = ['manager', 'admin'];

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
  // Who signed in at the door, and for how long.
  volunteerLog: '/admin/volunteer-log',
  // What everyone did in the system, and everything deactivated or deleted.
  activity: '/admin/activity',
  archive:  '/admin/archive',
};
