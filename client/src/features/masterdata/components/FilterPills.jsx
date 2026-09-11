// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/components/FilterPills.jsx
//
// The role pills from UserDirectoryPage, made general so Products and
// Suppliers get the same control rather than a third interpretation of
// "filter".
//
// No pill selected means everything, and clicking the selected pill
// clears it. There is deliberately no "All" pill: an explicit All is a
// fourth thing to look at that says the same as none-of-the-three, and
// it makes "nothing selected" look like a state somebody forgot to
// handle.
//
// Filtering happens on the client, over the rows already fetched, so
// it composes with the server-side search box and the "Show inactive"
// toggle for free instead of racing them.
// ─────────────────────────────────────────────────────────────
import { Button } from '@/components/ui/button';

export default function FilterPills({ options, value, onChange, label }) {
  if (!options || options.length === 0) return null;

  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            onClick={() => onChange(active ? null : opt.value)}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
