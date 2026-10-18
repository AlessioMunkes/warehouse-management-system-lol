// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/useListFilters.js
//
// "+ Filter" for a manager list, by any field of its rows: one choice
// per field at a time (Supplier: Alliance Foods), several fields at once
// (Supplier and Status). The choices are read off the rows themselves,
// so a list never offers a supplier it does not contain, and a field
// with only one value is not offered at all.
//
//   defs  [{ key, label, valueOf(row), labelOf?(value) }]
//   rows  every row, before filtering (so the choices do not shrink as
//         filters are applied)
//
// Returns:
//   filters  entries for ListToolbar's `filters`, grouped by field
//   apply    rows => the rows matching every chosen value
//   clear    turns every field back to "any"
//   active   true when anything is chosen
// ─────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react';

const text = (v) => (v === null || v === undefined ? '' : String(v));

export default function useListFilters(defs, rows) {
  const [chosen, setChosen] = useState({});

  const filters = useMemo(() => defs.flatMap((def) => {
    const seen = new Map();
    for (const row of rows ?? []) {
      const value = text(def.valueOf(row));
      if (!value || seen.has(value)) continue;
      seen.set(value, def.labelOf ? def.labelOf(value) : value);
    }
    if (seen.size < 2 && !chosen[def.key]) return [];
    return [...seen.entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'en-ZA', { sensitivity: 'base' }))
      .map(([value, label]) => ({
        key: `${def.key}:${value}`,
        group: def.label,
        label,
        chipLabel: `${def.label}: ${label}`,
        active: chosen[def.key] === value,
        onToggle: () => setChosen((c) => ({ ...c, [def.key]: c[def.key] === value ? undefined : value })),
      }));
  }), [defs, rows, chosen]);

  const apply = useCallback((list) => (list ?? []).filter((row) => defs.every((def) => {
    const want = chosen[def.key];
    return !want || text(def.valueOf(row)) === want;
  })), [defs, chosen]);

  const clear = useCallback(() => setChosen({}), []);
  const active = Object.values(chosen).some(Boolean);

  return { filters, apply, clear, active };
}
