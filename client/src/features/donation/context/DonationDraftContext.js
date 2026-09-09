// ─────────────────────────────────────────────────────────────
// features/donation/components/DonationDraftContext.js
//
// Non-component half of the donation draft context.
//
// Split out of the old DonationDraftContext.jsx: that file exported
// both <DonationDraftProvider> (a component) and useDonationDraft
// (a hook), which trips react-refresh/only-export-components — Vite's
// Fast Refresh can't hot-reload a module that mixes the two. The
// provider now lives in DonationDraftProvider.jsx; everything that
// isn't a component lives here.
//
// Note this is a .js file, not .jsx — it contains no JSX, and keeping
// the extension honest is what keeps the lint rule out of it.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext } from "react";

export const STORAGE_KEY = "donation-draft";

// One empty item row — id is local-only (crypto.randomUUID), never
// sent to the backend. The backend assigns its own item ids on insert.
export const emptyItem = () => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "",
  unit: "",
  productId: null,
  productLabel: "",
  // Per-item category (one of the four BR-10 categories). Used by the
  // pending-donation endpoint's routing when the item has no matched
  // product; only shown in the UI when productId is unset.
  requestedCategory: "",
});

// Shape mirrors donation.service.js's createDonation payload closely,
// so mapping draft -> POST body at submit time is close to 1:1.
export const emptyDraft = () => ({
  category: "",              // ⚠ placeholder pending Alessio — see CategorySelector.jsx
  items: [emptyItem()],
  estimatedValueZar: "",
  programmeCode: "",
  notes: "",
  donorConsentGiven: null,   // null = not yet answered (distinct from false)
  donorName: "",
  donorContact: "",
  donorTaxReference: "",
  // Generated once per draft, not per submit attempt — the backend's
  // ON CONFLICT (idempotency_key) relies on this staying the same
  // across a retried submit, e.g. after a network blip.
  idempotencyKey: crypto.randomUUID(),
});

export const DonationDraftContext = createContext(null);

export function useDonationDraft() {
  const ctx = useContext(DonationDraftContext);
  if (!ctx) {
    throw new Error("useDonationDraft must be called inside <DonationDraftProvider>");
  }
  return ctx;
}
