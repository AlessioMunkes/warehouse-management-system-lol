// ─────────────────────────────────────────────────────────────
// server/src/controllers/impactMap.controller.js
//
// Thin HTTP layer for the Impact map and Centre locations. The rules
// are in impactMap.service.js and centreLocation.service.js; a refusal
// arrives carrying its status.
// ─────────────────────────────────────────────────────────────
import impactService from '../services/impactMap.service.js';
import locationService from '../services/centreLocation.service.js';

const failWith = (res, label, fallback) => (err) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({ success: false, message: status < 500 ? err.message : fallback });
};

// GET /api/impact-map?from=YYYY-MM-DD&to=YYYY-MM-DD
const getImpactMap = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await impactService.getImpactMap(req.query) });
  } catch (err) {
    failWith(res, 'getImpactMap', 'Could not load the impact map.')(err);
  }
};

// GET /api/centre-locations
const listLocations = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await locationService.listLocations() });
  } catch (err) {
    failWith(res, 'listCentreLocations', 'Could not load the centre locations.')(err);
  }
};

// PATCH /api/centre-locations/:id   Body: { address, suburb, lat, lng }
const setLocation = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await locationService.setLocation(req.params.id, req.body, req.user.id) });
  } catch (err) {
    failWith(res, 'setCentreLocation', 'Could not save the location.')(err);
  }
};

export default { getImpactMap, listLocations, setLocation };
