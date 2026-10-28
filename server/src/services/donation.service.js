// ─────────────────────────────────────────────────────────────
// server/src/services/donation.service.js
//
// Business logic for donation intake (BR-08, BR-09, BR-10).
//
// The governing constraint, and the reason this file is shaped the
// way it is: intake must not fail. The paper donation form the
// Warehouse Supervisor introduced went unused (Warehouse Visit 5.1),
// and the Risk Management Plan treats that as a direct preview of the
// adoption risk facing the whole WMS. A submit that 400s because a
// donated item has no product code teaches staff to stop using the
// screen, and then nothing is recorded at all.
//
// So: only genuinely malformed input throws. Everything ambiguous — no
// product match, no eligible ECDs to split across, a donor who walked
// off before giving their details — is recorded, flagged, and returned
// as a warning for someone to resolve later. Same principle as
// isShortfall in the stock repository: a flag, not an error.
// ─────────────────────────────────────────────────────────────
import { determineRouting } from '../utils/donationRouting.js';
import {
  validateDonorName,
  validateCompanyName,
  validateEmail,
  validateSaPhone,
  validateCountry,
  validateProvince,
  validateCity,
  validatePostalCode,
  validateStreetAddress,
  validateSaIdNumber,
  validatePassportNumber,
  validateTaxReference,
  validatePboNumber,
  validateDescription,
  validateQuantity,
  validateMoney,
  validateIsoDate,
  donationFingerprint,
} from '../utils/donationValidation.js';
import donationModel from '../repositories/donation.repository.js';
import { convertQuantity } from '../features/units/unitConversion.js';
import { DONATION_CATEGORIES } from '../constants/donationCategories.js';
import {
  sendThankYouEmail,
  getSection18AFormByToken,
  submitSection18AForm,
  generateSection18ACertificate,
  downloadSection18ACertificate,
  listEmailHistory,
  resendDonationEmail,
  getSection18ASettings,
  updateSection18ASettings,
} from './donationEmail.service.js';

// ── fail ───────────────────────────────────────────────────────
// Mirrors stock.service.js and picking.service.js. Without a
// `.status`, the controller's `err.status || 500` sends validation
// failures down the 500 branch and replaces the message with a
// generic one, so the gate sees a blank error.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// The four values of the donation_category enum in the live database.
// Exported so the client can build its picker from the same list the
// server validates against.
//
// These are enum labels, not free text: Postgres rejects anything else
// outright, so a mismatch here is a 500 rather than a clean 400.
export const CATEGORIES = DONATION_CATEGORIES;

// ── Units ─────────────────────────────────────────────────────
// stock_levels.unit and stock_movements.unit both carry a CHECK
// constraint limiting units to this exact list.
//
// This matters more than it looks. The intake form lets staff type a
// unit freely, and a donated crate entered as "crates" or "box of 12"
// would pass every check in this service, reach adjustStock, and
// violate the constraint INSIDE the donation transaction — rolling
// back the whole intake with a database error the gate cannot act on.
// Validating here turns that into a clear 400 before anything is
// written.
export const ALLOWED_UNITS = ['kg', 'g', 'l', 'ml', 'each', 'bag', 'box', 'crate', 'punnet'];

// Quantities are NUMERIC. All splitting arithmetic happens in integer
// thousandths so no float ever touches an allocated figure.
const UNITS_PER_QTY = 1000;

