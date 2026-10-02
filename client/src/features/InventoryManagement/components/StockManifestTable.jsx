// ─────────────────────────────────────────────────────────────
// StockManifestTable.jsx
//
// The inventory list: search, filters, columns and export above it,
// tick boxes down its left edge, and the product name as the way into
// one product's detail panel. Built from the shared list pieces in
// components/ui (ListToolbar, BulkActionBar) so the other manager
// screens can be brought into line with it.
//
// THREE QUANTITIES, NOT ONE. "On hand" is what is physically in the
// building; some of it is already packed onto pallets waiting at the
// dispatch gate and cannot be promised to anyone else. The manager
// asking "can I still allocate this?" needs Available, and the
// manager asking "does the shelf count match?" needs On hand. Showing
// only one of them is what let the inventory screen and the packing
// screen disagree about how much rice there was.
//
// The status badge is derived from Available server-side — see
// server/src/repositories/stock.repository.js getManifest. Which rows
// each tab and filter keeps lives in ../inventoryViews.js.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { PackageSearch, ShoppingCart, SlidersHorizontal, Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import StatusBadge from '@/components/ui/status-badge';
import SortableHead from '@/components/ui/sortable-head';
import TablePager from '@/components/ui/table-pager';
import ListToolbar from '@/components/ui/list-toolbar';
import BulkActionBar from '@/components/ui/bulk-action-bar';
import useTableView from '@/features/masterdata/hooks/useTableView';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/hooks/usePaged';
import { downloadCsv, toCsv } from '@/features/reporting/chartFormat';
import { fmtQty } from '@/lib/quantity';
import {
  FILTERS, EXPORT_COLUMNS, STOCK_STATUS_LABEL, STOCK_STATUS_RANK,
  expiryState, exportRows, filterProducts, stockStatus, todaySast,
} from '../inventoryViews';

// ── Columns ──────────────────────────────────────────────────
// One definition drives the header, the body and the Columns menu, so
// hiding a column cannot leave its cells behind. `minWidth` drops a
// column below that breakpoint (useTableView); what survives on a
// phone is the product, what is Available — the number an allocation
// decision is made on — and the tick box. Everything else is one tap
// away in the detail panel.
//
// Numbers are right-aligned in tabular figures so a column of them
// reads as a column, units and all.
const COLUMNS = [
  { key: 'name',      label: 'Product',         alwaysOn: true,
    sort: (p) => (p.name ?? '').toLowerCase() },
  { key: 'onHand',    label: 'On hand',         numeric: true, align: 'right', minWidth: 'sm',
    sort: (p) => p.onHand },
  { key: 'committed', label: 'Committed',       numeric: true, align: 'right', minWidth: 'lg',
    sort: (p) => p.committed },
  { key: 'available', label: 'Available',       numeric: true, align: 'right', alwaysOn: true,
    sort: (p) => p.available },
  { key: 'reorderAt', label: 'Reorder at',      numeric: true, align: 'right', minWidth: 'lg',
    sort: (p) => p.reorderAt },
  // Sorted as a timestamp so the soonest comes first ascending; no
  // expiry on record sorts last either way (useTableView).
  { key: 'expiry',    label: 'Earliest expiry', numeric: true, minWidth: 'md',
    sort: (p) => (p.earliestExpiry ? Date.parse(p.earliestExpiry) : null) },
  // Problems first on the first (descending) click.
  { key: 'status',    label: 'Status',          numeric: true, minWidth: 'sm',
    sort: (p) => STOCK_STATUS_RANK[stockStatus(p)] },
];

const fmtDay = (day) => (day
  ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
  : '—');

const exportFile = (label) => `inventory-${label}-${todaySast()}.csv`;

