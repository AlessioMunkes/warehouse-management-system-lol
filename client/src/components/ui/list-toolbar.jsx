// ─────────────────────────────────────────────────────────────
// client/src/components/ui/list-toolbar.jsx
//
// The bar between a manager list's view tabs and its table: search on
// the left, then Filters, Columns and Export, with every filter that
// is on shown underneath as a chip you can take off with one click.
//
//   search       — { value, onChange, placeholder, label }
//   filters      — [{ key, label, active, onToggle }]. Offered in the
//                  Filters menu; the active ones become chips. Omit for
//                  a list with nothing to filter beyond its tabs.
//   onClearAll   — shown as "Clear all" beside the chips when more than
//                  one filter (or a search) is on
//   columns      — props for ColumnToggle (useTableView's output), or
//                  nothing for a table whose columns are fixed
//   onExport     — Export button handler; omit to hide the button
//   children     — anything screen-specific, placed before Columns
//
// The chips sit under the bar rather than inside it so a long search
// box and three filters never squeeze each other on a laptop.
// ─────────────────────────────────────────────────────────────
import { Download, Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import ColumnToggle from '@/components/ui/column-toggle';

export default function ListToolbar({
  search, filters = [], onClearAll, columns, onExport, exportLabel = 'Export', children,
}) {
  const active = filters.filter((f) => f.active);
  const showClearAll = onClearAll && (active.length > 1 || (active.length > 0 && search?.value));

  return (
    <div className="space-y-2">
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        {search ? (
          <div className="relative min-w-56 flex-1">
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
              <Button type="button" variant="outline" size="sm">
                <Filter />
                Filters
                {active.length ? <span className="text-muted-foreground">· {active.length}</span> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-2">
                <p className="text-sm font-medium">Show only</p>
                {filters.map((f) => {
                  const id = `filter-${f.key}`;
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

        {children}

        {columns ? <ColumnToggle {...columns} /> : null}

        {onExport ? (
          <Button type="button" variant="outline" size="sm" onClick={onExport}>
            <Download />
            {exportLabel}
          </Button>
        ) : null}
      </div>

      {active.length ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {active.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1 rounded-full border bg-muted py-0.5 pl-3 pr-1 text-xs"
            >
              {f.label}
              <button
                type="button"
                onClick={() => f.onToggle()}
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
        </div>
      ) : null}
    </div>
  );
}
