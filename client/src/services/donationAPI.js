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
  const donationCategory = draft.isFood === false ? "non_food" : null;
  const payload = {
    donorName: draft.donorName,
    donorContact: draft.donorContact || draft.contactDetails || "",
    donorConsentGiven: draft.donorConsentGiven === true,
    estimatedValueZar: Number(draft.estimatedValueZar) || 0,
    isFood: draft.isFood,
    donationCategory,
    notes: draft.notes,
    idempotencyKey: draft.idempotencyKey,
    draftSnapshot: JSON.stringify({
      capturedAt: new Date().toISOString(),
      source: "donation-intake-ui",
      phase: "donation-phase-1-4",
      draft,
    }),
    items: draft.items.map((i) => ({
      description: i.productLabel || i.description,
      quantity: Number(i.quantity),
      unit: i.unit || "each",
      estimatedValueZar: null,
      productId: i.productId ?? null,
      requestedCategory: draft.isFood === false ? "non_food" : null,
      status: draft.isFood === true && i.unknownProduct ? "PENDING_PRODUCT_REVIEW" : undefined,
      unknownProduct: Boolean(i.unknownProduct),

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
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.filter((product) => {
    const sku = String(product?.sku ?? product?.stock_keeping_unit ?? '').toUpperCase();
    const status = String(product?.status ?? product?.reviewStatus ?? product?.review_status ?? '').toUpperCase();
    return !sku.startsWith('PENDING-') && !status.includes('PENDING');
  });
}

export async function getSection18AForm(token) {
  const res = await fetch(`/api/donations/section-18a/form/${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Could not load Section 18A form.');
  }
  return json.data;
}

export async function submitSection18AForm(token, payload) {
  const res = await fetch(`/api/donations/section-18a/form/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await parseJsonResponse(res);
  if (!res.ok || !json.success) {
    const error = new Error(json.message || `Could not submit Section 18A form. Server returned ${res.status}.`);
    error.errors = json.errors || {};
    throw error;
  }
  return json.data;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
