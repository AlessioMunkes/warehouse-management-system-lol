// ─────────────────────────────────────────────────────────────
// client/src/services/reportingAPI.js
//
// Wrapper around /api/reporting. One function per route in
// reporting.routes.js, nothing invented.
//
// All three routes are manager/admin only on the server. The client
// gate in App.jsx is a UX courtesy; the route guard is the control.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';

// GET /api/reporting/catalog
// Returns { aiEnabled, metrics }. aiEnabled is false when no API key
// is configured — the page uses it to hide the ask box entirely.
export const getCatalog = () => apiGet('/api/reporting/catalog');

// POST /api/reporting/report
export const runReport = (spec) => apiPost('/api/reporting/report', spec);

// POST /api/reporting/ask
// Returns either a report payload or { type: 'clarify', question, options }.
export const askQuestion = (question) => apiPost('/api/reporting/ask', { question });

export default { getCatalog, runReport, askQuestion };
