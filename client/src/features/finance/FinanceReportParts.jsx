// ─────────────────────────────────────────────────────────────
// src/features/finance/FinanceReportParts.jsx
//
// The finance report's smaller pieces: a summary card, a chart legend
// entry, and one movement list with its search, filters and exports.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import useTableView from '@/features/masterdata/useTableView';
import useListFilters from '@/features/masterdata/useListFilters';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TablePager from '@/components/ui/table-pager';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/usePaged';
import {
  LIST_TYPES,
  formatDate,
  formatMoney,
  movementDate,
  referenceId,
  sourceDestination,
  productName,
  monetaryValue,
  quantity,
  unit,
} from './financeReportData';

export function SummaryCard({ title, count, totalLabel, total }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-medium tracking-tight tabular-nums">{count.toLocaleString('en-ZA')}</div>
            <div className="mt-1 text-sm text-muted-foreground">Movements</div>
          </div>
          <Badge variant="secondary">{total}</Badge>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">{totalLabel}</div>
      </CardContent>
    </Card>
  );
}

export function LegendItem({ color, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-3 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

// The movement list under the report: the same toolbar as every other
// list (search, + Filter, Columns, export), the reference number always
// on, every other column hideable.
const financeColumns = (type) => [
  { key: 'ref', label: 'Reference', alwaysOn: true },
  { key: 'date', label: 'Date' },
  { key: 'source', label: type === 'dispatched' ? 'Destination' : type === 'received' ? 'Supplier' : 'Donor' },
  { key: 'product', label: 'Product' },
  { key: 'qty', label: 'Quantity' },
  { key: 'unit', label: 'Unit' },
  ...(type !== 'dispatched' ? [{ key: 'value', label: type === 'received' ? 'Value' : 'Estimated value' }] : []),
];
const financeFilters = (type) => [
  { key: 'source', label: type === 'dispatched' ? 'Destination' : type === 'received' ? 'Supplier' : 'Donor', valueOf: sourceDestination },
  { key: 'product', label: 'Product', valueOf: productName },
  { key: 'unit', label: 'Unit', valueOf: unit },
];

export function FinanceList({ rows, type, search, onSearchChange, onExportCsv, onExportExcel }) {
  const columns = useMemo(() => financeColumns(type), [type]);
  const filterDefs = useMemo(() => financeFilters(type), [type]);
  const view = useTableView(`finance-${type}`, columns);
  const show = view.isVisible;
  const listFilters = useListFilters(filterDefs, rows);
  const shown = listFilters.apply(rows);
  // Movements, fifteen to a page.
  const rowPage = usePaged(shown, TABLE_PAGE_SIZE, `${type}|${search}|${shown.length}`);
  return (
    <ListCard
      className="mt-4"
      header={(
        <ListToolbar
          search={{ value: search, onChange: onSearchChange, placeholder: `Search ${LIST_TYPES[type].toLowerCase()}` }}
          filters={listFilters.filters}
          onClearAll={() => { onSearchChange(''); listFilters.clear(); }}
          columns={{
            idPrefix: `finance-${type}`,
            columns: view.availableColumns,
            hidden: view.hidden,
            onToggle: view.toggleColumn,
            onReset: view.resetColumns,
          }}
        >
          <Button type="button" variant="outline" size="sm" onClick={onExportCsv}>Export CSV</Button>
          <Button type="button" variant="outline" size="sm" onClick={onExportExcel}>Export Excel</Button>
        </ListToolbar>
      )}
      footer={shown.length ? <TablePager {...rowPage} noun="movements" alwaysShow /> : null}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {view.visibleColumns.map((c) => (
              <TableHead key={c.key} className={['qty', 'value'].includes(c.key) ? 'text-right' : ''}>{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 ? (
            <TableRow>
              <TableCell colSpan={view.visibleColumns.length} className="text-muted-foreground">
                No matching movements.
              </TableCell>
            </TableRow>
          ) : rowPage.slice.map((row) => (
            <TableRow key={`${type}-${referenceId(row)}-${productName(row)}-${movementDate(row)}`}>
              <TableCell className="font-medium">{referenceId(row)}</TableCell>
              {show('date') ? <TableCell>{formatDate(movementDate(row))}</TableCell> : null}
              {show('source') ? <TableCell>{sourceDestination(row)}</TableCell> : null}
              {show('product') ? <TableCell>{productName(row)}</TableCell> : null}
              {show('qty') ? <TableCell className="text-right tabular-nums">{quantity(row)}</TableCell> : null}
              {show('unit') ? <TableCell>{unit(row)}</TableCell> : null}
              {type !== 'dispatched' && show('value') ? (
                <TableCell className="text-right tabular-nums">{formatMoney(monetaryValue(row))}</TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ListCard>
  );
}
