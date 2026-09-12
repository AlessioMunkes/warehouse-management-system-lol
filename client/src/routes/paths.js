// ─────────────────────────────────────────────────────────────
// client/src/routes/paths.js
//
// Route paths that more than one file needs to agree on.
//
// The packing board and the packing page each used to hard-code their
// own string. They drifted: the page navigated to
// "/programmes/noc/packing/:id" while App.jsx only declared
// "/noc/packing/:slipId", so opening a pallet from the board fell
// through to the catch-all and bounced the packer to the landing
// page. Declaring the path once, and building both the <Route> and
// the navigate() target from it, means that cannot happen again.
//
// The staff task pages are added here for the same reason: the tab
// bar, the four pages and the route table all read from STAFF, so a
// renamed route cannot leave a tab pointing at nothing.
//
// Receiving and packing each used to have two URLs — a manager one
// and a "/staff/..." one — and every chooser screen only ever linked
// to the manager one, so a worker could never reach the new flow
// except by typing the staff URL directly. They now share a single
// URL with the manager view, the same way decanting already did:
// ProcurementPage/PackingSelectPage pick the shape by role at the one
// path everything links to. See DecantingPage.jsx for the pattern
// this follows.
// ─────────────────────────────────────────────────────────────

// Single source for the donation intake base path — STAFF.donation and
// DONATIONS.new must never drift apart.
const DONATIONS_NEW = '/donations/new';

export const PACKING = {
  // One URL for everyone. PackingSelectPage decides whether that
  // renders the manager's board (PackingPage) or the packer's own
  // flow (PackingStaffPage).
  board: '/noc/packing',
  detailPattern: '/noc/packing/:slipId',
  detail: (slipId) => `/noc/packing/${slipId}`,
};

export const STAFF = {
  // The task chooser. Still SelectNOCjob for now; the wireframed
  // dashboard (icon grid or journey) replaces it in the next pass.
  home:      '/noc',
  // One URL for everyone — ProcurementPage picks the manager
  // dashboard or the receiving wizard by role.
  receiving: '/noc/procurement',
  // A sub-screen of receiving, not a sixth tab: the tab bar is a
  // fixed five-item strip with no spare icon slot, and this only
  // needs to be reachable from the receiving flow, not from
  // everywhere. Reached via a link on ReceivingFlow's first screen.
  deliveries: '/noc/procurement/deliveries',
  packing:   PACKING.board,
  // One route, two shapes: DecantingPage picks the sack flow or the
  // week planner by role. There is no /staff/decanting.
  decanting: '/noc/decanting',
  // A sub-screen of decanting, not a sixth tab, same reasoning as
  // deliveries above — reached via a link on Decanting's crumb bar.
  decantingRecords: '/noc/decanting/sheets',
  dispatch:  '/staff/dispatch',
  // A sub-screen of dispatch, not a sixth tab, same reasoning as
  // deliveries/decantingRecords above — reached via a link on the
  // gate queue's crumb bar.
  dispatchHistory: '/staff/dispatch/history',
  // Manager-only. Both /api/reporting routes are
  // requireRole(MANAGER, ADMIN); the App.jsx gate mirrors that.
  reporting: '/noc/reporting',
  // Donation intake. Entry point of the draft flow; see DONATIONS
  // below for the later steps.
  donation:  DONATIONS_NEW,
  // Manager-only, same reasoning as reporting above — a dedicated
  // view for the two impactOnly metrics in reportCatalog.js, rather
  // than one more entry in ReportingPage.jsx's full metric picker.
  impactReport: '/noc/impact-report',
  // Manager-only, like reporting above: POST /api/purchase-orders
  // is requireRole(MANAGER, ADMIN) and the App.jsx gate mirrors
  // that. Reads are open to warehouse staff, but they reach a PO
  // through the receiving flow rather than this screen.
  purchaseOrders: '/noc/purchase-orders',
  // The receipts archive: past delivery notes and past dispatch notes.
  // NOT manager-gated. Both server GETs are requireRole(...ALL_ROLES) and the
  // URS puts each document in front of warehouse staff — the procurement
  // sequence diagram's [view delivery note selected] frame is Warehouse
  // Staff, and the dispatch one says the note is viewable by staff, admin and
  // management. Declared here for the same reason everything else is: the
  // route table and the entry tiles read one string, so they cannot drift.
  receipts: '/noc/receipts',
  // Manager-only, same reasoning as purchaseOrders above. Needed by
  // picking slip creation (the ECD dropdown) as much as it is a
  // screen in its own right, so it lives here rather than under
  // ADMIN — a manager reaches both from the same task set.
  beneficiaries: '/noc/beneficiaries',
  // POST /api/picking (createSlip), POST /api/picking/generate, and
  // assigning a slip to a specific worker (POST /api/picking/:id/assign
  // with a packerId, only honoured for a manager) are all
  // requireRole(MANAGER, ADMIN) in picking.routes.js — one screen for
  // all three, since assignment happens inline on a slip rather than
  // as a separate page.
  pickingSlips: '/noc/picking-slips',
  // Manager-only archive of generated delivery/dispatch notes — reuses
  // receivingAPI.getDeliveries/getDeliveryById and
  // dispatchAPI.getHistory/getDispatchNote, the same functions the
  // staff-side equivalents already call, so no new route gating is
  // needed beyond what those two already require.
  documents: '/noc/documents',
  // Manager-only. All three /api/stock/ledger routes are
  // requireRole(MANAGER, ADMIN); the App.jsx gate mirrors that. The
  // per-product history drawer on the inventory screen stays open to
  // every role — this is the warehouse-wide, supervisory view.
  stockLedger: '/noc/stock-ledger',
  // ADM-5.0 / BR-28 — the benevolent package (call-in) request log.
  // Warehouse staff and up: every /api/community-requests route is
  // requireRole(WORKER, MANAGER, ADMIN), and this mirrors that.
  communityRequests: '/noc/community-requests',
};

