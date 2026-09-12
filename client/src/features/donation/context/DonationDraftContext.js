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
  // Donor details captured via the gate form (DonorInfoFields).
  donorType: "",
  donorTradingName: "",
  donorAddress: "",
  donorContactNumber: "",
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
  validateDonorName, validateCompanyName, validateEmail, validateSaPhone, trimOrEmpty,
} from "../../../lib/validation/donationIntake.part1.js";
import {
  validateCountry, validateProvince, validateCity, validatePostalCode, validateStreetAddress,
} from "../../../lib/validation/donationIntake.part2a.js";
import {
  validateSaIdNumber, validatePassportNumber, validateTaxReference,
} from "../../../lib/validation/donationIntake.part2b.js";
import {
  validateDescription, validateQuantity, validateMoney,
} from "../../../lib/validation/donationIntake.part2c.js";

export { trimOrEmpty };




const isCompanyType = (t) => t === "company" || t === "trust" || t === "other";

// Single-field validator for validate-while-typing / blur. Returns msg or null.
export function validateDraftField(draft, field) {
  const donorActive = draft?.donorConsentGiven === true
    && draft?.isAnonymousDonation !== true && draft?.anonymous !== true;
  const type = trimOrEmpty(draft?.donorType);
  const isCompany = isCompanyType(type);
  const idType = trimOrEmpty(draft?.donorIdType);
  switch (field) {
    case "estimatedValueZar":
      return validateMoney(draft?.estimatedValueZar, { required: true, field: "Estimated value" }).error;
    case "donorConsentGiven":
      return (draft?.donorConsentGiven === null || draft?.donorConsentGiven === undefined)
        ? "Select whether donor consent was given." : null;
    case "donorName":
      if (!donorActive) return null;
      return (isCompany ? validateCompanyName(draft?.donorName, { required: true })
        : validateDonorName(draft?.donorName, {})).error;
    case "donorTradingName":
      if (!donorActive || !trimOrEmpty(draft?.donorTradingName)) return null;
      return validateCompanyName(draft?.donorTradingName, {}).error;
    case "donorContact":
      if (!donorActive && !trimOrEmpty(draft?.donorContact)) return null;
      return validateEmail(draft?.donorContact, { required: donorActive }).error;
    case "donorContactNumber":
      if (!donorActive && !trimOrEmpty(draft?.donorContactNumber)) return null;
      return validateSaPhone(draft?.donorContactNumber, { required: donorActive }).error;
    case "donorTaxReference":
      if (!donorActive) return null;
      return validateTaxReference(draft?.donorTaxReference, { required: true }).error;
    case "donorType":
      return donorActive && !type ? "Donor type is required." : null;
    case "donorCountry":
      if (!donorActive) return null;
      return validateCountry(draft?.donorCountry ?? draft?.country, { required: true }).error;
    case "donorProvince": {
      if (!donorActive) return null;
      const co = validateCountry(draft?.donorCountry ?? draft?.country, { required: true });
      return validateProvince(draft?.donorProvince ?? draft?.province, { country: co.value ?? "" }).error;
    }
    case "donorCity":
      if (!donorActive) return null;
      return validateCity(draft?.donorCity ?? draft?.city, { required: true }).error;
    case "donorPostalCode": {
      if (!donorActive) return null;
      const co = validateCountry(draft?.donorCountry ?? draft?.country, { required: true });
      return validatePostalCode(draft?.donorPostalCode ?? draft?.postalCode, { country: co.value ?? "", required: true }).error;
    }
    case "donorAddress":
      if (!donorActive) return null;
      return validateStreetAddress(draft?.donorAddress, { required: true }).error;
    case "donorIdType":
      return donorActive && !isCompany && !idType ? "Select an identification type." : null;
    case "donorIdCountry":
      if (!donorActive || isCompany || !trimOrEmpty(draft?.donorIdCountry)) return null;
      return validateCountry(draft?.donorIdCountry, {}).error;
    case "donorIdNumber": {
      if (!donorActive || isCompany) return null;
      if (!trimOrEmpty(draft?.donorIdNumber)) return "Donor identification or registration number is required.";
      const v = trimOrEmpty(draft?.donorIdNumber);
      if (idType === "passport") return validatePassportNumber(v, { required: true }).error;
      if (idType === "south_african_id" || /^\d*$/.test(v)) return validateSaIdNumber(v, { required: true }).error;
      return validateDescription(v, { required: true, field: "Identification number" }).error;
    }
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
  const donorActive = d.donorConsentGiven === true
    && d.isAnonymousDonation !== true && d.anonymous !== true;
  const type = trimOrEmpty(d.donorType);
  const isCompany = isCompanyType(type);

  if (!trimOrEmpty(d.category)) errors.category = "A donation category is required.";

  const money = validateMoney(d.estimatedValueZar, { required: true, field: "Estimated value" });
  if (money.error) errors.value = money.error;

  if (d.donorConsentGiven === null || d.donorConsentGiven === undefined) {
    errors.donorConsentGiven = "Select whether donor consent was given.";
  }

  if (donorActive) {
    if (!type) errors.donorType = "Donor type is required.";
    const nameRes = isCompany
      ? validateCompanyName(d.donorName, { required: true })
      : validateDonorName(d.donorName, {});
    if (nameRes.error) errors.donorName = nameRes.error;

    if (trimOrEmpty(d.donorTradingName)) {
      const t = validateCompanyName(d.donorTradingName, {});
      if (t.error) errors.donorTradingName = t.error;
    }

    const addr = validateStreetAddress(d.donorAddress, { required: true });
    if (addr.error) errors.donorAddress = addr.error;

    const ph = validateSaPhone(d.donorContactNumber, { required: true });
    if (ph.error) errors.donorContactNumber = ph.error;

    const em = validateEmail(d.donorContact, { required: true });
    if (em.error) errors.donorContact = em.error;

    const tx = validateTaxReference(d.donorTaxReference, { required: true });
    if (tx.error) errors.donorTaxReference = tx.error;

    if (!isCompany) {
      if (!trimOrEmpty(d.donorIdType)) errors.donorIdType = "Select an identification type.";
      const idType = trimOrEmpty(d.donorIdType);
      const idVal = trimOrEmpty(d.donorIdNumber);
      if (!idVal && d.donorType != null) {
        errors.donorIdNumber = "Donor identification or registration number is required.";
      } else if (idVal) {
        if (idType === "passport") {
          const p = validatePassportNumber(d.donorIdNumber, { required: true });
          if (p.error) errors.donorIdNumber = p.error;
        } else if (idType === "south_african_id" || /^\d*$/.test(idVal)) {
          const id = validateSaIdNumber(d.donorIdNumber, { required: true });
          if (id.error) errors.donorIdNumber = id.error;
        } else {
          const idr = validateDescription(d.donorIdNumber, { required: true, field: "Identification number" });
          if (idr.error) errors.donorIdNumber = idr.error;
        }
      }
      if (trimOrEmpty(d.donorIdCountry)) {
        const ic = validateCountry(d.donorIdCountry, {});
        if (ic.error) errors.donorIdCountry = ic.error;
      }
    }
  }

  const items = Array.isArray(d.items) ? d.items : [];
  if (items.length === 0) errors.items = "At least one donated item is required.";
  items.forEach((it) => {
    const row = {};
    const dd = validateDescription(it?.description, { required: true, field: "Description" });
    if (dd.error) row.description = dd.error;
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
