// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/components/ColumnToggle.jsx
//
// "Columns" — collapse the ones you never look at.
//
// A product catalogue with SKU, category, unit, storage and perishable
// is six columns on a laptop and a squeeze on anything smaller, and
// most people only ever read two of them. This lets each person put
// the table down to what they use.
//
// In a popover rather than inline: it is a setting, consulted once and
// then left alone, and five checkboxes across the toolbar would crowd
// out the search box that gets used constantly.
//
// The count in the label is there so a hidden column is never a
// mystery. Somebody who cannot find SKU should be able to see "Columns
// · 3 hidden" without opening anything, because the alternative is
// assuming the data is gone.
// ─────────────────────────────────────────────────────────────
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Columns3 } from 'lucide-react';

export default function ColumnToggle({ columns, hidden, onToggle, onReset, idPrefix = 'col' }) {
  // `columns` here is useTableView's availableColumns — the ones wide
  // enough to render at this viewport — not the full list. A column the
  // layout has dropped on a narrow screen must not appear here as a
  // ticked box that changes nothing when you untick it.
  //
  // alwaysOn columns are not offered either. Nothing in this popover
  // should be able to produce a table of blank rows.
  const optional = columns.filter((c) => !c.alwaysOn && c.label);
  const hiddenCount = optional.filter((c) => hidden.includes(c.key)).length;

  if (optional.length === 0) return null;

  return (
    <Popover>
      {/* asChild, matching ManagerLayout and StockManifestTable — the
          wrapper translates it to Base UI's render prop, and going
          around it would make this the one popover in the app that
          spells the trigger differently. */}
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Columns3 />
          Columns
          {hiddenCount > 0 ? (
            <span className="text-muted-foreground">· {hiddenCount} hidden</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-3">
          <p className="text-sm font-medium">Show these columns</p>

          <div className="space-y-2">
            {optional.map((col) => {
              const id = `${idPrefix}-${col.key}`;
              return (
                <div key={col.key} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={!hidden.includes(col.key)}
                    onCheckedChange={() => onToggle(col.key)}
                  />
                  <label htmlFor={id} className="text-sm font-normal">
                    {col.label}
                  </label>
                </div>
              );
            })}
          </div>

          {hiddenCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onReset}>
              Show all
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