// ─────────────────────────────────────────────────────────────
// PURE: proportional split by child count (BR-10, add-on food)
//
// Largest-remainder (Hare) apportionment. The naive approach —
// round(quantity * share) per centre — does not sum back to the
// quantity donated: 10 units across three equal centres rounds to
// 3+3+3 and loses one, or 4+3+3 and invents one. Over a month of
// add-on donations that is real food unaccounted for. Largest
// remainder always sums exactly.
//
// Deterministic tie-break — largest remainder, then larger centre,
// then lower id — so the same donation splits the same way twice. A
// split that shifts between runs is impossible to audit.
// ─────────────────────────────────────────────────────────────
export const splitByChildCount = (quantity, centres) => {
  if (!Array.isArray(centres) || centres.length === 0) return [];

  const totalChildren = centres.reduce((sum, c) => sum + Number(c.childCount || 0), 0);
  if (totalChildren <= 0) return [];

  const totalUnits = Math.round(Number(quantity) * UNITS_PER_QTY);
  if (!Number.isFinite(totalUnits) || totalUnits <= 0) return [];

  const rows = centres.map((c) => {
    const exact = (totalUnits * Number(c.childCount)) / totalChildren;
    const base  = Math.floor(exact);
    return {
      ecdId:      c.id,
      childCount: Number(c.childCount),
      baseUnits:  base,
      remainder:  exact - base,
    };
  });

  let leftover = totalUnits - rows.reduce((sum, r) => sum + r.baseUnits, 0);

  const ranked = [...rows].sort((a, b) =>
    b.remainder - a.remainder ||
    b.childCount - a.childCount ||
    a.ecdId - b.ecdId
  );

  for (let i = 0; leftover > 0; i = (i + 1) % ranked.length) {
    ranked[i].baseUnits += 1;
    leftover -= 1;
  }

  return rows.map((r) => ({
    ecdId:             r.ecdId,
    childCount:        r.childCount,
    allocatedQuantity: r.baseUnits / UNITS_PER_QTY,
  }));
};

// ─────────────────────────────────────────────────────────────
// PURE: Section 18A evaluation (BR-09)
//
// A status, not a boolean, because "qualifies" and "can be issued"
// are different facts and finance acts on them differently. The
// existing section_18a_qualifying boolean is kept in step alongside
// it — see toQualifyingFlag below.
//
// Consent is part of the test, not an afterthought. Issuing a
// certificate means processing and retaining the donor's name and tax
// reference; under POPIA that needs a lawful basis, and for a donor
// at a gate that basis is consent. A donation with details but no
// consent is not issuable.
//
// ⚠ The value threshold is Ladles of Love policy, read from
// donation_settings — Section 18A itself sets no minimum. What the Act
// does require on a valid receipt is the donor's identifying details,
// which is why an anonymous over-threshold donation lands in
// qualifying_pending_donor rather than queued.
// ─────────────────────────────────────────────────────────────
export const evaluateSection18A = ({
  estimatedValueZar, donorName, donorTaxReference, donorConsentGiven, threshold,
}) => {
  // No configured threshold is not the same as "everything
  // qualifies". Leaving it unevaluated keeps the donation out of the
  // finance queue instead of flooding it.
  if (threshold === null || threshold === undefined || !Number.isFinite(Number(threshold))) {
    return 'not_evaluated';
  }

  const value = Number(estimatedValueZar);
  if (!Number.isFinite(value) || value < Number(threshold)) return 'not_qualifying';

  const hasDonor = Boolean(String(donorName || '').trim()) &&
                   Boolean(String(donorTaxReference || '').trim()) &&
                   donorConsentGiven === true;

  return hasDonor ? 'queued' : 'qualifying_pending_donor';
};

// Keeps the pre-existing boolean honest to its own meaning: the
// donation qualifies by value, regardless of whether a certificate can
// actually be issued. Written alongside the status, never instead of
// it, so anything already reading the boolean keeps working.
export const toQualifyingFlag = (status) =>
  status === 'queued' || status === 'issued' || status === 'qualifying_pending_donor';

// ─────────────────────────────────────────────────────────────
// PURE: routing decision for one line (BR-10)
//
// Only recipe food matched to a product moves the ECD balance. The
// other three categories are recorded without touching stock_levels,
// each for a different reason — see the migration's routing_status
// comments.
// ─────────────────────────────────────────────────────────────
export const resolveRouting = ({ category, productId, allocationCount }) => {
  if (category === 'non_food')        return 'not_stock_bearing';
  if (category === 'non_recipe_food') return 'awaiting_programme_stock';
  if (category === 'add_on_food')     return allocationCount > 0 ? 'allocated' : 'pending';
  return productId ? 'allocated' : 'unmatched';   // recipe_food
};

