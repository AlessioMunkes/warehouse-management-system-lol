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

const getMyWork = async (req, res) => {
  try {
    const data = await dashboardService.getMyWork();
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getMyWork', 'Failed to retrieve your work summary.');
  }
};

// GET /api/dashboard/attention — the counts behind "Needs attention"
// and the manager sidebar. See dashboard.repository.js getAttention.
const getAttention = async (req, res) => {
  try {
    const data = await dashboardService.getAttention();
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getAttention', 'Failed to load what needs attention.');
  }
};

// GET /api/dashboard/insights — weeks of stock left, this week's packing
// and the centres missing collections. See dashboard.repository.js.
const getInsights = async (req, res) => {
  try {
    const data = await dashboardService.getInsights();
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getInsights', 'Failed to load the dashboard figures.');
  }
};

export default { getSummary, getMyWork, getAttention, getInsights };
