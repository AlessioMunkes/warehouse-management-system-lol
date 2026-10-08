// ─────────────────────────────────────────────────────────────
// src/services/dashboardAPI.js
//
// Client wrapper around /api/dashboard. One function, mirroring
// dashboard.controller.js's one route — unwraps the { success, data }
// envelope, same job every other *API.js file in this folder does.
// ─────────────────────────────────────────────────────────────
import { apiGet } from "./api";

export const toSummary = (row = {}) => ({
  lowStockCount:            Number(row.lowStockCount ?? 0),
  belowReorderCount:        Number(row.belowReorderCount ?? 0),
  outOfStockCount:          Number(row.outOfStockCount ?? 0),
  healthyStockCount:        Number(row.healthyStockCount ?? 0),
  activeProductCount:       Number(row.activeProductCount ?? 0),
  openPurchaseOrders:       Number(row.openPurchaseOrders ?? 0),
  deliveriesExpectedToday:  Number(row.deliveriesExpectedToday ?? 0),
  pendingDispatchesToday:   Number(row.pendingDispatchesToday ?? 0),
  pendingCommunityRequests: Number(row.pendingCommunityRequests ?? 0),
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

// ── GET /api/dashboard/attention ──────────────────────────────
// The counts behind the dashboard's "Needs attention" list and the
// manager sidebar. Every number is the size of a tab it links to.
export const toAttention = (row = {}) => {
  const n = (v) => Number(v ?? 0);
  return {
    inventory: {
      shortfall: n(row.inventory?.shortfall),
      lowStock:  n(row.inventory?.lowStock),
      expiring:  n(row.inventory?.expiring),
    },
    pickingSlips: {
      unassigned:   n(row.pickingSlips?.unassigned),
      notCollected: n(row.pickingSlips?.notCollected),
    },
    purchaseOrders: {
      awaitingApproval: n(row.purchaseOrders?.awaitingApproval),
      followUp:         n(row.purchaseOrders?.followUp),
    },
    communityRequests: {
      pending:    n(row.communityRequests?.pending),
      unclaimed:  n(row.communityRequests?.unclaimed),
      needsItems: n(row.communityRequests?.needsItems),
    },
  };
};

export const getAttention = async () => {
  const body = await apiGet("/api/dashboard/attention");
  return toAttention(body.data ?? {});
};

// ── GET /api/dashboard/insights ───────────────────────────────
// Three figures for the manager's board: weeks of stock left on the
// recipe in use, this week's packing, and centres missing collections.
export const toInsights = (row = {}) => {
  const n = (v) => Number(v ?? 0);
  return {
    recipeName: row.recipeName ?? null,
    stockCover: (row.stockCover ?? []).map((p) => ({
      productId: p.productId, name: p.name, unit: p.unit,
      onHand: n(p.onHand), weeklyUse: n(p.weeklyUse), weeklyUnit: p.weeklyUnit ?? p.unit,
      weeks: p.weeks == null ? null : Number(p.weeks),
    })),
    packing: { total: n(row.packing?.total), packed: n(row.packing?.packed), inProgress: n(row.packing?.inProgress) },
    missedWeeks: n(row.missedWeeks),
    missedCollections: (row.missedCollections ?? []).map((c) => ({
      id: c.id, name: c.name, missed: n(c.missed), lastMissed: c.lastMissed ?? null,
    })),
  };
};

export const getInsights = async () => {
  const body = await apiGet("/api/dashboard/insights");
  return toInsights(body.data ?? {});
};

export default { getDashboardSummary, getMyWork, getAttention, getInsights };
