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
// ─────────────────────────────────────────────────────────────

export const PACKING = {
  // The manager's board, and the <Route> pattern for one slip.
  board: '/noc/packing',
  detailPattern: '/noc/packing/:slipId',
  detail: (slipId) => `/noc/packing/${slipId}`,

  // The packer's own board, and one pallet on it. A separate path
  // rather than a query flag, because the two screens are different
  // shapes for different people — see PackingStaffPage.jsx.
  staffBoard: '/staff/packing',
  staffDetailPattern: '/staff/packing/:slipId',
  staffDetail: (slipId) => `/staff/packing/${slipId}`,
};

export const STAFF = {
  // The task chooser. Still SelectNOCjob for now; the wireframed
  // dashboard (icon grid or journey) replaces it in the next pass.
  home:      '/noc',
  receiving: '/staff/receiving',
  packing:   PACKING.staffBoard,
  // One route, two shapes: DecantingPage picks the sack flow or the
  // week planner by role. There is no /staff/decanting.
  decanting: '/noc/decanting',
  dispatch:  '/staff/dispatch',
};