// ── Validate and normalise one submitted line ─────────────────
// Throws only on input that cannot be recorded at all. A missing
// product is not one of those cases.
const normaliseItem = (raw, index) => {
  const label       = `line ${index + 1}`;
  const description = String(raw?.description || '').trim();
  const quantity    = Number(raw?.quantity);
  const unit        = String(raw?.unit || '').trim().toLowerCase();
  const lineNo      = raw?.lineNo ?? raw?.line_no ?? index + 1;

  if (!description) fail(400, `A description is required for ${label}.`);
  if (!Number.isFinite(quantity) || quantity <= 0)
    fail(400, `Quantity for ${label} must be greater than zero.`);
  if (!unit) fail(400, `A unit is required for ${label}.`);

  // Checked against the database's own CHECK constraint list. Without
  // this the failure surfaces from inside the transaction as a
  // constraint violation and takes the whole donation with it.
  if (!ALLOWED_UNITS.includes(unit))
    fail(400, `Unit "${unit}" for ${label} is not one of: ${ALLOWED_UNITS.join(', ')}.`);

  // productId is optional by design. When present it must still be a
  // real positive integer — a malformed one would reach adjustStock
  // and throw there, inside the transaction.
  let productId = null;
  if (raw.productId !== undefined && raw.productId !== null && raw.productId !== '') {
    const parsed = Number(raw.productId);
    if (!Number.isInteger(parsed) || parsed <= 0)
      fail(400, `Product reference for ${label} is not valid.`);
    productId = parsed;
  }

  let locationId = null;
  if (raw.locationId !== undefined && raw.locationId !== null && raw.locationId !== '') {
    const parsed = Number(raw.locationId);
    if (!Number.isInteger(parsed) || parsed <= 0)
      fail(400, `Storage location for ${label} is not valid.`);
    locationId = parsed;
  }

  // Per-line value is optional; donation_items.estimated_value_zar is
  // nullable. It exists so a Section 18A certificate can itemise what
  // was donated rather than showing one lump sum.
  let estimatedValueZar = null;
  if (raw.estimatedValueZar !== undefined && raw.estimatedValueZar !== null && raw.estimatedValueZar !== '') {
    const parsed = Number(raw.estimatedValueZar);
    if (!Number.isFinite(parsed) || parsed < 0)
      fail(400, `Estimated value for ${label} must be zero or more.`);
    estimatedValueZar = parsed;
  }

  return { lineNo, productId, description, quantity, unit, locationId, estimatedValueZar };
};