// ── Donations ────────────────────────────────────────────────
// Split from STAFF because the intake flow is role-gated more
// tightly than the rest of the task dashboard (see App.jsx).
export const DONATIONS = {
  new:    DONATIONS_NEW,
  review: `${DONATIONS_NEW}/review`,
};

// Client-side mirror of RECEIVERS_UP in
// server/src/routes/donation.routes.js. If the server list changes,
// change this one with it — they are two halves of the same rule.
export const DONATION_INTAKE_ROLES = ['warehouse_worker', 'manager', 'admin'];

// Client-side mirror of STAFF_UP in
// server/src/routes/communityRequest.routes.js (BR-01: "Warehouse
// Staff or higher"). Two halves of the same rule — change them together.
export const COMMUNITY_REQUEST_ROLES = ['warehouse_worker', 'manager', 'admin'];

// Volunteer Management is currently available to the two live roles that
// perform the coordinator workflow. Keep this list shared by route guards and
// dashboard entry points until a coordinator role exists in the live system.
export const VOLUNTEER_MANAGEMENT_ROLES = ['manager', 'admin'];

export const VOLUNTEERS = {
  events: '/volunteers',
  eventPattern: '/volunteers/events/:eventId',
  event: (eventId) => `/volunteers/events/${eventId}`,
};

// ── Admin ────────────────────────────────────────────────────
// Admin-only screens. Gated in App.jsx with roles={['admin']} and
// mirrored on the server by requireRole(MANAGER, ADMIN) for writes.
export const ADMIN = {
  dashboard: '/admin',
  suppliers: '/admin/suppliers',
  donationManagement: '/admin/donation-management',
  section18aManagement: '/admin/section-18a',
  users:     '/admin/users',
  products:  '/admin/products',
  emailIntegration: '/admin/email-integration',
};
