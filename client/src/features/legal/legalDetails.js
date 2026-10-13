// ─────────────────────────────────────────────────────────────
// client/src/features/legal/legalDetails.js
//
// The facts the Privacy Policy and Terms of Service both state, once.
// Anything still in [SQUARE BRACKETS] has not been supplied yet: search
// for "[" in this file, fill each one in, and both pages update.
// ─────────────────────────────────────────────────────────────

export const LEGAL_DETAILS = Object.freeze({
  organisation: 'Ladles of Love NPC',
  systemName: 'Batches, the Ladles of Love warehouse system',

  // TO FILL IN before the pages are submitted to Google.
  contactName: 'Barry van Biljon',
  contactEmail: 'Barry@ladlesoflove.org.za',
  informationOfficer: 'Barry van Biljon, External IT Consultant',

  // Shown on both pages. Change it whenever either page changes.
  lastUpdated: '13 October 2026',

  siteUrl: 'https://wms-lol.onrender.com',
});

// A contact email is made a mailto: link only once it is a real
// address, so the placeholder stays plain text.
export const looksLikeEmail = (value) => /^[^\s@[\]]+@[^\s@[\]]+\.[^\s@[\]]+$/.test(value);
