// api.js
// Centralized backend communication for the Packing feature.
// Components should never call fetch() directly — everything
// goes through these functions so error handling and request
// shapes stay in one place.

const BASE_URL = "/api/picking";

// Unwraps the { success, data, message } envelope every endpoint
// returns. Throws on failure so callers can just try/catch.
async function handleResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Could not reach the Packing API (status ${res.status}). The backend may not be running yet.`
    );
  }

  const json = await res.json();
  if (!json.success) {
    const err = new Error(json.message || "Request failed.");
    err.payload = json;
    throw err;
  }
  return json.data;
}

// GET /api/picking — list slips for the board view, filtered by
// dispatch date / cohort / status, and "mine" for non-managers.
export async function fetchPickingSlips({ dispatchDate, cohort, status, mine } = {}) {
  const params = new URLSearchParams();
  if (dispatchDate) params.set("dispatchDate", dispatchDate);
  if (cohort) params.set("cohort", cohort);
  if (status) params.set("status", status);
  if (mine) params.set("mine", "true");

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  return handleResponse(res);
}

// GET /api/picking/:id — one slip plus its full item list, for
// the detail view.
export async function fetchPickingSlip(slipId) {
  const res = await fetch(`${BASE_URL}/${slipId}`);
  return handleResponse(res);
}

// POST /api/picking/:id/assign — claim a slip. This UI only ever
// claims for the current user, so packerId is omitted; the
// backend infers it from the session.
export async function assignSlip(slipId, packerId) {
  const res = await fetch(`${BASE_URL}/${slipId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(packerId ? { packerId } : {}),
  });
  return handleResponse(res);
}

// POST /api/picking/:id/items/:itemId/confirm — mark one item as
// packed as required.
export async function confirmItem(slipId, itemId, packedQuantity) {
  const res = await fetch(`${BASE_URL}/${slipId}/items/${itemId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packedQuantity }),
  });
  return handleResponse(res);
}

// POST /api/picking/:id/items/:itemId/flag — mark one item as
// short, damaged, or substituted. packedQuantity is optional
// (the packer may not know how much actually went out).
export async function flagItem(slipId, itemId, flagReason, packedQuantity) {
  const res = await fetch(`${BASE_URL}/${slipId}/items/${itemId}/flag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      packedQuantity !== undefined && packedQuantity !== ""
        ? { flagReason, packedQuantity }
        : { flagReason }
    ),
  });
  return handleResponse(res);
}

// POST /api/picking/:id/complete — close the slip once every item
// is confirmed or flagged. May return shortfalls for the caller
// to surface as a discrepancy notice.
export async function completeSlip(slipId, palletRef) {
  const res = await fetch(`${BASE_URL}/${slipId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(palletRef ? { palletRef } : {}),
  });
  return handleResponse(res);
}