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
      // Past their collection day and never packed, from any week.
      neverPacked:     n(row.pickingSlips?.neverPacked),
      neverPackedFrom: row.pickingSlips?.neverPackedFrom ?? null,
      // This week's pallets, not yet gone out, with a flagged line.
      flagged:         n(row.pickingSlips?.flagged),
    },
    purchaseOrders: {
      awaitingApproval: n(row.purchaseOrders?.awaitingApproval),
      followUp:         n(row.purchaseOrders?.followUp),
      financeEmailFailed:   n(row.purchaseOrders?.financeEmailFailed),
      needsQuickbooksMatch: n(row.purchaseOrders?.needsQuickbooksMatch),
    },
    communityRequests: {
      pending:    n(row.communityRequests?.pending),
      approved:   n(row.communityRequests?.approved),
      overdue:    n(row.communityRequests?.overdue),
      needsItems: n(row.communityRequests?.needsItems),
    },
    feedTheSoil: {
      idleKits: n(row.feedTheSoil?.idleKits),
    },
  };
};

export const getAttention = async () => {
  const body = await apiGet("/api/dashboard/attention");
  return toAttention(body.data ?? {});
};

// ── GET /api/dashboard/insights ───────────────────────────────
// Three figures for the manager's board: the stock outlook (weeks of
// stock left), this week's packing, and centres missing collections.
export const toInsights = (row = {}) => {
  const n = (v) => Number(v ?? 0);
  return {
    recipeName: row.recipeName ?? null,
    // The shared stock cover (server features/stock/stockCover.js), the
    // same figures as the reorder planner and the Days of stock left
    // report, with where demand and lead time came from.
    stockCover: (row.stockCover ?? []).map((p) => ({
      productId: p.productId, name: p.name, unit: p.unit,
      available: n(p.available), dueIn: n(p.dueIn), nextDue: p.nextDue ?? null,
      overdue: n(p.overdue), ifOverdueArrived: p.ifOverdueArrived ?? null,
      weeklyUse: n(p.weeklyUse),
      demandLabel: p.demandLabel ?? '', leadLabel: p.leadLabel ?? '', orderBy: p.orderBy ?? null,
      limits: p.limits ?? [],
      weeks: n(p.weeks),
      // Whole days of cover, rounded down (the screen words it).
      days: n(p.days),
      runsShortOn: p.runsShortOn ?? null,
      mayExpireOn: p.mayExpireOn ?? null,
      mayExpireQuantity: n(p.mayExpireQuantity),
    })),
    outlook: { usageWeeks: n(row.outlook?.usageWeeks) || 8, unmeasured: n(row.outlook?.unmeasured) },
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
