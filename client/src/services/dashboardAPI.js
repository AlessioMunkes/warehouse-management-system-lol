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

export default { getDashboardSummary };
