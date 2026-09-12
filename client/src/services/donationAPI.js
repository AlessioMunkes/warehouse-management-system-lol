// ─────────────────────────────────────────────────────────────
// features/donations/services/donationService.js
//
// Maps the local draft shape to the exact POST /api/donations body
// donation.service.js expects. Keep this the single place that knows
// that mapping, so a future backend field change only touches here.
// ─────────────────────────────────────────────────────────────

// ⚠ Route this through whatever authenticated API client the rest of
// the app already uses (axios instance with token interceptor, etc.)
// rather than a bare fetch — placeholder shown for shape only.
// Shared fetch wrapper: same-origin /api path (Vite dev proxy forwards to
// the Express backend) and credentials included so the httpOnly wms_token
// cookie reaches the server. All donation endpoints go through this.
async function apiPost(path, payload) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = {};
  }

  if (!res.ok || !json.success) {
    const error = new Error(json.message || `Request failed (${res.status}).`);
    error.status = res.status;
    error.errors = json.errors || {};
    throw error;
  }

  return json.data;
}

export async function createDonation(draft) {
  const payload = {
    category: draft.category,
    estimatedValueZar: Number(draft.estimatedValueZar) || 0,
    programmeCode: draft.programmeCode || undefined,
    donorName: draft.donorName,
    donorContact: draft.donorContact,
    donorTaxReference: draft.donorTaxReference,
    donorType: draft.donorType || undefined,
    donorAddress: draft.donorAddress || undefined,
    donorContactNumber: draft.donorContactNumber || undefined,
    donorTradingName: draft.donorTradingName || undefined,
    donorIdType: draft.donorIdType || undefined,
    donorIdCountry: draft.donorIdCountry || undefined,
    donorIdNumber: draft.donorIdNumber || undefined,
    donorConsentGiven: draft.donorConsentGiven === true,
    notes: draft.notes,
    idempotencyKey: draft.idempotencyKey,
    items: draft.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unit: i.unit,
      productId: i.productId,
    })),
  };

  return apiPost("/api/donations", payload); // { donation, warnings, duplicate }
}

// ── Pending-donation intake ───────────────────────────────────
// Maps the local draft shape to POST /api/donations/pending
// (pendingDonation.service.js createPendingDonationFromIntake).
//
// draftSnapshot is archival/audit-only (nothing downstream parses it),
// so stringifying the whole draft at submit time is exactly right.
//
export async function createPendingDonation(draft) {
  const managerReview = draft.category === "manager_review";
  const donationCategory = managerReview ? null : draft.category;
  const payload = {
    donorName: draft.donorName,
    donorContact: draft.donorContact,
    donorTaxReference: draft.donorTaxReference,
    donorType: draft.donorType || undefined,
    donorAddress: draft.donorAddress || undefined,
    donorContactNumber: draft.donorContactNumber || undefined,
    donorTradingName: draft.donorTradingName || undefined,
    donorIdType: draft.donorIdType || undefined,
    donorIdCountry: draft.donorIdCountry || undefined,
    donorIdNumber: draft.donorIdNumber || undefined,
    donorConsentGiven: draft.donorConsentGiven === true,
    estimatedValueZar: Number(draft.estimatedValueZar) || 0,
    donationCategory,
    notes: draft.notes,
    idempotencyKey: draft.idempotencyKey,
    draftSnapshot: JSON.stringify({
      capturedAt: new Date().toISOString(),
      source: "donation-intake-ui",
      draft,
    }),
    items: draft.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unit: i.unit,
      productId: i.productId ?? null,
      requestedCategory: i.productId ? null : donationCategory,
    })),
  };

  return apiPost("/api/donations/pending", payload);
}

// ── Staff intake product search (Part A) ─────────────────────
// Backs the "Match to stock item" combobox: GET /api/donations/intake/
// products/search?name=...  Same-credentials GET, mirrors apiPost's
// success-shape handling but for a list endpoint.
export async function searchProducts(name) {
  const term = String(name ?? '').trim();
  if (!term) return [];

  const res = await fetch(
    `/api/donations/intake/products/search?name=${encodeURIComponent(term)}`,
    { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } }
  );

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Product search failed.');
  }
  return Array.isArray(json.data) ? json.data : [];
}
