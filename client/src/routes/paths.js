// ─────────────────────────────────────────────────────────────
// client/src/routes/paths.js
//
// Route paths that more than one file needs to agree on.
//
// The packing board and the packing page each used to hard-code
// their own string. They drifted: the page navigated to
// "/programmes/noc/packing/:id" while App.jsx only declared
// "/noc/packing/:slipId", so opening a pallet from the board fell
// through to the catch-all and bounced the packer to the landing
// page. Declaring the path once, and building both the <Route> and
// the navigate() target from it, means that can't happen again.
// ─────────────────────────────────────────────────────────────

export const PACKING = {
  // Where the board lives, and the <Route> pattern for one slip.
  board: '/noc/packing',
  detailPattern: '/noc/packing/:slipId',

  // The URL for a specific slip.
  detail: (slipId) => `/noc/packing/${slipId}`,
};