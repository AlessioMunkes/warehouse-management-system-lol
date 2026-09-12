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
import { determineRouting } from '../lib/donationRouting.js';
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
} from '../lib/validation/donationIntake.js';
import donationModel from '../repositories/donation.repository.js';
import certificateSettingsService from './certificateSettings.service.js';
import emailProvider from '../providers/email.provider.js';
import pdfProvider from '../providers/pdf.provider.js';

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
export const CATEGORIES = ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'];

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

// The three programme codes in the live programmes table.
export const PROGRAMME_CODES = ['NOC', 'FTS', 'LOVE_ACTIVISM'];

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
    category, programmeCode, estimatedValueZar, donorName, donorContact,
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

  // ── Programme ───────────────────────────────────────────────
  // Optional: donations.programme_id is nullable, and a donor at the
  // gate does not always map cleanly onto one programme. Resolved from
  // a code rather than accepting an id from the body, so a malformed
  // id cannot reach the FK.
  let programmeId = null;
  if (programmeCode) {
    const programme = await donationModel.getProgrammeByCode(String(programmeCode).trim());
    if (!programme) fail(400, `Unknown programme code "${programmeCode}".`);
    programmeId = programme.id;
  }

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

    let section18a = null;
    try {
      section18a = await sendSection18ACertificateEmail(donation, userId);
    } catch (err) {
      console.error('[createDonation:section18aEmail]', err.message);
    }
    if (section18a) emailResults.push(section18a);
  }

  return {
    donation,
    warnings: [...warnings, ...(result.warnings || [])],
    duplicate: false,
    emailResults,
  };
};

// ─────────────────────────────────────────────────────────────
// Donation emails (thank-you + Section 18A certificate)
//
// Both emails run AFTER the donation is durably recorded and never
// roll it back. A failure to send or log is surfaced in emailResults
// for the caller, exactly the "record first, notify second" shape the
// rest of this file follows. Anonymous donors and donors without a
// valid email are simply skipped, not errored.
// ─────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const donorEmailFor = (donation) => {
  const email = String(donation?.donor_contact || '').trim();
  if (!email || !EMAIL_RE.test(email)) return null;
  return email;
};

// Logs one send attempt. This is the SINGLE Gmail send + persist point
// for Donation emails: email.provider.sendEmail (→ gmail.service.sendEmail)
// is called only here, and every outcome — SENT and FAILED — is written
// via donationModel.logDonationEmail. Callers must not add their own
// logDonationEmail fallback or one send produces two history rows.
const logEmailAttempt = async ({ donation, donationId, donorId = null, certificateId = null, emailType, recipient, recipientName = null, subject, email, sentByUserId = null }) => {
  const resolvedDonationId = donation?.id ?? donationId;
  const resolvedRecipientName = recipientName || donation?.donor_name || null;
  const resolvedDonorId = donorId ?? donation?.donor_id ?? null;
  try {
    const result = await emailProvider.sendEmail({
      to: recipient,
      subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    }, null);
    const success = Boolean(result && result.sent === true);
    return await donationModel.logDonationEmail({
      donationId: resolvedDonationId,
      donorId: resolvedDonorId,
      certificateId,
      emailType,
      recipient,
      recipientEmail: recipient,
      recipientName: resolvedRecipientName,
      subject,
      status: success ? 'sent' : 'failed',
      providerMessageId: success ? (result.messageId || null) : null,
      gmailMessageId: success ? (result.messageId || null) : null,
      gmailThreadId: success ? (result.threadId || null) : null,
      errorMessage: success ? null : (result.reason || result.error || 'Provider reported a failure.'),
      sentByUserId,
    });
  } catch (err) {
    return await donationModel.logDonationEmail({
      donationId: resolvedDonationId,
      donorId: resolvedDonorId,
      certificateId,
      emailType,
      recipient,
      recipientEmail: recipient,
      recipientName: resolvedRecipientName,
      subject,
      status: 'failed',
      errorMessage: err.message,
      sentByUserId,
    });
  }
};

