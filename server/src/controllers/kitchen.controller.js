// ─────────────────────────────────────────────────────────────
// server/src/controllers/kitchen.controller.js
//
// Thin HTTP layer over kitchen.service.js.
// ─────────────────────────────────────────────────────────────
import kitchenService from '../services/kitchen.service.js';
import { sendError } from '../utils/httpError.js';

// GET /api/kitchens?includeInactive=
const listKitchens = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await kitchenService.listKitchens(req.query) });
  } catch (err) {
    console.error('[listKitchens]', err.message);
    sendError(res, err, 'Failed to load the kitchens.');
  }
};

// POST /api/kitchens  { kind, name, adultCount, contactName, contactPhone, address }
const createKitchen = async (req, res) => {
  try {
    res.status(201).json({ success: true, data: await kitchenService.createKitchen(req.body) });
  } catch (err) {
    console.error('[createKitchen]', err.message);
    sendError(res, err, 'Failed to add the kitchen.');
  }
};

// PATCH /api/kitchens/:id
const updateKitchen = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await kitchenService.updateKitchen(req.params.id, req.body) });
  } catch (err) {
    console.error('[updateKitchen]', err.message);
    sendError(res, err, 'Failed to save the kitchen.');
  }
};

export default { listKitchens, createKitchen, updateKitchen };
