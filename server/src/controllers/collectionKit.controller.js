// ─────────────────────────────────────────────────────────────
// server/src/controllers/collectionKit.controller.js
//
// Thin HTTP layer over collectionKit.service.js. Same fail()/.status
// convention as communityRequest.controller.js.
// ─────────────────────────────────────────────────────────────
import kitService from '../services/collectionKit.service.js';

// PASS_THROUGH matches reporting.controller.js's own convention: a
// raw 500 hides its message because it might leak internals, but 503
// (collection_kits/collection_kit_records not migrated yet — see
// collectionKit.service.js's runOrMissingTable) is a deliberately
// actionable message, not a fault to hide. Without this, the 503's
// whole point — telling staff the table isn't set up yet instead of
// a bare "Failed to load" — was silently thrown away.
const PASS_THROUGH = new Set([502, 503, 504]);

const send = (res, err, fallback) => {
  const status = err.status || 500;
  const showMessage = status < 500 || PASS_THROUGH.has(status);
  res.status(status).json({ success: false, message: showMessage ? err.message : fallback });
};

// POST /api/collection-kits — assign a new kit to an owner
const createKit = async (req, res) => {
  try {
    const kit = await kitService.createKit(req.body, req.user?.id);
    res.status(201).json({ success: true, data: kit });
  } catch (err) {
    console.error('[createKit]', err.message);
    send(res, err, 'Failed to assign the kit.');
  }
};

// GET /api/collection-kits?search=
const listKits = async (req, res) => {
  try {
    const kits = await kitService.listKits(req.query);
    res.status(200).json({ success: true, data: kits });
  } catch (err) {
    console.error('[listKits]', err.message);
    send(res, err, 'Failed to load kits.');
  }
};

// GET /api/collection-kits/:id
const getKit = async (req, res) => {
  try {
    const kit = await kitService.getKit(req.params.id);
    res.status(200).json({ success: true, data: kit });
  } catch (err) {
    console.error('[getKit]', err.message);
    send(res, err, 'Failed to load the kit.');
  }
};

// GET /api/collection-kits/records?status=logged|dispatched&search=
const listRecords = async (req, res) => {
  try {
    const records = await kitService.listRecords(req.query);
    res.status(200).json({ success: true, data: records });
  } catch (err) {
    console.error('[listRecords]', err.message);
    send(res, err, 'Failed to load compost records.');
  }
};

// GET /api/collection-kits/records/:recordId
const getRecord = async (req, res) => {
  try {
    const record = await kitService.getRecord(req.params.recordId);
    res.status(200).json({ success: true, data: record });
  } catch (err) {
    console.error('[getRecord]', err.message);
    send(res, err, 'Failed to load this record.');
  }
};

// POST /api/collection-kits/:id/records — log a compost weigh-in
const logCompost = async (req, res) => {
  try {
    const record = await kitService.logCompost(req.params.id, req.body, req.user?.id);
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error('[logCompost]', err.message);
    send(res, err, 'Failed to log the compost collected.');
  }
};

// PATCH /api/collection-kits/records/:recordId/dispatch
const markDispatched = async (req, res) => {
  try {
    const record = await kitService.markDispatched(req.params.recordId, req.body, req.user?.id);
    res.status(200).json({ success: true, data: record });
  } catch (err) {
    console.error('[markDispatched]', err.message);
    send(res, err, 'Failed to mark this record dispatched.');
  }
};

export default { createKit, listKits, getKit, getRecord, listRecords, logCompost, markDispatched };
