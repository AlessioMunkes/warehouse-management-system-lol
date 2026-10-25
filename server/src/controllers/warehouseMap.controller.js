// ─────────────────────────────────────────────────────────────
// server/src/controllers/warehouseMap.controller.js
//
// Thin HTTP layer for the warehouse map. The rules are in
// warehouseMap.service.js; a refusal arrives carrying its status.
// ─────────────────────────────────────────────────────────────
import mapService from '../services/warehouseMap.service.js';
import { sendError } from '../utils/httpError.js';

const send = (res, label, fallback) => (err) => {
  console.error(`[${label}]`, err.message);
  sendError(res, err, fallback, { passThrough: [503] });
};

// GET /api/warehouse-map
const getMap = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await mapService.getMap() });
  } catch (err) {
    send(res, 'getWarehouseMap', 'Could not load the warehouse map.')(err);
  }
};

// PUT /api/warehouse-map/layout   Body: { areas: [{ id?, name, kind, x, y, w, h, levels }] }
const saveLayout = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await mapService.saveLayout(req.body, req.user.id) });
  } catch (err) {
    send(res, 'saveWarehouseLayout', 'Could not save the plan.')(err);
  }
};

// POST /api/warehouse-map/areas/:id/counts   Body: { lines: [{ productId, quantity }] }
const recordCount = async (req, res) => {
  try {
    res.status(201).json({ success: true, data: await mapService.recordCount(req.params.id, req.body, req.user.id) });
  } catch (err) {
    send(res, 'recordAreaCount', 'Could not save the count.')(err);
  }
};

export default { getMap, saveLayout, recordCount };
