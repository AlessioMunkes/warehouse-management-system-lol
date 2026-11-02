// ─────────────────────────────────────────────────────────────
// server/src/controllers/ftsDropPoint.controller.js
//
// Thin HTTP layer over ftsDropPoint.service.js: the sites and their
// drop-offs for staff, and the public QR form.
// ─────────────────────────────────────────────────────────────
import service from '../services/ftsDropPoint.service.js';
import { sendError } from '../utils/httpError.js';

const handle = (label, fallback, run, status = 200) => async (req, res) => {
  try {
    res.status(status).json({ success: true, data: await run(req) });
  } catch (err) {
    console.error(`[${label}]`, err.message);
    sendError(res, err, fallback);
  }
};

export default {
  // Staff
  listDropPoints:   handle('listFtsDropPoints', 'Failed to load the drop-off sites.', (req) => service.listDropPoints(req.query)),
  createDropPoint:  handle('createFtsDropPoint', 'Failed to add the drop-off site.', (req) => service.createDropPoint(req.body, req.user?.id), 201),
  updateDropPoint:  handle('updateFtsDropPoint', 'Failed to save the drop-off site.', (req) => service.updateDropPoint(req.params.id, req.body)),
  listDropoffs:     handle('listFtsDropoffs', 'Failed to load the drop-offs.', () => service.listDropoffs()),
  setDropoffStatus: handle('setFtsDropoffStatus', 'Failed to change the drop-off.', (req) => service.setDropoffStatus(req.params.id, req.body, req.user?.id)),
  // Public, behind the QR code
  getPublicSite:    handle('getFtsDropSite', 'Could not open this drop-off form.', (req) => service.getPublicSite(req.params.token)),
  submitDropoff:    handle('submitFtsDropoff', 'Could not record your drop-off. Please try again.', (req) => service.submitDropoff(req.params.token, req.body), 201),
  // Public, behind the general poster
  getPublicSites:   handle('getFtsDropSites', 'Could not open this drop-off form.', () => service.getPublicSites()),
  submitAnyDropoff: handle('submitFtsAnyDropoff', 'Could not record your drop-off. Please try again.', (req) => service.submitAnyDropoff(req.body), 201),
};