export default function StockManifestTable({
  products = [],
  view = 'all',
  isLoading = false,
  canAdjust = false,
  canOrder = false,
  onOpen,
  onBulkAdjust,
  onRaisePurchaseOrder,
}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState([]);
  const [selected, setSelected] = useState(() => new Set());

  // A new tab is a new list; ticks from the last one would act on rows
  // that are no longer on screen.
  const [lastView, setLastView] = useState(view);
  if (view !== lastView) {
    setLastView(view);
    setSelected(new Set());
  }

  const tableView = useTableView('inventory', COLUMNS);
  const { sortRows, visibleColumns: columns } = tableView;

  const rows = useMemo(
    () => sortRows(filterProducts(products, { view, filters, search })),
    [products, view, filters, search, sortRows],
  );

  const page = usePaged(
    rows, TABLE_PAGE_SIZE,
    `${view}|${filters.join()}|${search}|${tableView.sort?.key}|${tableView.sort?.direction}|${products.length}`,
  );

  // Selection is by id and survives a reload of the manifest; a ticked
  // product that has since gone (archived) simply drops out here.
  const selectedProducts = useMemo(
    () => products.filter((p) => selected.has(p.id)),
    [products, selected],
  );
  const allTicked  = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const someTicked = !allTicked && rows.some((p) => selected.has(p.id));

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allTicked ? new Set() : new Set(rows.map((p) => p.id)));
  const clearSelection = () => setSelected(new Set());

  const toggleFilter = (key) =>
    setFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const clearAll = () => { setFilters([]); setSearch(''); };
  const narrowed = filters.length > 0 || search.trim() !== '';

  const sort = tableView.sort ? { key: tableView.sort.key, dir: tableView.sort.direction } : null;

  return (
    <div className="space-y-4">
      {selectedProducts.length ? (
        <BulkActionBar count={selectedProducts.length} noun="products" onClear={clearSelection}>
          {canOrder ? (
            <Button type="button" size="sm" onClick={() => onRaisePurchaseOrder?.(selectedProducts)}>
              <ShoppingCart />
              Raise purchase order
            </Button>
          ) : null}
          {canAdjust ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onBulkAdjust?.(selectedProducts)}>
              <SlidersHorizontal />
              Adjust stock
            </Button>
          ) : null}
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => downloadCsv(exportFile('selected'), toCsv(exportRows(selectedProducts), EXPORT_COLUMNS))}
          >
            <Download />
            Export selected
          </Button>
        </BulkActionBar>
      ) : (
        <ListToolbar
          search={{ value: search, onChange: setSearch, placeholder: 'Search by product, SKU or barcode' }}
          filters={FILTERS.map((f) => ({
            key: f.key, label: f.label, active: filters.includes(f.key), onToggle: () => toggleFilter(f.key),
          }))}
          onClearAll={clearAll}
          columns={{
            idPrefix: 'inventory',
            columns: tableView.availableColumns,
            hidden: tableView.hidden,
            onToggle: tableView.toggleColumn,
            onReset: tableView.resetColumns,
          }}
          onExport={rows.length ? () => downloadCsv(exportFile(view), toCsv(exportRows(rows), EXPORT_COLUMNS)) : undefined}
        />
      )}

      {isLoading ? (
        // Skeleton rows rather than a line of text: a sentence where a
        // table is about to appear reads as an error message.
        <div className="space-y-2 py-2" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={
            narrowed ? 'No products match these filters'
              : products.length ? 'Nothing in this view'
              : 'No products in the catalogue yet'
          }
          description={
            narrowed ? 'Nothing in this view matches what you have selected.'
              : products.length ? 'No product is in this state right now.'
              : 'Products appear here once they are added to the catalogue or arrive through receiving.'
          }
          action={narrowed ? { label: 'Clear all filters', onClick: clearAll } : undefined}
        />
      ) : (
        // py-0: Card's own vertical padding is for a titled card; on a
        // table it leaves an empty band above the header row.
        <Card className="py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allTicked}
                      indeterminate={someTicked}
                      onCheckedChange={toggleAll}
                      aria-label={allTicked ? 'Untick all products in this view' : 'Tick all products in this view'}
                    />
                  </TableHead>
                  {columns.map((c) => (
                    <SortableHead
                      key={c.key}
                      label={c.label}
                      sortKey={c.key}
                      sort={sort}
                      onSort={tableView.toggleSort}
                      align={c.align}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.slice.map((p) => {
                  const ticked = selected.has(p.id);
                  return (
                    <TableRow
                      key={p.id}
                      data-state={ticked ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => onOpen?.(p)}
                    >
                      {/* stopPropagation, or ticking a row also opens it. */}
                      <TableCell className="w-10 pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={ticked}
                          onCheckedChange={() => toggleOne(p.id)}
                          aria-label={`Select ${p.name}`}
                        />
                      </TableCell>
                      {columns.map((c) => <Cell key={c.key} column={c} product={p} onOpen={onOpen} />)}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePager {...page} noun="products" className="px-4" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Cell({ column, product: p, onOpen }) {
  const num = 'text-right tabular-nums';
  switch (column.key) {
    case 'name':
      // A real button, so the row opens from the keyboard too. The row
      // click is a convenience for the mouse on top of it.
      return (
        <TableCell className="max-w-64 whitespace-normal">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen?.(p); }}
            className="block max-w-full text-left font-medium hover:underline"
          >
            <span className="block break-words">{p.name}</span>
          </button>
          <span className="block break-words text-xs text-muted-foreground">{p.sku}</span>
        </TableCell>
      );
    case 'onHand':
      return <TableCell className={num}>{fmtQty(p.onHand, p.unit)}</TableCell>;
    // Zero committed is the ordinary state, so it is a muted dash.
    case 'committed':
      return (
        <TableCell className={`${num} text-muted-foreground`}>
          {p.committed > 0 ? fmtQty(p.committed, p.unit) : '—'}
        </TableCell>
      );
    // The number the allocation decision is made on, so it carries the
    // emphasis.
    case 'available':
      return <TableCell className={`${num} font-medium`}>{fmtQty(p.available, p.unit)}</TableCell>;
    case 'reorderAt':
      return <TableCell className={`${num} text-muted-foreground`}>{fmtQty(p.reorderAt, p.unit)}</TableCell>;
    case 'expiry': {
      const state = expiryState(p.earliestExpiry);
      return (
        <TableCell className="tabular-nums">
          <span className={state?.status === 'soon' ? '' : 'text-muted-foreground'}>{fmtDay(p.earliestExpiry)}</span>
          {state?.status === 'soon' ? (
            <StatusBadge kind="expiry" status="soon" className="ml-2">
              {state.daysLeft === 0 ? 'today' : state.daysLeft === 1 ? '1 day' : `${state.daysLeft} days`}
            </StatusBadge>
          ) : null}
        </TableCell>
      );
    }
    case 'status': {
      const status = stockStatus(p);
      return (
        <TableCell>
          <StatusBadge kind="inventory" status={status}>{STOCK_STATUS_LABEL[status]}</StatusBadge>
        </TableCell>
      );
    }
    default:
      return <TableCell />;
  }
}
