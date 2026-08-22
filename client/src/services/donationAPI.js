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
export async function createDonation(draft) {
  const payload = {
    category: draft.category,
    estimatedValueZar: Number(draft.estimatedValueZar) || 0,
    programmeCode: draft.programmeCode || undefined,
    donorName: draft.donorName,
    donorContact: draft.donorContact,
    donorTaxReference: draft.donorTaxReference,
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

  const res = await fetch("/api/donations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.message || "Failed to record donation.");
  }

  return json.data; // { donation, warnings, duplicate }
}