// ── Validate donor-supplied fields (production-grade intake rules) ─
// Backend is the source of truth; frontend mirrors these exact rules.
// Throws 400 with structured `err.details` ({ field: message }) on failure.
// Never weakens the three required fields / unit / category rules below.
const validateDonorFields = (data) => {
  const errors = {};
  const clean = {};
  const consent = data?.donorConsentGiven === true;
  const anonymous = data?.isAnonymousDonation === true || data?.anonymous === true;
  const donorType = String(data?.donorType || '').trim();
  const isCompany = donorType === 'company' || donorType === 'trust' || donorType === 'other';

  if (consent && !anonymous) {
    const nameCheck = isCompany
      ? validateCompanyName(data?.donorName ?? data?.companyName, {})
      : validateDonorName(data?.donorName, {});
    if (nameCheck.error) errors.donorName = nameCheck.error;
    else clean.donorName = nameCheck.value;

    if (data?.donorTradingName !== undefined && String(data.donorTradingName).trim() !== '') {
      const t = validateCompanyName(data.donorTradingName, {});
      if (t.error) errors.donorTradingName = t.error;
      else clean.donorTradingName = t.value;
    }

    const e = validateEmail(data?.donorContact ?? data?.donorEmail, { required: false });
    if (e.error) errors.donorContact = e.error;
    else clean.donorContact = e.value;

    const ph = validateSaPhone(data?.donorContactNumber ?? data?.donorPhone, { required: false });
    if (ph.error) errors.donorContactNumber = ph.error;
    else clean.donorContactNumber = ph.value;

    const tx = validateTaxReference(data?.donorTaxReference, { required: false });
    if (tx.error) errors.donorTaxReference = tx.error;
    else clean.donorTaxReference = tx.value;

    const co = validateCountry(data?.donorCountry ?? data?.country, { required: false });
    if (co.error) errors.donorCountry = co.error;
    else clean.donorCountry = co.value;

    const pr = validateProvince(data?.donorProvince ?? data?.province, { country: clean.donorCountry ?? '' });
    if (pr.error) errors.donorProvince = pr.error;
    else if (pr.value) clean.donorProvince = pr.value;

    const ci = validateCity(data?.donorCity ?? data?.city, { required: false });
    if (ci.error) errors.donorCity = ci.error;
    else clean.donorCity = ci.value;

    const pc = validatePostalCode(data?.donorPostalCode ?? data?.postalCode, { country: clean.donorCountry ?? '', required: false });
    if (pc.error) errors.donorPostalCode = pc.error;
    else clean.donorPostalCode = pc.value;

    const st = validateStreetAddress(data?.donorAddress ?? data?.streetAddress, { required: false });
    if (st.error) errors.donorAddress = st.error;
    else clean.donorAddress = st.value;

    if (!isCompany) {
      const idType = String(data?.donorIdType || '').trim();
      const idVal = String(data?.donorIdNumber ?? '').trim();
      if (idType === 'passport') {
        const p = validatePassportNumber(data?.donorIdNumber, { required: false });
        if (p.error) errors.donorIdNumber = p.error;
        else clean.donorIdNumber = p.value;
      } else if (idType === 'south_african_id' || /^\d*$/.test(idVal)) {
        const id = validateSaIdNumber(data?.donorIdNumber, { required: false });
        if (id.error) errors.donorIdNumber = id.error;
        else clean.donorIdNumber = id.value;
      } else if (idType) {
        const d = validateDescription(data?.donorIdNumber, { required: false, field: 'Identification number' });
        if (d.error) errors.donorIdNumber = d.error;
        else clean.donorIdNumber = d.value;
      }
      const ic = validateCountry(data?.donorIdCountry, {});
      if (ic.error) errors.donorIdCountry = ic.error;
      else if (ic.value) clean.donorIdCountry = ic.value;
    }

    if (data?.donorPboNumber !== undefined && String(data.donorPboNumber).trim() !== '') {
      const p = validatePboNumber(data.donorPboNumber, {});
      if (p.error) errors.donorPboNumber = p.error;
      else clean.donorPboNumber = p.value;
    }
  } else {
    // No consent / anonymous: validate anything supplied, require nothing.
    if (data?.donorContact !== undefined && String(data.donorContact).trim() !== '') {
      const e = validateEmail(data.donorContact, {});
      if (e.error) errors.donorContact = e.error;
    }
    if (data?.donorContactNumber !== undefined && String(data.donorContactNumber).trim() !== '') {
      const p = validateSaPhone(data.donorContactNumber, {});
      if (p.error) errors.donorContactNumber = p.error;
    }
  }

  if (data?.donationDate !== undefined && String(data.donationDate).trim() !== '') {
    const dt = validateIsoDate(data.donationDate, { allowFuture: false, field: 'Donation date' });
    if (dt.error) errors.donationDate = dt.error;
    else clean.donationDate = dt.value;
  }

  if (data?.notes !== undefined && data?.notes !== null && String(data.notes).trim() !== '') {
    const v = String(data.notes).trim();
    if (v.length > 2000) errors.notes = 'Notes must be 2000 characters or fewer.';
    else clean.notes = v;
  }

  if (Object.keys(errors).length) {
    const err = new Error('Donation validation failed.');
    err.status = 400;
    err.details = errors;
    // Duplicate-prevention hint: warn (do not block) on likely re-submit.
    try {
      err.duplicateFingerprint = donationFingerprint({
        donorKey: clean.donorName || data?.donorName || '',
        items: Array.isArray(data?.items) ? data.items : [],
        donationDate: clean.donationDate || data?.donationDate || '',
      });
    } catch { /* fingerprint is best-effort */ }
    throw err;
  }
  return clean;
};

