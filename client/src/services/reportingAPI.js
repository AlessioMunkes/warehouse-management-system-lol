// ─────────────────────────────────────────────────────────────
// client/src/services/reportingAPI.js
//
// Wrapper around /api/reporting. One function per route in
// reporting.routes.js, nothing invented.
//
// All three routes are manager/admin only on the server. The client
// gate in App.jsx is a UX courtesy; the route guard is the control.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPut } from './api';

// GET /api/reporting/catalog
// Returns { aiEnabled, metrics }. aiEnabled is false when no API key
// is configured — the page uses it to hide the ask box entirely.
export const getCatalog = () => apiGet('/api/reporting/catalog');

// POST /api/reporting/report
export const runReport = (spec) => apiPost('/api/reporting/report', spec);

// POST /api/reporting/ask
// Returns either a report payload or { type: 'clarify', question, options }.
export const askQuestion = (question) => apiPost('/api/reporting/ask', { question });

// PUT /api/reporting/factors/:factorKey
// Inserts a new effective-dated row rather than editing one in place
// — see reportingFactor.repository.js. Returns the new row.
export const setFactor = (factorKey, { value, unit, sourceNote }) =>
  apiPut(`/api/reporting/factors/${encodeURIComponent(factorKey)}`, { value, unit, sourceNote });

// GET /api/reporting/factors/:factorKey/history
export const getFactorHistory = (factorKey) =>
  apiGet(`/api/reporting/factors/${encodeURIComponent(factorKey)}/history`);

export default { getCatalog, runReport, askQuestion, setFactor, getFactorHistory };
