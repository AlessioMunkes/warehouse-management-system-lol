// ─────────────────────────────────────────────────────────────
// features/donations/components/ProductMatchCombobox.jsx
//
// Searchable product lookup so a line CAN route to 'allocated'
// instead of 'unmatched' at intake. Keeps shadcn's Combobox for its
// keyboard/search behaviour, restyled to sit inside a .stf-field
// rather than shadcn's default look.
//
// NOTE: options prop needs wiring to your real products search
// endpoint — this only defines the interaction shape.
// ─────────────────────────────────────────────────────────────
import { Combobox } from "@/components/ui/combobox";

export function ProductMatchCombobox({ value, label, onSelect }) {
  return (
    <Combobox
      className="stf-select"
      value={value}
      displayValue={label}
      placeholder="Search stock items..."
      onSelect={(product) => onSelect(product?.id ?? null, product?.name ?? "")}
      // options={...} // fetch from GET /api/products?search=
    />
  );
}