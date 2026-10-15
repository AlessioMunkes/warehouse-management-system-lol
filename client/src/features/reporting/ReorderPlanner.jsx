// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ReorderPlanner.jsx
//
// THE REORDER PLANNER on the Operations reports page: for each product,
// when it runs out at the rate it is going, the date an order has to
// be raised by, and how much to order to cover the planning horizon.
//
// The server works all of it out with the shared stock cover
// (server/src/features/stock/stockCover.js, which says where demand and
// lead time come from), the same figures as the "Days of stock left"
// report and the dashboard's stock outlook. Each product says which
// demand and lead time it used, and what missing data held it back.
// This lays it out most urgent first, lets the list be narrowed to one
// status, opens a product to its week-by-week projection, and exports
// the plan as an order sheet.
// ─────────────────────────────────────────────────────────────
import { Fragment, useEffect, useMemo, useState } from 'react';
import NativeSelect from '@/components/ui/native-select';
import ListToolbar from '@/components/ui/list-toolbar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import useTableView from '@/features/masterdata/useTableView';
import useListFilters from '@/features/masterdata/useListFilters';

// Every column but the product can be hidden from Columns.
const PLAN_COLUMNS = [
  { key: 'product', label: 'Product', alwaysOn: true },
  { key: 'status', label: 'Status' },
  { key: 'available', label: 'Available', right: true },
  { key: 'demand', label: 'Weekly demand', right: true },
  { key: 'cover', label: 'Days of cover', right: true },
  { key: 'runsOut', label: 'Runs out' },
  { key: 'onOrder', label: 'On order', right: true },
  { key: 'lead', label: 'Lead time', right: true },
  { key: 'orderBy', label: 'Order by' },
  { key: 'suggested', label: 'Suggested order', right: true },
];
// The chips narrow by status; these by who supplies it and how it is counted.
const PLAN_FILTERS = [
  { key: 'supplier', label: 'Supplier', valueOf: (i) => i.supplier },
  { key: 'unit', label: 'Unit', valueOf: (i) => i.unit },
];
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBanner from '@/components/ui/error-banner';
import { getReorderPlan } from '../../services/reportingAPI';
import { exportExcel } from '../../lib/excelExport';
import { fmtQtyUnit, weeklyUseText } from '../../lib/stockWording';

const STATUS = {
  out_of_stock: { label: 'Out of stock', tone: 'bg-danger-soft text-danger' },
  order_now: { label: 'Order now', tone: 'bg-danger-soft text-danger' },
  order_soon: { label: 'Order within 7 days', tone: 'bg-warn-soft text-warn' },
  planned: { label: 'Order later', tone: 'bg-surface-2 text-ink' },
  covered: { label: 'Covered', tone: 'bg-good-soft text-good' },
  no_demand: { label: 'No demand', tone: 'bg-surface-2 text-muted-foreground' },
};
const LEAD = { agreed: 'Agreed', median: 'Median', assumed: 'Assumed' };
const HORIZONS = [4, 8, 12];

