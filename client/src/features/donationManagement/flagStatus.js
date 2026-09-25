// ─────────────────────────────────────────────────────────────
// client/src/features/donationManagement/flagStatus.js
//
// Whether a flagged donation item still needs a manager's decision.
// Its own module (not exported from FlaggedItemsTab.jsx) so that
// component file exports only components — react-refresh's rule —
// and DonationManagementPage can count the tab without importing it.
// ─────────────────────────────────────────────────────────────
export const isUnresolvedFlag = (row = {}) =>
  !row.status || row.status === 'pending' || row.status === 'pending_classification';