// ── Create a donation ─────────────────────────────────────────
const createDonation = async (data, userId) => {
  // Production-grade intake validation FIRST (backend = source of truth).
  // Throws 400 with err.details ({ field: message }) on failure.
  const donorClean = validateDonorFields(data);

  const {
    category, estimatedValueZar, donorName, donorContact,
    donorTaxReference, donorConsentGiven, idempotencyKey, items,
  } = data || {};
  // Use sanitised donor values where present, else raw trimmed values.
  const cleanName = donorClean.donorName ?? (typeof donorName === 'string' ? donorName.trim() : donorName);
  const cleanContact = (donorClean.donorContact ?? (typeof donorContact === 'string' ? donorContact.trim().toLowerCase() : donorContact));
  const cleanTax = donorClean.donorTaxReference ?? donorTaxReference;
  const cleanPhone = donorClean.donorContactNumber;
  const cleanNotes = donorClean.notes ?? data?.notes;
  const cleanDate = donorClean.donationDate;

  // ── The three required fields, and nothing else ─────────────
  if (!category || !CATEGORIES.includes(category))
    fail(400, 'A donation category is required.');

  if (estimatedValueZar === undefined || estimatedValueZar === null || estimatedValueZar === '')
    fail(400, 'An estimated value is required (BR-09). Enter 0 if the donation has no assessable value.');

  // validateMoney already enforced: numeric, >= 0, max 2 decimals.
  const moneyCheck = validateMoney(estimatedValueZar, { required: true, field: 'Estimated value' });
  if (moneyCheck.error) fail(400, moneyCheck.error);
  const value = moneyCheck.value;

  if (!Array.isArray(items) || items.length === 0)
    fail(400, 'At least one donated item is required.');

  const normalised = items.map(normaliseItem);

  // A donation is not filed under a programme. Intake used to ask and
  // nothing read the answer; the column stays, empty, for the donations
  // recorded while it did.
  const programmeId = null;

  // ── Retried submit ──────────────────────────────────────────
  // Checked here so the common case returns without opening a
  // transaction. The repository's ON CONFLICT covers the race where
  // two taps get past this read together.
  if (idempotencyKey) {
    const existing = await donationModel.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      const donation = await donationModel.getDonationById(existing.id);
      return { donation, warnings: [], duplicate: true };
    }
  }

  const threshold        = await donationModel.getSection18AThreshold();
  const section18aStatus = evaluateSection18A({
    estimatedValueZar: value, donorName: cleanName, donorTaxReference: cleanTax, donorConsentGiven, threshold,
  });

  // ── Add-on food: compute the split before writing ───────────
  // Read once for the whole donation rather than per line — the same
  // centre list must apply to every line of one drop-off.
  let centres = [];
  if (category === 'add_on_food') {
    centres = await donationModel.getEligibleEcdCentres();
  }

  const warnings = [];

  const routed = [];

  for (const item of normalised) {
    const allocations = category === 'add_on_food'
      ? splitByChildCount(item.quantity, centres)
      : [];

    let routingStatus = resolveRouting({
      category,
      productId:       item.productId,
      allocationCount: allocations.length,
    });

    let routedCategory = null;
    let routingOutcome = null;
    let routedSource = null;
    let locationId = item.locationId ?? null;

    if (item.productId) {
      const itemRouting = await determineRouting({ productId: item.productId });
      if (itemRouting.source === 'product_default' || itemRouting.source === 'manual_category') {
        routingStatus = 'allocated';
        routedCategory = itemRouting.category;
        routingOutcome = itemRouting.routing_outcome;
        routedSource = itemRouting.source;

        if (itemRouting.storage_area) {
          // Deterministic choice: lowest storage_locations.id wins when multiple
          // locations share the same area. This is a placeholder; a future
          // enhancement can add a designated primary flag to a location row.
          const match = await donationModel.getLocationIdForArea(itemRouting.storage_area);
          locationId = match ?? null;
          if (!match) {
            warnings.push({
              description: item.description,
              message: `"${item.description}" was classified to storage area "${itemRouting.storage_area}", but no active storage_locations row currently matches it.`,
            });
          }
        }
      } else {
        routingStatus = 'unmatched';
        routedSource = 'unclassified';
        routingOutcome = itemRouting.routing_outcome;
        locationId = null;
      }
    } else {
      // Flow B already has a separate pending_classification stub path for truly
      // unrecognized intake items. Flow A intentionally keeps description-only
      // lines in the unmatched queue instead of creating a second manager flow.
      routedSource = 'unclassified';
      routingOutcome = 'manual_review';
      locationId = null;
    }

    if (routingStatus === 'unmatched') {
      warnings.push({
        description: item.description,
        message: `"${item.description}" was recorded but not matched to a stock item, so it has not been added to stock. A manager can resolve it from the unmatched queue.`,
      });
    }

    if (category === 'add_on_food' && allocations.length === 0) {
      warnings.push({
        description: item.description,
        message: `"${item.description}" was recorded but no active ECD centres with a child count were found, so no distribution split could be calculated.`,
      });
    }

    routed.push({
      ...item,
      locationId,
      routingStatus,
      routedCategory,
      routingOutcome,
      routedSource,
      allocations,
    });
  }

  if (section18aStatus === 'qualifying_pending_donor') {
    warnings.push({
      message: 'This donation qualifies for a Section 18A certificate but is missing the donor name, tax reference or consent, so no certificate can be issued. It is flagged for finance to follow up.',
    });
  }

  // Donor details without consent are not stored. POPIA requires a
  // lawful basis to process personal information, and the basis here
  // is the donor's consent — so if they did not give it, keeping their
  // name and number "just in case" is the violation. The donation is
  // still recorded in full; only the personal data is dropped.
  const consented = donorConsentGiven === true;
  if (!consented && (donorName || donorContact || donorTaxReference)) {
    warnings.push({
      message: 'Donor details were not saved because consent was not given. The donation itself is recorded.',
    });
  }

  const result = await donationModel.createDonation({
    category,
    programmeId,
    estimatedValueZar:    value,
    valueEstimated:       data?.valueEstimated === true,
    donorName:            consented ? (cleanName ? String(cleanName).trim() || null : null) : null,
    donorContact:         consented ? (cleanContact ? String(cleanContact).trim().toLowerCase() || null : null) : null,
    donorTaxReference:    consented ? (cleanTax ? String(cleanTax).trim() || null : null) : null,
    donorConsentGiven:    consented,
    notes:                (cleanNotes !== undefined && cleanNotes !== null ? String(cleanNotes).trim() : '') || null,
    idempotencyKey:       idempotencyKey || null,
    section18aStatus,
    section18aQualifying: toQualifyingFlag(section18aStatus),
    receivedBy:           userId,       // from the JWT — never trusted from the frontend
    items:                routed,
  });

  // Duplicate-prevention hint (warn, do not block): attach a fingerprint
  // so the frontend can warn on a likely double-capture.

  // Lost the ON CONFLICT race — another request wrote this key first.
  if (result.duplicate) {
    const existing = await donationModel.findByIdempotencyKey(idempotencyKey);
    const donation = existing ? await donationModel.getDonationById(existing.id) : null;
    return { donation, warnings: [], duplicate: true };
  }

  const donation = await donationModel.getDonationById(result.donationId);

  // Emails run after the donation is durably recorded and never roll it
  // back. A failure to send or log is surfaced in emailResults — the
  // donation completion is not affected.
  const emailResults = [];
  if (!result.duplicate) {
    // Genuinely non-blocking: anything the email path throws (settings,
    // PDF, cert write, logging) must never turn a recorded donation into
    // a 500 — the throw itself IS the failed attempt, so record it.
    let thankYou = null;
    try {
      // sendThankYouEmail → logEmailAttempt is the single Gmail send +
      // persist point (email.provider → gmail.service). It already
      // records SENT and FAILED rows itself — no second logDonationEmail
      // here, otherwise one send produces two history rows.
      thankYou = await sendThankYouEmail(donation, userId);
    } catch (err) {
      console.error('[createDonation:thankYouEmail]', err.message);
    }
    if (thankYou) emailResults.push(thankYou);

    // The Section 18A certificate email is sent only after the donor
    // completes the secure form and the PDF has been generated.
  }

  return {
    donation,
    warnings: [...warnings, ...(result.warnings || [])],
    duplicate: false,
    emailResults,
  };
};

