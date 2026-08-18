// ─────────────────────────────────────────────────────────────
// server/src/controllers/donation.controller.js
//
// Thin HTTP layer for donation intake. All business logic and
// validation lives in donation.service.js — controllers here only
// pull data off the request, call the service, and shape the response.
//
// Error handling: donation.service.js attaches a `.status` to every
// error it throws (see the `fail()` helper at the top of that file),
// so every catch block below reads `err.status` directly, the same
// convention picking.controller.js and stock.controller.js use.
// Unrecognised errors (no `.status`, e.g. a DB blew up) fall back to
// 500 with a generic message so we never leak internals to the client.
// ─────────────────────────────────────────────────────────────
import donationService from '../services/donation.service.js';

// ── List donations ───────────────────────────────────────────
// GET /api/donations?range=today|week|month|all
// Returns: donation summary rows for the given range (service
// defaults to 'all' when range is missing or not recognised).
const listDonations = async (req, res) => {
  try {
    const donations = await donationService.listDonations(req.query.range);
    res.status(200).json({ success: true, data: donations });
  } catch (err) {
    console.error('[listDonations]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve donations.',
    });
  }
};

// ── Record a donation ────────────────────────────────────────
// POST /api/donations
// Body: { category, estimatedValueZar, items[], programmeCode?,
//         donorName?, donorContact?, donorTaxReference?,
//         donorConsentGiven?, notes?, idempotencyKey? }
// Returns: { donation, warnings, duplicate }.
// 201 for a newly recorded donation; 200 (not an error) for a
// retried submit — the gate must never tell staff a duplicate tap
// failed, that's the whole point of the idempotency key.
const createDonation = async (req, res) => {
  try {
    // req.user.id only, from the JWT — never trusted from the body
    // (the service ignores any receivedBy the client sends).
    const result = await donationService.createDonation(req.body, req.user.id);
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    console.error('[createDonation]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to record donation.',
    });
  }
};

// ── The manager's unmatched-item queue ───────────────────────
// GET /api/donations/unmatched
// Returns: donation lines recorded with no product match yet.
const listUnmatchedItems = async (req, res) => {
  try {
    const items = await donationService.listUnmatchedItems();
    res.status(200).json({ success: true, data: items });
  } catch (err) {
    console.error('[listUnmatchedItems]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve unmatched donation items.',
    });
  }
};

// ── Finance's Section 18A work queue ─────────────────────────
// GET /api/donations/section-18a
// Returns: donations that qualify for a certificate, queued or
// pending donor details.
const listSection18AQueue = async (req, res) => {
  try {
    const queue = await donationService.listSection18AQueue();
    res.status(200).json({ success: true, data: queue });
  } catch (err) {
    console.error('[listSection18AQueue]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve the Section 18A queue.',
    });
  }
};

// ── Resolve an unmatched line ────────────────────────────────
// PATCH /api/donations/items/:itemId/resolve
// Body: { productId, unit?, locationId? }
// Returns: { resolved, movedStock, stockOutcome }.
const resolveUnmatchedItem = async (req, res) => {
  try {
    const result = await donationService.resolveUnmatchedItem(req.params.itemId, req.body, req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[resolveUnmatchedItem]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to resolve donation item.',
    });
  }
};

// ── One donation ──────────────────────────────────────────────
// GET /api/donations/:id
// Returns: a single donation with its items and allocations attached.
const getDonationById = async (req, res) => {
  try {
    const donation = await donationService.getDonationById(req.params.id);
    res.status(200).json({ success: true, data: donation });
  } catch (err) {
    console.error('[getDonationById]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve donation.',
    });
  }
};

// ── Audit trail for one donation ─────────────────────────────
// GET /api/donations/:id/events
// Returns: audit_log rows for this donation, oldest first.
const getDonationEvents = async (req, res) => {
  try {
    const events = await donationService.getDonationEvents(req.params.id);
    res.status(200).json({ success: true, data: events });
  } catch (err) {
    console.error('[getDonationEvents]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve donation history.',
    });
  }
};

// ── Reclassify a donation (BR-10 manager override) ──────────
// PATCH /api/donations/:id/classification
// Body: { category, reason }
// Returns: { reclassified, from, to, requiresStockReview }.
const reclassifyDonation = async (req, res) => {
  try {
    const result = await donationService.reclassifyDonation(req.params.id, req.body, req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[reclassifyDonation]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to reclassify donation.',
    });
  }
};

export default {
  listDonations,
  createDonation,
  listUnmatchedItems,
  listSection18AQueue,
  resolveUnmatchedItem,
  getDonationById,
  getDonationEvents,
  reclassifyDonation,
};
