// ─────────────────────────────────────────────────────────────
// features/donations/context/DonationDraftContext.jsx
//
// Holds the in-progress donation while the worker moves across the
// three routes (/donations/new -> /donor -> /review). Backed by
// sessionStorage so a refresh or a locked phone doesn't wipe progress
// mid-entry at the gate.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "donation-draft";

// One empty item row — id is local-only (crypto.randomUUID), never
// sent to the backend. The backend assigns its own item ids on insert.
const emptyItem = () => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "",
  unit: "",
  productId: null,
  productLabel: "",
});

// Shape mirrors donation.service.js's createDonation payload closely,
// so mapping draft -> POST body at submit time is close to 1:1.
const emptyDraft = () => ({
  category: "",              // ⚠ placeholder pending Alessio — see CategorySelector.jsx
  items: [emptyItem()],
  estimatedValueZar: "",
  programmeCode: "",
  notes: "",
  donorConsentGiven: null,   // null = not yet answered (distinct from false)
  donorName: "",
  donorContact: "",
  donorTaxReference: "",
  // Generated once per draft, not per submit attempt — the backend's
  // ON CONFLICT (idempotency_key) relies on this staying the same
  // across a retried submit, e.g. after a network blip.
  idempotencyKey: crypto.randomUUID(),
});

const DonationDraftContext = createContext(null);

export function DonationDraftProvider({ children }) {
  const [draft, setDraft] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : emptyDraft();
    } catch {
      // Corrupt/unparseable storage shouldn't crash the page —
      // just start fresh.
      return emptyDraft();
    }
  });

  // Persist on every change. Cheap for a form this size, and simpler
  // than debouncing for a first pass.
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  // Shallow-merge patch helper — every page calls this with just the
  // fields it owns, e.g. updateDraft({ category: 'recipe_food' }).
  const updateDraft = useCallback((patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  // Called after a successful submit, or when the worker abandons the
  // flow entirely (e.g. taps Cancel on page 1).
  const resetDraft = useCallback(() => {
    setDraft(emptyDraft());
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <DonationDraftContext.Provider value={{ draft, updateDraft, resetDraft, emptyItem }}>
      {children}
    </DonationDraftContext.Provider>
  );
}

export function useDonationDraft() {
  const ctx = useContext(DonationDraftContext);
  if (!ctx) {
    throw new Error("useDonationDraft must be called inside <DonationDraftProvider>");
  }
  return ctx;
}