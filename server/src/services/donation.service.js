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
import donationModel from '../repositories/donation.repository.js';
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

  return { productId, description, quantity, unit, locationId, estimatedValueZar };
};

// ── Create a donation ─────────────────────────────────────────
const createDonation = async (data, userId) => {
  const {
    category, programmeCode, estimatedValueZar, donorName, donorContact,
    donorTaxReference, donorConsentGiven, notes, idempotencyKey, items,
  } = data || {};

  // ── The three required fields, and nothing else ─────────────
  if (!category || !CATEGORIES.includes(category))
    fail(400, 'A donation category is required.');

  if (estimatedValueZar === undefined || estimatedValueZar === null || estimatedValueZar === '')
    fail(400, 'An estimated value is required (BR-09). Enter 0 if the donation has no assessable value.');

  const value = Number(estimatedValueZar);
  if (!Number.isFinite(value) || value < 0)
    fail(400, 'Estimated value must be zero or more.');

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
    estimatedValueZar: value, donorName, donorTaxReference, donorConsentGiven, threshold,
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
    donorName:            consented ? (String(donorName || '').trim() || null) : null,
    donorContact:         consented ? (String(donorContact || '').trim() || null) : null,
    donorTaxReference:    consented ? (String(donorTaxReference || '').trim() || null) : null,
    donorConsentGiven:    consented,
    notes:                String(notes || '').trim() || null,
    idempotencyKey:       idempotencyKey || null,
    section18aStatus,
    section18aQualifying: toQualifyingFlag(section18aStatus),
    receivedBy:           userId,       // from the JWT — never trusted from the frontend
    items:                routed,
  });

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
    const thankYou = await sendThankYouEmail(donation);
    if (thankYou) emailResults.push(thankYou);
    const section18a = await sendSection18ACertificateEmail(donation, userId);
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

// Logs one send attempt. Sending and logging are deliberately wrapped
// so a throwing provider (or a broken Gmail binding) records a 'failed'
// row instead of bubbling up and taking the donation down with it.
const logEmailAttempt = async ({ donationId, certificateId, emailType, recipient, subject, email }) => {
  try {
    const result = await emailProvider.sendEmail({
      to: recipient,
      subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    });
    const success = Boolean(result && result.sent === true);
    return await donationModel.logDonationEmail({
      donationId,
      certificateId,
      emailType,
      recipient,
      subject,
      status: success ? 'sent' : 'failed',
      providerMessageId: success ? (result.messageId || null) : null,
      errorMessage: success ? null : (result.reason || 'Provider reported a failure.'),
    });
  } catch (err) {
    return await donationModel.logDonationEmail({
      donationId,
      certificateId,
      emailType,
      recipient,
      subject,
      status: 'failed',
      errorMessage: err.message,
    });
  }
};

const donationReferenceFor = (donation) =>
  donation.section_18a_certificate_ref || `DON-${donation.id}`;

const sendThankYouEmail = async (donation) => {
  const recipient = donorEmailFor(donation);
  if (!recipient) return null;
  return await logEmailAttempt({
    donationId: donation.id,
    emailType: 'thank_you',
    recipient,
    subject: 'Thank you for your donation',
    email: {
      text: `Dear ${donation.donor_name},\n\n` +
            `Thank you for your generous donation (reference ${donationReferenceFor(donation)}).\n\n` +
            'Your support helps Ladles of Love continue its work.\n\nWarm regards,\nLadles of Love',
    },
  });
};
// Returns the existing certificate for the donation, or creates a new
// one if none exists yet. Never regenerates one that is already there.
const getOrCreateSection18ACertificate = async (donation, actorId) => {
  const existing = await donationModel.getSection18ACertificateByDonationId(donation.id);
  if (existing) return existing;

  const settings = await donationModel.getSection18ASettings();
  if (!settings) fail(500, 'Section 18A settings are not configured.');

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

  const certificate = await getOrCreateSection18ACertificate(donation, actorId);

  return await logEmailAttempt({
    donationId:    donation.id,
    certificateId: certificate.id,
    emailType: 'section18a_certificate',
    recipient,
    subject: 'Your Section 18A tax certificate',
    email: {
      text: `Dear ${donation.donor_name},\n\n` +
            `Please find attached your Section 18A tax receipt (${certificate.certificate_number}).\n\n` +
            'Keep it for your tax records.\n\nWarm regards,\nLadles of Love',
      attachments: [{
        filename:    certificate.pdf_filename,
        content:     certificate.pdf_content,
        contentType: certificate.pdf_content_type,
      }],
    },
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

const listEmailHistory = async () => await donationModel.listEmailHistory();

const resendDonationEmail = async (emailLogId, userId) => {
  const log = await donationModel.getEmailLogById(emailLogId);
  if (!log) fail(404, 'Email log not found.');

  const donation = await donationModel.getDonationById(log.donation_id);
  if (!donation) fail(404, 'Donation not found.');

  if (log.email_type === 'thank_you') {
    const sent = await sendThankYouEmail(donation);
    return { ...log, ...(sent || {}), emailType: log.email_type };
  }
  if (log.email_type === 'section18a_certificate') {
    const sent = await sendSection18ACertificateEmail(donation, userId);
    return { ...log, ...(sent || {}), emailType: log.email_type };
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
  CATEGORIES,
  ALLOWED_UNITS,
  PROGRAMME_CODES,
};