// ── Reads ─────────────────────────────────────────────────────
const listDonations = async (range) => {
  const valid = ['today', 'week', 'month', 'all'];
  return await donationModel.listDonations(valid.includes(range) ? range : 'all');
};

const getDonationById = async (id) => {
  if (!id) fail(400, 'Donation ID is required.');
  const donation = await donationModel.getDonationById(id);
  if (!donation) fail(404, 'Donation not found.');
  return donation;
};

const getDonationEvents = async (id) => {
  if (!id) fail(400, 'Donation ID is required.');
  return await donationModel.getDonationEvents(id);
};

const listUnmatchedItems = async () => await donationModel.listUnmatchedItems();

const listSection18AQueue = async () => await donationModel.listSection18AQueue();

// ── Estimate a donation's value from its items ─────────────────
// Catalogue unit cost times quantity, for each line matched to a
// product with a cost and a unit that converts. Lines that cannot be
// priced are counted, so the screen can say what the figure leaves out.
// A suggestion for the person recording it; a manager verifies it.
const estimateDonationValue = async (data) => {
  const lines = (Array.isArray(data?.items) ? data.items : [])
    .map((i) => ({ productId: Number(i?.productId), quantity: Number(i?.quantity), unit: String(i?.unit ?? '').trim().toLowerCase() }));
  if (lines.length === 0) fail(400, 'Add the items before estimating their value.');

  const ids = [...new Set(lines.filter((l) => Number.isInteger(l.productId) && l.productId > 0).map((l) => l.productId))];
  const { products, sizes } = ids.length ? await donationModel.getProductCosts(ids) : { products: [], sizes: {} };
  const byId = new Map(products.map((p) => [Number(p.id), p]));

  let total = 0;
  let priced = 0;
  for (const line of lines) {
    const product = byId.get(line.productId);
    const cost = Number(product?.unit_cost);
    if (!product || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    const inCostUnit = convertQuantity(line.quantity, line.unit || product.default_unit, product.default_unit, sizes);
    if (inCostUnit === null) continue;
    total += inCostUnit * cost;
    priced += 1;
  }
  return { valueZar: Math.round(total * 100) / 100, pricedCount: priced, itemCount: lines.length };
};

// ── A manager verifies a donation's value (or corrects it) ─────
const verifyDonationValue = async (donationId, data, userId) => {
  const moneyCheck = validateMoney(data?.estimatedValueZar, { required: true, field: 'Value' });
  if (moneyCheck.error) fail(400, moneyCheck.error);
  const result = await donationModel.verifyDonationValue({ donationId: Number(donationId), valueZar: moneyCheck.value, actorId: userId });
  if (result.notFound) fail(404, 'Donation not found.');
  if (result.issued) fail(409, 'Its certificate has been issued, so its value can no longer change.');
  return result.donation;
};

// ── Resolve an unmatched line ─────────────────────────────────
const resolveUnmatchedItem = async (donationItemId, data, userId) => {
  const { productId, unit, locationId } = data || {};

  if (!donationItemId) fail(400, 'Donation item ID is required.');
  if (!productId)      fail(400, 'A stock item is required to resolve this line.');

  let normalisedUnit = null;
  if (unit) {
    normalisedUnit = String(unit).trim().toLowerCase();
    if (!ALLOWED_UNITS.includes(normalisedUnit))
      fail(400, `Unit "${unit}" is not one of: ${ALLOWED_UNITS.join(', ')}.`);
  }

  const result = await donationModel.resolveUnmatchedItem({
    donationItemId,
    productId:  Number(productId),
    unit:       normalisedUnit,
    locationId: locationId ? Number(locationId) : null,
    resolvedBy: userId,
  });

  if (result.itemNotFound)    fail(404, 'Donation line not found.');
  if (result.productNotFound) fail(404, 'Stock item not found.');
  if (result.notUnmatched)
    fail(409, `This line has already been resolved (status: ${result.currentStatus}).`);

  return result;
};

// ── Reclassify (BR-10 manager override) ───────────────────────
// A reason is mandatory. An override with no recorded reason is an
// audit row that says a manager changed something and nothing about
// why, which is the state the paper process was already in.
const reclassifyDonation = async (donationId, data, userId) => {
  const { category, reason } = data || {};

  if (!donationId) fail(400, 'Donation ID is required.');
  if (!category || !CATEGORIES.includes(category))
    fail(400, 'A valid donation category is required.');
  if (!reason || !String(reason).trim())
    fail(400, 'A reason is required to change a donation classification (BR-10).');

  const result = await donationModel.reclassifyDonation({
    donationId,
    category,
    reason:  String(reason).trim(),
    actorId: userId,
  });

  if (result.notFound)  fail(404, 'Donation not found.');
  if (result.unchanged) fail(400, 'The donation is already in that category.');

  // Flagged rather than performed. Stock that already moved under the
  // old category is not reversed here — see the repository comment.
  return {
    ...result,
    requiresStockReview: result.from === 'recipe_food' || result.to === 'recipe_food',
  };
};

export default {
  createDonation,
  estimateDonationValue,
  verifyDonationValue,
  listDonations,
  getDonationById,
  getDonationEvents,
  listUnmatchedItems,
  listSection18AQueue,
  listEmailHistory,
  resendDonationEmail,
  getSection18AFormByToken,
  submitSection18AForm,
  generateSection18ACertificate,
  downloadSection18ACertificate,
  resolveUnmatchedItem,
  reclassifyDonation,
  getSection18ASettings,
  updateSection18ASettings,
  CATEGORIES,
  ALLOWED_UNITS,
};
