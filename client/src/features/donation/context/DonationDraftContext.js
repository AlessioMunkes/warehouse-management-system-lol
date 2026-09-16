// ─────────────────────────────────────────────────────────────
// features/donation/context/DonationDraftContext.js
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
// This file also holds the client-side draft validators. They mirror
// server/src/lib/validation/* exactly so the two layers agree; the
// backend remains the source of truth and re-validates on submit.
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
  unknownProduct: false,
});

// Shape mirrors donation.service.js's createDonation payload closely,
// so mapping draft -> POST body at submit time is close to 1:1.
export const emptyDraft = () => ({
  category: "",              // ⚠ placeholder pending Alessio — see CategorySelector.jsx
  items: [emptyItem()],
  estimatedValueZar: "",
  isFood: null,
  contactMethod: "",
  contactDetails: "",
  programmeCode: "",
  notes: "",
  donorConsentGiven: false,   // null = not yet answered (distinct from false)
  donorName: "",
  donorContact: "",
  donorTaxReference: "",
  // Donor details captured via the gate form (DonorInfoFields).
  donorType: "",
  donorTradingName: "",
  donorAddress: "",
  donorIdType: "",
  donorIdCountry: "",
  donorIdNumber: "",
  donorCountry: "",
  donorProvince: "",
  donorCity: "",
  donorPostalCode: "",
  isAnonymousDonation: false,
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

// ─── Draft validation — mirrors server/src/lib/validation/* exactly ──
import {
  validateDonorName, validateEmail, trimOrEmpty,
} from "../../../lib/validation/donationIntake.part1.js";
import {
  validateDescription, validateQuantity, validateMoney,
} from "../../../lib/validation/donationIntake.part2c.js";

export { trimOrEmpty };




// Single-field validator for validate-while-typing / blur. Returns msg or null.
export function validateDraftField(draft, field) {
  const donorActive = draft?.donorConsentGiven === true
    && draft?.isAnonymousDonation !== true && draft?.anonymous !== true;
  switch (field) {
    case "estimatedValueZar":
      return validateMoney(draft?.estimatedValueZar, { required: true, field: "Estimated value" }).error;
    case "donorConsentGiven":
      return (draft?.donorConsentGiven === null || draft?.donorConsentGiven === undefined)
        ? "Select whether donor consent was given." : null;
    case "donorName":
      if (!trimOrEmpty(draft?.donorName)) return null;
      return validateDonorName(draft?.donorName, {}).error;
    case "donorContact":
      return validateEmail(draft?.donorContact, { required: donorActive }).error;
    case "notes":
      if (draft?.notes == null || !trimOrEmpty(draft.notes)) return null;
      return trimOrEmpty(draft.notes).length > 2000 ? "Notes must be 2000 characters or fewer." : null;
    default: return null;
  }
}


// ── Full-payload validator — used on submit (ReviewPage) and to recover errors
// on DonationDetailsPage when a review round-trips back. Returns
// { valid, errors, itemErrors } where errors maps field -> message and
// itemErrors maps item index -> { field: message }.
export function validateDonationDraft(draft) {
  const d = draft || {};
  const errors = {};
  const itemErrors = {};

  const money = validateMoney(d.estimatedValueZar, { required: true, field: "Estimated value" });
  if (money.error) errors.value = money.error;

  if (d.isFood !== true && d.isFood !== false) {
    errors.isFood = "Select whether this donation contains food.";
  }

  const donorName = trimOrEmpty(d.donorName);
  const donorEmail = trimOrEmpty(d.donorContact ?? d.contactDetails);
  if (donorName) {
    const name = validateDonorName(donorName, {});
    if (name.error) errors.donorName = name.error;
  }
  const email = validateEmail(donorEmail, { required: d.donorConsentGiven === true });
  if (email.error) errors.donorContact = email.error;

  const items = Array.isArray(d.items) ? d.items : [];
  if (items.length === 0) errors.items = "At least one donated item is required.";
  items.forEach((it) => {
    const row = {};
    if (d.isFood === true && !it?.productId && it?.unknownProduct !== true) {
      row.product = "Select a product or mark this line as an unknown product.";
    }
    if (d.isFood !== true || it?.unknownProduct === true) {
      const dd = validateDescription(it?.description || it?.productLabel, { required: true, field: "Product" });
      if (dd.error) row.description = dd.error;
    }
    const q = validateQuantity(it?.quantity);
    if (q.error) row.quantity = q.error;
    if (!trimOrEmpty(it?.unit)) row.unit = "A unit is required.";
    if (Object.keys(row).length) itemErrors[it.id] = row;
  });

  if (d.notes != null && trimOrEmpty(d.notes).length > 2000) {
    errors.notes = "Notes must be 2000 characters or fewer.";
  }

  return {
    valid: Object.keys(errors).length === 0 && Object.keys(itemErrors).length === 0,
    errors,
    itemErrors,
  };
}
