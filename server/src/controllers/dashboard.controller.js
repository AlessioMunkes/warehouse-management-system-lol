// ─────────────────────────────────────────────────────────────
// server/src/controllers/dashboard.controller.js
//
// Thin HTTP layer, same respondError pattern as every other
// controller in this codebase.
// ─────────────────────────────────────────────────────────────
import dashboardService from '../services/dashboard.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

// ── GET /api/dashboard/summary ──────────────────────────────────
const getSummary = async (req, res) => {
  try {
    const data = await dashboardService.getSummary();
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getSummary', 'Failed to load dashboard summary.');
  }
};

export default { getSummary };
