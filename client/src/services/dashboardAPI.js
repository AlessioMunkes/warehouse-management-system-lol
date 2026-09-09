// ─────────────────────────────────────────────────────────────
// src/services/dashboardAPI.js
//
// Client wrapper around /api/dashboard. One function, mirroring
// dashboard.controller.js's one route — unwraps the { success, data }
// envelope, same job every other *API.js file in this folder does.
// ─────────────────────────────────────────────────────────────
import { apiGet } from "./api";

export const toSummary = (row = {}) => ({
  lowStockCount:           Number(row.lowStockCount ?? 0),
  activeProductCount:      Number(row.activeProductCount ?? 0),
  openPurchaseOrders:      Number(row.openPurchaseOrders ?? 0),
  deliveriesExpectedToday: Number(row.deliveriesExpectedToday ?? 0),
  pendingDispatchesToday:  Number(row.pendingDispatchesToday ?? 0),
});

export const getDashboardSummary = async () => {
  const body = await apiGet("/api/dashboard/summary");
  return toSummary(body.data ?? {});
};

// The worker dashboard's three counts. A separate endpoint, not a
// filtered summary: /summary is manager-and-admin because it reports
// across the whole catalog and every supplier.
export const getMyWork = async () => {
  const body = await apiGet("/api/dashboard/my-work");
  const row = body.data ?? {};
  return {
    slipsToPack:        Number(row.slipsToPack ?? 0),
    deliveriesExpected: Number(row.deliveriesExpected ?? 0),
    palletsAtGate:      Number(row.palletsAtGate ?? 0),
  };
};

export default { getDashboardSummary, getMyWork };
