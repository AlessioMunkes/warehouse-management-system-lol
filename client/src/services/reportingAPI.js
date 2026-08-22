// ─────────────────────────────────────────────────────────────
// client/src/services/reportingAPI.js
//
// Wrapper around /api/reporting. One function per route in
// reporting.routes.js, nothing invented.
//
// Both routes are manager/admin only on the server. The client gate
// in App.jsx is a UX courtesy; the route guard is the real control.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';

// GET /api/reporting/catalog
// The report builder's dropdowns are built entirely from this, so a
// metric added on the server appears in the UI with no client change.
export const getCatalog = () => apiGet('/api/reporting/catalog');

// POST /api/reporting/report
// spec: { metric, dimension?, filters?, dateRange:{from,to}, chartType?, limit? }
//
// POST rather than GET because the spec is a nested object. Nothing
// here writes — the verb is about payload shape, not side effects.
export const runReport = (spec) => apiPost('/api/reporting/report', spec);

export default { getCatalog, runReport };
