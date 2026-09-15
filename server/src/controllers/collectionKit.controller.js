// ─────────────────────────────────────────────────────────────
// server/src/controllers/collectionKit.controller.js
//
// Thin HTTP layer over collectionKit.service.js. Same fail()/.status
// convention as communityRequest.controller.js.
// ─────────────────────────────────────────────────────────────
import kitService from '../services/collectionKit.service.js';

const send = (res, err, fallback) => {
  const status = err.status || 500;
  res.status(status).json({ success: false, message: status < 500 ? err.message : fallback });
};

// GET /api/collection-kits?status=out|returned
const listKits = async (req, res) => {
  try {
    const kits = await kitService.listKits(req.query);
    res.status(200).json({ success: true, data: kits });
  } catch (err) {
    console.error('[listKits]', err.message);
    send(res, err, 'Failed to load collection kits.');
  }
};

// POST /api/collection-kits
const logKitOut = async (req, res) => {
  try {
    const kit = await kitService.logKitOut(req.body, req.user?.id);
    res.status(201).json({ success: true, data: kit });
  } catch (err) {
    console.error('[logKitOut]', err.message);
    send(res, err, 'Failed to log the kit.');
  }
};

// PATCH /api/collection-kits/:id/return
const markReturned = async (req, res) => {
  try {
    const kit = await kitService.markReturned(req.params.id, req.body, req.user?.id);
    res.status(200).json({ success: true, data: kit });
  } catch (err) {
    console.error('[markReturned]', err.message);
    send(res, err, 'Failed to mark the kit returned.');
  }
};

export default { listKits, logKitOut, markReturned };
