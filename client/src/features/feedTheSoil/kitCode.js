// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/kitCode.js
//
// Display-only kit code — CK0023, not the raw database id. One
// function so the format changes in one place once the real numbering
// system replaces this placeholder.
// ─────────────────────────────────────────────────────────────
export const formatKitCode = (id) => `CK${String(id).padStart(4, '0')}`;

export default formatKitCode;
