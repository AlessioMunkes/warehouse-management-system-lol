// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ReorderPlanner.jsx
//
// THE REORDER PLANNER on the Operations reports page: for each product,
// when it runs out at the rate it is going, the date an order has to
// be raised by, and how much to order to cover the planning horizon.
//
// The server works all of it out (server/src/features/reporting/
// reorderPlan.js, which says where demand and lead time come from).
// This lays it out most urgent first, lets the list be narrowed to one
// status, opens a product to its week-by-week projection, and exports
// the plan as an order sheet.
// ─────────────────────────────────────────────────────────────
import { Fragment, useEffect, useMemo, useState } from 'react';
import NativeSelect from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBanner from '@/components/ui/error-banner';
import { getReorderPlan } from '../../services/reportingAPI';
import { exportExcel } from '../../lib/excelExport';

const STATUS = {
  out_of_stock: { label: 'Out of stock', tone: 'bg-danger-soft text-danger' },
  order_now: { label: 'Order now', tone: 'bg-danger-soft text-danger' },
  order_soon: { label: 'Order within 7 days', tone: 'bg-warn-soft text-warn' },
  planned: { label: 'Order later', tone: 'bg-surface-2 text-ink' },
  covered: { label: 'Covered', tone: 'bg-good-soft text-good' },
  no_demand: { label: 'No demand', tone: 'bg-surface-2 text-muted-foreground' },
};
const BASIS = { standing_orders: 'Standing orders', dispatch_history: 'Dispatch history' };
const HORIZONS = [4, 8, 12];

const qty = (n) => Number(n ?? 0).toLocaleString('en-ZA', { maximumFractionDigits: 1 });
const day = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// The closing balance for each week of the horizon, as bars.
function Projection({ item }) {
  const max = Math.max(item.onHand, ...item.projection.map((w) => w.balance), 1);
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
  const facts = [
    ['Demand basis', BASIS[item.demandBasis] ?? '-'],
    ['Standing-order demand', `${qty(item.standingWeekly)} ${item.unit} per week`],
    [`Dispatched, ${historyWeeks}-week average`, `${qty(item.actualWeekly)} ${item.unit} per week`],
    ['Reorder level', `${qty(item.reorderLevel)} ${item.unit}`],
    ['Supplier', item.supplier ?? 'No purchase history'],
    ['Lead time', `${item.leadDays} days${item.leadAssumed ? ' (assumed, no receipt history)' : ' (median, PO raised to first receipt)'}`],
    ['On order', item.onOrder > 0 ? `${qty(item.onOrder)} ${item.unit}${item.nextDelivery ? `, due ${day(item.nextDelivery)}` : ''}` : 'None'],
    ['Stock-out including open orders', day(item.stockOutWithOrders)],
  ];
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
          Suggested quantity covers {horizonWeeks} weeks of demand, less stock on hand and on order.
          {item.excludedOrderLines > 0 ? ` ${item.excludedOrderLines} standing order line${item.excludedOrderLines === 1 ? ' is' : 's are'} in a different unit and excluded from demand.` : ''}
        </p>
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
  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((i) => (status === 'all' ? true : status === 'action' ? action.has(i.status) : i.status === status)
      && (!q || i.product.toLowerCase().includes(q) || (i.supplier ?? '').toLowerCase().includes(q)));
  }, [data, status, query, action]);
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
          { key: 'product', label: 'Product', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'text' },
          { key: 'supplier', label: 'Supplier', kind: 'text' },
          { key: 'unit', label: 'Unit', kind: 'text' },
          { key: 'onHand', label: 'On hand', kind: 'number' },
          { key: 'onOrder', label: 'On order', kind: 'number' },
          { key: 'weeklyDemand', label: 'Weekly demand', kind: 'number' },
          { key: 'basis', label: 'Demand basis', kind: 'text' },
          { key: 'daysOfCover', label: 'Days of cover', kind: 'number' },
          { key: 'stockOut', label: 'Projected stock-out', kind: 'date' },
          { key: 'leadDays', label: 'Lead time (days)', kind: 'number' },
          { key: 'orderBy', label: 'Order by', kind: 'date' },
          { key: 'suggestedQuantity', label: 'Suggested order quantity', kind: 'number' },
        ],
        rows: items.map((i) => ({ ...i, status: STATUS[i.status].label, basis: BASIS[i.demandBasis] ?? '' })),
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
      <p className="mt-1 text-sm text-ink">Projected stock-out and order-by dates for each product. Select a product to view its projection.</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Planning horizon
          <NativeSelect className="w-36" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {HORIZONS.map((w) => <option key={w} value={w}>{w} weeks</option>)}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Search
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Product or supplier"
            className="h-9 w-52 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </label>
        {data && items.length > 0 ? (
          <button type="button" onClick={exportSheet} disabled={exporting}
            className="ml-auto text-xs font-semibold text-ink underline underline-offset-2 disabled:opacity-60">
            {exporting ? 'Preparing' : 'Export to Excel'}
          </button>
        ) : null}
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
              <table className="w-full min-w-[56rem] border-collapse text-xs">
                <thead className="bg-surface-2 text-left">
                  <tr>
                    {['Product', 'Status', 'On hand', 'Weekly demand', 'Days of cover', 'Projected stock-out', 'On order', 'Lead time', 'Order by', 'Suggested order'].map((h, i) => (
                      <th key={h} scope="col" className={`whitespace-nowrap px-3 py-2 font-semibold text-ink ${i >= 2 && ![5, 8].includes(i) ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const isOpen = open === i.productId;
                    return (
                      <Fragment key={i.productId}>
                        <tr className="border-t border-line">
                          <th scope="row" className="min-w-[11rem] px-3 py-2 text-left font-semibold">
                            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.productId)}
                              className="text-left text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                              {i.product}
                            </button>
                          </th>
                          <td className="px-3 py-2">
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{qty(i.onHand)} {i.unit}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{i.weeklyDemand > 0 ? qty(i.weeklyDemand) : '-'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{i.daysOfCover === null ? '-' : qty(i.daysOfCover)}</td>
                          <td className="whitespace-nowrap px-3 py-2">{day(i.stockOut)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{i.onOrder > 0 ? qty(i.onOrder) : '-'}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{i.status === 'no_demand' ? '-' : `${i.leadDays} d${i.leadAssumed ? '*' : ''}`}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold">{day(i.orderBy)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{i.suggestedQuantity > 0 ? `${qty(i.suggestedQuantity)} ${i.unit}` : '-'}</td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-t border-line bg-surface">
                            <td colSpan={10}><Detail item={i} horizonWeeks={data.horizonWeeks} historyWeeks={data.historyWeeks} /></td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Demand is the weekly standing-order quantity, or the {data.historyWeeks}-week dispatch average where a product has no standing order.
            Order by is the projected stock-out, including open orders, less supplier lead time.
            {data.assumedLeadTimes > 0 ? ` * Lead time assumed at ${data.defaultLeadDays} days for ${data.assumedLeadTimes} product${data.assumedLeadTimes === 1 ? '' : 's'} with no receipt history.` : ''}
          </p>
        </div>
      ) : null}
    </section>
  );
}