// ── Email helpers ───────────────────────────────────────────────
// Brand colours (from client/src/styles/staff.css) used for inline styles
const BRAND = {
  ink: '#2b3336',
  inkDeep: '#171b1c',
  accent: '#ef3a40',
  accentDeep: '#d42d33',
  gold: '#979168',
  goldDeep: '#8a8058',
  sand: '#e9e3dd',
  border: '#ddd4c8',
  text: '#5c5c5c',
  textSub: '#6f6a5e',
  textMeta: '#8b8578',
  white: '#ffffff',
  accentDeep: '#d42d33',
  goldDeep: '#8a8058',
  attention: '#8a3227',
  attentionBg: '#f6efe9',
  attentionBorder: '#e2d3c6',
  fontDisplay: '"Montserrat", "Inter", system-ui, -apple-system, sans-serif',
  fontSans: '"Inter", system-ui, -apple-system, sans-serif',
  radius: '12px',
  radiusSm: '8px',
};

const buildEmailLayout = ({ title, body, footer }) => {
  const style = `
    margin:0;padding:0;font-family:${BRAND.fontSans};background:${BRAND.sand};color:${BRAND.text};line-height:1.6;
  `;
  const container = `
    max-width:600px;margin:0 auto;padding:24px;background:${BRAND.white};border-radius:${BRAND.radius};border:1px solid ${BRAND.border};
  `;
  const header = `
    padding:24px 24px 16px;border-bottom:1px solid ${BRAND.border};text-align:center;
  `;
  const titleStyle = `
    margin:0;font-family:${BRAND.fontDisplay};font-size:24px;font-weight:700;color:${BRAND.ink};
  `;
  const bodyStyle = `
    padding:24px;color:${BRAND.text};font-size:16px;line-height:1.7;
  `;
  const footerStyle = `
    padding:16px 24px;border-top:1px solid ${BRAND.border};text-align:center;font-size:13px;color:${BRAND.textMeta};
  `;
  const linkStyle = `color:${BRAND.accent};text-decoration:none;`;
  const buttonStyle = `
    display:inline-block;padding:12px 24px;background:${BRAND.accent};color:${BRAND.white};
    border-radius:${BRAND.radiusSm};font-weight:600;text-decoration:none;
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="${style}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${container}">
          <tr>
            <td style="${header}">
              <h1 style="${titleStyle}">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="${bodyStyle}">${body}</td>
          </tr>
          <tr>
            <td style="${footerStyle}">${footer}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const getRoutingMessage = (category) => {
  switch (category) {
    case 'recipe_food':
      return 'Your donation will help us prepare nutritious cooked meals that will be served to people and families in our communities.';
    case 'non_recipe_food':
      return 'Your donation will be sorted and packed into food parcels that support vulnerable households and community organisations.';
    case 'add_on_food':
      return 'Your donation will be combined with other essential food items to create complete food parcels for families in need.';
    case 'non_food':
      return 'Your donation will support our programmes with essential everyday items that help our beneficiaries beyond food alone.';
    default:
      return 'Your donation will be used where it is needed most.';
  }
};

const generateThankYouEmailContent = (donation) => {
  const donorName = donation.donor_name || 'Friend';
  const reference = donationReferenceFor(donation);
  const routingMessage = getRoutingMessage(donation.donation_category);

  const text = `Dear ${donorName},\n\nThank you for your generous donation (reference ${reference}).\n\n${routingMessage}\n\nYour support helps Ladles of Love continue its work.\n\nWarm regards,\nLadles of Love`;

  const body = `
    <p style="margin:0 0 16px;font-size:16px;">Dear ${donorName},</p>
    <p style="margin:0 0 16px;font-size:16px;">Thank you for your generous donation (reference <strong>${reference}</strong>).</p>
    <p style="margin:0 0 16px;font-size:16px;">${routingMessage}</p>
    <p style="margin:0 0 16px;font-size:16px;">Your support helps Ladles of Love continue its work.</p>
    <p style="margin:0 0 8px;font-size:16px;">Warm regards,</p>
    <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND.ink};">Ladles of Love</p>
  `;

  const footer = `Sent by Ladles of Love · ${new Date().toLocaleDateString()}`;

  const html = buildEmailLayout({
    title: 'Thank you for your donation',
    body,
    footer,
  });

  return { text: `Dear ${donorName},\n\nThank you for your generous donation (reference ${reference}).\n\n${routingMessage}\n\nYour support helps Ladles of Love continue its work.\n\nWarm regards,\nLadles of Love`, html };
};

const generateSection18ACertificateEmailContent = (donation, certificate, settings) => {
  const donorName = donation.donor_name || 'Donor';
  const certNumber = certificate.certificate_number;
  const orgName = settings?.organisation_name || 'Ladles of Love';
  const pboName = settings?.pbo_name || '';
  const pboNumber = settings?.pbo_number || '';
  const section18aRef = settings?.section18a_reference || '';
  const orgAddress = settings?.organisation_address || '';
  const contactEmail = settings?.contact_email || '';
  const contactPhone = settings?.contact_phone || '';

  const text = `Dear ${donorName},\n\nThank you for your generous support of ${orgName}.\n\nYour donation qualified for a Section 18A tax certificate. Please find your certificate (${certNumber}) attached as a PDF.\n\nThis certificate may be used when preparing your South African tax return, where applicable.\n\nIf you have any questions or notice any issues with the certificate, please contact us:\n${orgName}\n${orgAddress}\nEmail: ${contactEmail}\nPhone: ${contactPhone}\n\nWarm regards,\n${orgName}`;

  const body = `
    <p style="margin:0 0 16px;font-size:16px;">Dear ${donorName},</p>
    <p style="margin:0 0 16px;font-size:16px;">Thank you for your generous support of <strong>${orgName}</strong>.</p>
    <p style="margin:0 0 16px;font-size:16px;">Your donation qualified for a Section 18A tax certificate. Please find your certificate (<strong>${certNumber}</strong>) attached as a PDF.</p>
    <p style="margin:0 0 16px;font-size:16px;">This certificate may be used when preparing your South African tax return, where applicable.</p>
    <p style="margin:0 0 16px;font-size:16px;">If you have any questions or notice any issues with the certificate, please contact us:</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:16px;">
      <li>${orgName}</li>
      ${orgAddress ? `<li>${orgAddress}</li>` : ''}
      ${contactEmail ? `<li>Email: <a href="mailto:${contactEmail}" style="color:${BRAND.accent};">${contactEmail}</a></li>` : ''}
      ${contactPhone ? `<li>Phone: ${contactPhone}</li>` : ''}
    </ul>
    <p style="margin:0 0 8px;font-size:16px;">Warm regards,</p>
    <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND.ink};">${orgName}</p>
  `;

  const footer = `
    <p style="margin:0 0 8px;font-size:13px;color:${BRAND.textMeta};">${orgName}</p>
    ${pboName ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">PBO: ${pboName}</p>` : ''}
    ${pboNumber ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">PBO Number: ${pboNumber}</p>` : ''}
    ${section18aRef ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">Section 18A Reference: ${section18aRef}</p>` : ''}
    ${orgAddress ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">${orgAddress}</p>` : ''}
    ${contactEmail ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">Email: <a href="mailto:${contactEmail}" style="${ 'color:'+BRAND.accent+';text-decoration:none;' }">${contactEmail}</a></p>` : ''}
    ${contactPhone ? `<p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMeta};">Phone: ${contactPhone}</p>` : ''}
  `;

  const html = buildEmailLayout({
    title: 'Your Section 18A tax certificate',
    body,
    footer,
  });

  return {
    text: `Dear ${donorName},\n\nThank you for your generous support of ${orgName}.\n\nYour donation qualified for a Section 18A tax certificate. Please find your certificate (${certNumber}) attached as a PDF.\n\nThis certificate may be used when preparing your South African tax return, where applicable.\n\nIf you have any questions or notice any issues with the certificate, please contact us:\n${orgName}\n${orgAddress}\nEmail: ${contactEmail}\nPhone: ${contactPhone}\n\nWarm regards,\n${orgName}`,
    html,
    attachments: [{
      filename: certificate.pdf_filename,
      content: certificate.pdf_content,
      contentType: certificate.pdf_content_type,
    }],
  };
};

const donationReferenceFor = (donation) =>
  donation.section_18a_certificate_ref || `DON-${donation.id}`;

const sendThankYouEmail = async (donation, sentByUserId = null) => {
  const recipient = donorEmailFor(donation);
  if (!recipient) return null;
  const emailContent = generateThankYouEmailContent(donation);
  return await logEmailAttempt({
    donation,
    donationId: donation.id,
    emailType: 'thank_you',
    recipient,
    subject: 'Thank you for your donation',
    email: {
      text: emailContent.text,
      html: emailContent.html,
    },
    sentByUserId,
  });
};
// Returns the existing certificate for the donation, or creates a new
// one if none exists yet. Never regenerates one that is already there.
const getOrCreateSection18ACertificate = async (donation, actorId) => {
  const existing = await donationModel.getSection18ACertificateByDonationId(donation.id);
  if (existing) return existing;
  // Load organisation settings from the dedicated certificate settings service.
  // This ensures we use the persistent, database-backed settings from
  // certificate_settings table instead of hardcoded values.
  const settings = await certificateSettingsService.getSettings();

  const donorSnapshot = {
    name:         donation.donor_name,
    contact:      donation.donor_contact,
    taxReference: donation.donor_tax_reference,
  };
  const donationSnapshot = {
    id:                  donation.id,
    donation_category:   donation.donation_category,
    estimated_value_zar: donation.estimated_value_zar,
    received_at:         donation.received_at,
    items:               donation.items || [],
  };

  const { certificate } = await donationModel.createSection18ACertificate({
    donationId:   donation.id,
    issuedBy:     actorId,
    settings,
    donorSnapshot,
    donationSnapshot,
    buildPdf: async ({ certificateNumber, issueDate }) =>
      pdfProvider.generateSection18APdf({
        certificateNumber,
        issueDate,
        settings,
        donor:     donorSnapshot,
        donation:  donationSnapshot,
      }),
  });

  return certificate;
};

const sendSection18ACertificateEmail = async (donation, actorId) => {
  if (donation.section_18a_status !== 'queued' && donation.section_18a_status !== 'issued') {
    return null;
  }
  const recipient = donorEmailFor(donation);
  if (!recipient) return null;

  // Certificate creation touches the PDF lib, settings and a DB write, and
  // can throw (misconfigured settings, PDF failure). That must surface as a
  // failed email-log row — recoverable via the email-history resend path —
  // and never as an uncaught exception that 500s the recorded donation.
  // This logDonationEmail is the only direct write outside logEmailAttempt:
  // it covers the pre-send failure where there is no Gmail attempt to log.
  let certificate;
  try {
    certificate = await getOrCreateSection18ACertificate(donation, actorId);
  } catch (err) {
    return await donationModel.logDonationEmail({
      donation,
      donationId: donation.id,
      emailType: 'section18a_certificate',
      recipient,
      recipientEmail: recipient,
      recipientName: donation.donor_name || null,
      subject: 'Your Section 18A tax certificate',
      status: 'FAILED',
      errorMessage: err.message,
      sentByUserId: actorId ?? null,
    });
  }

  const settings = await donationModel.getSection18ASettings();
  const emailContent = generateSection18ACertificateEmailContent(donation, certificate, settings);

  return await logEmailAttempt({
    donation,
    donationId:    donation.id,
    certificateId: certificate.id,
   emailType: 'section18a_certificate',
    recipient,
    subject: 'Your Section 18A tax certificate',
    email: emailContent,
    sentByUserId: actorId ?? null,
  });
};

const generateSection18ACertificate = async (donationId, userId) => {
  const donation = await donationModel.getDonationById(donationId);
  if (!donation) fail(404, 'Donation not found.');

  if (await donationModel.getSection18ACertificateByDonationId(donationId)) {
    fail(409, 'A Section 18A certificate already exists for this donation.');
  }
  if (!donation.donor_consent_given || !String(donation.donor_tax_reference || '').trim()) {
    fail(400, 'Donor consent and tax reference are required to issue a certificate.');
  }
  if (donation.section_18a_status !== 'queued' && donation.section_18a_status !== 'issued') {
    fail(400, 'This donation is not ready for a Section 18A certificate.');
  }

  return await getOrCreateSection18ACertificate(donation, userId);
};

const downloadSection18ACertificate = async (donationId) => {
  const certificate = await donationModel.getSection18ACertificateByDonationId(donationId);
  if (!certificate) fail(404, 'No Section 18A certificate exists for this donation.');
  return {
    buffer:            certificate.pdf_content,
    filename:          certificate.pdf_filename,
    contentType:       certificate.pdf_content_type,
    certificateNumber: certificate.certificate_number,
  };
};

const listEmailHistory = async ({ search = null, emailType = null, status = null, limit = 200, offset = 0 } = {}) =>
  // History is served from the database only — Gmail is never queried.
  await donationModel.listEmailHistory({ search, emailType, status, limit, offset });

const normaliseEmailType = (value) => {
  const v = String(value || '');
  if (v === 'thank_you' || v === 'THANK_YOU') return 'THANK_YOU';
  if (v === 'section18a_certificate' || v === 'SECTION_18A') return 'SECTION_18A';
  return v;
};

const resendDonationEmail = async (emailLogId, userId) => {
  const log = await donationModel.getEmailLogById(emailLogId);
  if (!log) fail(404, 'Email log not found.');

  const donation = await donationModel.getDonationById(log.donation_id);
  if (!donation) fail(404, 'Donation not found.');

  const emailType = normaliseEmailType(log.email_type);

  if (emailType === 'THANK_YOU') {
    const sent = await sendThankYouEmail(donation, null);
    return { ...log, ...(sent || {}), emailType };
  }
  if (emailType === 'SECTION_18A') {
    const sent = await sendSection18ACertificateEmail(donation, userId);
    return { ...log, ...(sent || {}), emailType };
  }

  fail(400, `Cannot resend email of unsupported type "${log.email_type}".`);
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

// ── Section 18A Certificate Settings ─────────────────────────
// Single-row settings table (id = 1). getSettings returns the current
// configuration; updateSettings validates and persists changes.
const getSection18ASettings = async () => {
  const settings = await donationModel.getSection18ASettings();
  if (!settings) {
    fail(404, 'Section 18A settings have not been initialized.');
  }
  return settings;
};

const updateSection18ASettings = async (payload) => {
  // Validate email format if provided
  if (payload.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contactEmail)) {
    fail(400, 'Invalid contact email format.');
  }

  const settings = await donationModel.updateSection18ASettings({
    organisationName: payload.organisationName,
    organisationAddress: payload.organisationAddress,
    contactName: payload.contactName,
    contactEmail: payload.contactEmail,
    contactPhone: payload.contactPhone,
    pbaDeclaration: payload.pbaDeclaration,
    certificatePrefix: payload.certificatePrefix,
  });

  return settings;
};

export default {
  createDonation,
  listDonations,
  getDonationById,
  getDonationEvents,
  listUnmatchedItems,
  listSection18AQueue,
  listEmailHistory,
  resendDonationEmail,
  generateSection18ACertificate,
  downloadSection18ACertificate,
  resolveUnmatchedItem,
  reclassifyDonation,
  getSection18ASettings,
  updateSection18ASettings,
  CATEGORIES,
  ALLOWED_UNITS,
  PROGRAMME_CODES,
};
