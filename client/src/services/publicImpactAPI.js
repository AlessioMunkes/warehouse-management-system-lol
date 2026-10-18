// ─────────────────────────────────────────────────────────────
// client/src/services/publicImpactAPI.js
//
// The one reporting call the landing page (public, no login) is
// allowed to make — see server/src/services/publicImpact.service.js
// for why this has its own tiny unauthenticated route rather than
// reusing reportingAPI.js, which is manager/admin only end to end.
// ─────────────────────────────────────────────────────────────
import { apiGet } from './api';

// GET /api/public/impact-summary
// Returns { paper, compost, children } — the same numbers the Impact
// Calculator shows for paper_saved / compost_processed / children_reached,
// all-time.
export const getPublicImpactSummary = async () => {
  const res = await apiGet('/api/public/impact-summary');
  return res.data ?? res;
};

export default { getPublicImpactSummary };
