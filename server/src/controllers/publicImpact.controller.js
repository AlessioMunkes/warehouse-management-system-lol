// ─────────────────────────────────────────────────────────────
// server/src/controllers/publicImpact.controller.js
//
// One route, no auth — see publicImpact.service.js for why this is
// its own small file rather than a route on reporting.routes.js.
// ─────────────────────────────────────────────────────────────
import publicImpactService from '../services/publicImpact.service.js';

// GET /api/public/impact-summary
const getSummary = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: await publicImpactService.getPublicImpactSummary() });
  } catch (err) {
    // Every per-metric query already falls back to 0 inside the
    // service (safeTotal), so reaching here means something more
    // fundamental (the database itself unreachable) — no message
    // detail is safe to show an unauthenticated caller for that.
    console.error('[publicImpact.getSummary]', err.message);
    res.status(500).json({ success: false, message: 'Could not load impact summary.' });
  }
};

export default { getSummary };
