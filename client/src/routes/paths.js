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
  packing:   PACKING.board,
  // One route, two shapes: DecantingPage picks the sack flow or the
  // week planner by role. There is no /staff/decanting.
  decanting: '/noc/decanting',
  dispatch:  '/staff/dispatch',
};
