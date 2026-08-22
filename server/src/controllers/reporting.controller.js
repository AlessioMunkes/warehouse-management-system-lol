// ─────────────────────────────────────────────────────────────
// server/src/controllers/reporting.controller.js
//
// Thin HTTP layer. All logic lives in reporting.service.js, which
// attaches .status to everything it throws — same convention as
// dispatch.controller.js and picking.controller.js.
// ─────────────────────────────────────────────────────────────
import reportingService from '../services/reporting.service.js';

// GET /api/reporting/catalog
// The client builds its dropdowns from this, so adding a metric on
// the server surfaces in the UI with no client change.
const getCatalog = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: reportingService.getCatalog() });
  } catch (err) {
    console.error('[getCatalog]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to load the report catalog.',
    });
  }
};

// POST /api/reporting/report
// Body: { metric, dimension?, filters?, dateRange:{from,to}, chartType?, limit? }
// Returns: { spec, description, chartType, series, total, meta }
//
// POST rather than GET because the spec is a nested object, and a
// query string encoding of it would be both unreadable in logs and
// awkward to validate. Nothing here writes.
const runReport = async (req, res) => {
  try {
    const report = await reportingService.runReport(req.body);
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    console.error('[runReport]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to run the report.',
    });
  }
};

export default { getCatalog, runReport };