const qty = (n) => Number(n ?? 0).toLocaleString('en-ZA', { maximumFractionDigits: 1 });
const day = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The closing balance for each week of the horizon, as bars.
function Projection({ item }) {
  const max = Math.max(item.available, ...item.projection.map((w) => w.balance), 1);
  return (
    <div>
      <h4 className="text-xs font-bold text-ink">Projected closing balance by week ({item.unit})</h4>
      <div className="mt-2 flex items-end gap-1.5" role="img"
        aria-label={`Projected balance: ${item.projection.map((w) => `week ${w.week} ${qty(w.balance)}`).join(', ')}`}>
        {item.projection.map((w) => (
          <div key={w.week} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[11px] tabular-nums text-muted-foreground">{qty(w.balance)}</span>
            <div className="flex h-20 w-full items-end rounded-md bg-surface-2">
              <div className={`w-full rounded-md ${w.balance <= 0 ? 'bg-danger' : w.balance < item.weeklyDemand ? 'bg-warn' : 'bg-ink'}`}
                style={{ height: `${Math.max(w.balance <= 0 ? 4 : 6, (w.balance / max) * 100)}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground">W{w.week}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ item, horizonWeeks, historyWeeks }) {
  const per = (n) => weeklyUseText(n, item.unit) || 'None';
  const planned = item.recipeWeekly + item.standingWeekly;
  const facts = [
    ['Demand used', item.demandLabel],
    ['Planned for slips', planned > 0
      ? `${per(planned)} (recipe ${qty(item.recipeWeekly)}, standing orders ${qty(item.standingWeekly)})`
      : 'None'],
    [`Sent out, ${historyWeeks}-week average`, per(item.historyWeekly)],
    ['On hand, committed', `${fmtQtyUnit(item.onHand, item.unit)}, ${fmtQtyUnit(item.committed, item.unit)} committed`],
    ['Supplier', item.supplier ?? 'None on record'],
    ['Lead time used', item.leadLabel],
    ['On order', item.incoming > 0 ? `${fmtQtyUnit(item.incoming, item.unit)}${item.nextDelivery ? `, next due ${day(item.nextDelivery)}` : ''}` : 'None'],
    ['Runs out on the shelf, nothing arriving', day(item.shelfRunsOutOn)],
  ];
  if (item.overdue > 0) {
    facts.push(['Overdue, chase supplier', `${fmtQtyUnit(item.overdue, item.unit)} on ${plural(item.overdueOrders, 'order')}`
      + (item.ifOverdueArrived ? `. If it arrived today, runs out ${day(item.ifOverdueArrived.runsOutOn)}` : '')]);
  }
  return (
    <div className="grid gap-4 p-3 md:grid-cols-2">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        {item.projection.length > 0 ? <Projection item={item} /> : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Suggested quantity covers {horizonWeeks} weeks of demand, less what is available, on order and overdue.
        </p>
        {item.limits.length > 0 ? (
          <ul className="mt-2 list-disc pl-4 text-xs text-warn" aria-label="Missing data">
            {item.limits.map((l) => <li key={l}>{l}</li>)}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export default function ReorderPlanner() {
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('action');      // 'action' | 'all' | one status
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    getReorderPlan(weeks)
      .then((res) => { if (!cancelled) setData(res.data ?? res); })
      .catch((err) => { if (!cancelled) { setError(err.message); setData(null); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [weeks]);

  const action = useMemo(() => new Set(['out_of_stock', 'order_now', 'order_soon']), []);
  const view = useTableView('reorderPlan', PLAN_COLUMNS);
  const show = view.isVisible;
  const listFilters = useListFilters(PLAN_FILTERS, data?.items ?? []);
  const { apply: applyFilters } = listFilters;
  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return applyFilters(data.items).filter((i) => (status === 'all' ? true : status === 'action' ? action.has(i.status) : i.status === status)
      && (!q || i.name.toLowerCase().includes(q) || (i.supplier ?? '').toLowerCase().includes(q)));
  }, [data, status, query, action, applyFilters]);
  const actionCount = data ? data.items.filter((i) => action.has(i.status)).length : 0;

  const exportSheet = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      await exportExcel({
        filename: `reorder-plan-${data.today}`,
        sheetName: 'Reorder plan',
        title: 'Reorder plan',
        subtitle: `As at ${data.today}  ·  ${data.horizonWeeks}-week planning horizon`,
        columns: [
          { key: 'name', label: 'Product', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'text' },
          { key: 'supplier', label: 'Supplier', kind: 'text' },
          { key: 'unit', label: 'Unit', kind: 'text' },
          { key: 'available', label: 'Available', kind: 'number' },
          { key: 'incoming', label: 'On order', kind: 'number' },
          { key: 'overdue', label: 'Overdue', kind: 'number' },
          { key: 'weeklyDemand', label: 'Weekly demand', kind: 'number' },
          { key: 'demandLabel', label: 'Demand used', kind: 'text' },
          { key: 'daysOfCover', label: 'Days of cover', kind: 'number' },
          { key: 'runsOutOn', label: 'Runs out', kind: 'date' },
          { key: 'leadDays', label: 'Lead time (days)', kind: 'number' },
          { key: 'leadLabel', label: 'Lead time used', kind: 'text' },
          { key: 'orderBy', label: 'Order by', kind: 'date' },
          { key: 'suggestedQuantity', label: 'Suggested order quantity', kind: 'number' },
          { key: 'missing', label: 'Missing data', kind: 'text' },
        ],
        rows: items.map((i) => ({ ...i, status: STATUS[i.status].label, missing: i.limits.join('; ') })),
      });
    } catch (err) {
      setError(err.message || 'Could not make the Excel file. Try again.');
    } finally {
      setExporting(false);
    }
  };

  const chip = (id, label, count) => (
    <button key={id} type="button" aria-pressed={status === id} onClick={() => setStatus(id)}
      className={`rounded-full px-3 py-1 text-xs font-bold ${status === id ? 'bg-ink text-on-ink' : 'border border-line text-ink hover:bg-muted/60'}`}>
      {label} <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );

  return (
    <section aria-labelledby="reorder-heading" className="rounded-4xl bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5">
      <h2 id="reorder-heading" className="text-sm font-bold tracking-tight">Reorder planner</h2>
      <p className="mt-1 text-sm text-ink">Projected run-out and order-by dates for each product. Select a product to view its projection.</p>

      <div className="mt-3">
        <ListToolbar
          search={{ value: query, onChange: setQuery, placeholder: 'Search product or supplier' }}
          filters={listFilters.filters}
          onClearAll={() => { setQuery(''); listFilters.clear(); }}
          columns={{
            idPrefix: 'reorder',
            columns: view.availableColumns,
            hidden: view.hidden,
            onToggle: view.toggleColumn,
            onReset: view.resetColumns,
          }}
          onExport={data && items.length > 0 && !exporting ? exportSheet : undefined}
        >
          <NativeSelect aria-label="Planning horizon" size="sm" className="w-36" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {HORIZONS.map((w) => <option key={w} value={w}>{w}-week horizon</option>)}
          </NativeSelect>
        </ListToolbar>
      </div>

      <ErrorBanner className="mt-3" message={error} />
      {busy && !data ? <Skeleton className="mt-4 h-64 w-full rounded-2xl" /> : null}

      {data ? (
        <div className={busy ? 'opacity-60' : ''}>
          <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Status">
            {chip('action', 'Action required', actionCount)}
            {chip('planned', STATUS.planned.label, data.summary.planned)}
            {chip('covered', STATUS.covered.label, data.summary.covered)}
            {chip('no_demand', STATUS.no_demand.label, data.summary.no_demand)}
            {chip('all', 'All products', data.items.length)}
          </div>

          {items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {status === 'action' && !query ? `No product needs ordering within 7 days on a ${data.horizonWeeks}-week horizon.` : 'No products match.'}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
              <Table>
                <TableHeader>
                  <TableRow>
                    {view.visibleColumns.map((c) => (
                      <TableHead key={c.key} className={c.right ? 'text-right' : ''}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const isOpen = open === i.productId;
                    return (
                      <Fragment key={i.productId}>
                        <TableRow>
                          <TableCell className="min-w-[11rem] whitespace-normal font-semibold">
                            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.productId)}
                              className="text-left text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                              {i.name}
                            </button>
                            {i.limits.length > 0 ? (
                              <span className="block text-[11px] font-normal text-warn" title={i.limits.join('. ')}>
                                {i.limits.length === 1 ? i.limits[0] : `${i.limits.length} gaps in the data, open for detail`}
                              </span>
                            ) : null}
                          </TableCell>
                          {show('status') ? (
                            <TableCell>
                              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
                            </TableCell>
                          ) : null}
                          {show('available') ? <TableCell className="text-right tabular-nums">{fmtQtyUnit(i.available, i.unit)}</TableCell> : null}
                          {show('demand') ? (
                            <TableCell className="text-right tabular-nums">
                              {i.weeklyDemand > 0 ? weeklyUseText(i.weeklyDemand, i.unit) : '-'}
                              <span className="block text-[11px] text-muted-foreground">{i.demandLabel}</span>
                            </TableCell>
                          ) : null}
                          {show('cover') ? <TableCell className="text-right tabular-nums">{i.coverDays === null || i.coverDays === undefined ? '-' : i.coverDays}</TableCell> : null}
                          {show('runsOut') ? <TableCell>{day(i.runsOutOn)}</TableCell> : null}
                          {show('onOrder') ? (
                            <TableCell className="text-right tabular-nums">
                              {i.incoming > 0 ? qty(i.incoming) : '-'}
                              {i.overdue > 0 ? <span className="block text-[11px] font-semibold text-warn">{qty(i.overdue)} overdue</span> : null}
                            </TableCell>
                          ) : null}
                          {show('lead') ? (
                            <TableCell className="text-right tabular-nums" title={i.leadLabel}>
                              {i.status === 'no_demand' ? '-' : (
                                <>
                                  {`${i.leadDays} d${i.leadSource === 'assumed' ? '*' : ''}`}
                                  <span className="block text-[11px] text-muted-foreground">{LEAD[i.leadSource]}</span>
                                </>
                              )}
                            </TableCell>
                          ) : null}
                          {show('orderBy') ? <TableCell className="font-semibold">{day(i.orderBy)}</TableCell> : null}
                          {show('suggested') ? <TableCell className="text-right font-bold tabular-nums">{i.suggestedQuantity > 0 ? fmtQtyUnit(i.suggestedQuantity, i.unit) : '-'}</TableCell> : null}
                        </TableRow>
                        {isOpen ? (
                          <TableRow className="bg-surface hover:bg-surface">
                            <TableCell colSpan={view.visibleColumns.length} className="whitespace-normal"><Detail item={i} horizonWeeks={data.horizonWeeks} historyWeeks={data.historyWeeks} /></TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Demand is what a week of slips takes{data.recipeName ? ` (the ${data.recipeName} recipe for centres on it, standing orders for the rest)` : ' (standing orders)'}, or the {data.historyWeeks}-week average sent out where that cannot be worked out.
            {' '}Available is on hand less packed pallets and approved benevolent requests.
            {' '}Order by is the runs-out date, counting open orders on the day they are due, less the lead time: agreed with the supplier, else the median of past orders, else assumed.
            {' '}Overdue orders do not count towards cover but are taken off the suggested quantity.
            {data.recipeName ? " Today's recipe is used for the whole horizon, so past a season change the plan is only a guide." : ''}
            {data.assumedLeadTimes > 0 ? ` * Lead time assumed at ${data.defaultLeadDays} days for ${plural(data.assumedLeadTimes, 'product')} with no agreed time or delivery history.` : ''}
            {data.agreedLeadTimes === 0 ? ' No supplier has an agreed lead time yet; it is set on the Suppliers screen.' : ''}
          </p>
        </div>
      ) : null}
    </section>
  );
}
