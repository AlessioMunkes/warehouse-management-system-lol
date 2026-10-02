// ─────────────────────────────────────────────────────────────
// client/src/components/ui/list-toolbar.jsx
//
// The row across the top of a manager list (inside its ListCard):
// search, "+ Filter" and the filters that are on as removable chips,
// then — pushed right — a note on how the list is ordered, anything
// screen-specific, Columns and Export.
//
//   search       — { value, onChange, placeholder, label }
//   filters      — [{ key, label, active, onToggle }]. Offered under
//                  "+ Filter"; the active ones become chips. Omit for a
//                  list with nothing to filter beyond its tabs.
//   chips        — [{ key, label, onRemove }]: chips for filters set by
//                  a control of the screen's own (a product picker, a
//                  period), shown beside the Filter-menu chips
//   onClearAll   — shown as "Clear all" beside the chips when more than
//                  one filter (or a search) is on
//   note         — e.g. "Sorted by product name"
//   columns      — props for ColumnToggle (useTableView's output), or
//                  nothing for a table whose columns are fixed
//   onExport     — Export button handler; omit to hide the button
//   children     — screen-specific controls, placed before Columns
// ─────────────────────────────────────────────────────────────
import { useId } from 'react';
import { Download, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import ColumnToggle from '@/components/ui/column-toggle';

export default function ListToolbar({
  search, filters = [], chips = [], onClearAll, note, columns, onExport, exportLabel = 'Export', children,
}) {
  // Ids from useId, not the filter key: a key can be free text ("Cold
  // chain"), and an id with a space never links its label.
  const idBase = useId();
  const active = filters.filter((f) => f.active);
  const shown = [
    ...active.map((f) => ({ key: f.key, label: f.label, onRemove: f.onToggle })),
    ...chips,
  ];
  const showClearAll = onClearAll && (shown.length > 1 || (shown.length > 0 && search?.value));

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-2">
      {search ? (
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            className="pl-8"
            placeholder={search.placeholder}
            aria-label={search.label ?? search.placeholder}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
          />
        </div>
      ) : null}

      {filters.length ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="border-dashed">
              <Plus />
              Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium">Show only</p>
              {filters.map((f, i) => {
                const id = `${idBase}-filter-${i}`;
                return (
                  <div key={f.key} className="flex items-center gap-2">
                    <Checkbox id={id} checked={f.active} onCheckedChange={() => f.onToggle()} />
                    <label htmlFor={id} className="text-sm font-normal">{f.label}</label>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {shown.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 rounded-full border bg-muted py-0.5 pl-3 pr-1 text-xs"
        >
          {f.label}
          <button
            type="button"
            onClick={() => f.onRemove()}
            aria-label={`Remove filter: ${f.label}`}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
      {showClearAll ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClearAll}>Clear all</Button>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {note ? <span className="hidden text-sm text-muted-foreground md:inline">{note}</span> : null}
        {children}
        {columns ? <ColumnToggle {...columns} /> : null}
        {onExport ? (
          <Button type="button" variant="outline" size="sm" onClick={onExport}>
            <Download />
            {exportLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
