// ─────────────────────────────────────────────────────────────
// features/donation/components/DonationDraftProvider.jsx
//
// Holds the in-progress donation while the worker moves across the
// three routes (/donations/new -> /donor -> /review). Backed by
// sessionStorage so a refresh or a locked phone doesn't wipe progress
// mid-entry at the gate.
//
// Component-only by design: the context object, the empty-draft
// factories and the useDonationDraft hook live in
// DonationDraftContext.js. Keeping non-component exports out of this
// file is what satisfies react-refresh/only-export-components.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import {
  DonationDraftContext,
  STORAGE_KEY,
  emptyDraft,
  emptyItem,
} from "./DonationDraftContext";

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
