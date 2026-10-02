// ─────────────────────────────────────────────────────────────
// StockLedgerPage.jsx
//
// The manager's view of stock_movements.
//
// The inventory screen answers "what do we have". This answers "how
// did it get that way", which is the question that comes up when the
// shelf and the system disagree — and, on the reconciliation tab,
// whether they disagree at all.
//
// Manager and admin only (mirrored by requireRole on all three
// /api/stock/ledger routes). Warehouse staff keep the per-product
// history on the inventory screen.
//
// Laid out like every manager list: tabs by movement type (the server
// filters on them), the period, product and person as toolbar controls
// whose choices show as removable chips, one summary line, the table.
// Reconciliation is the last tab. The tab is in ?status=.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ViewTabs from "@/components/ui/view-tabs";
import ListToolbar from "@/components/ui/list-toolbar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import LedgerTable from "../features/InventoryManagement/components/LedgerTable";
import TablePager from "@/components/ui/table-pager";
import useSortable from "@/lib/useSortable";
import { LEDGER_SORT } from "../features/InventoryManagement/ledgerSort";
import usePaged, { TABLE_PAGE_SIZE } from "@/features/staff/hooks/usePaged";
import ReconciliationPanel from "../features/InventoryManagement/components/ReconciliationPanel";
import { Card, CardContent } from "@/components/ui/card";
import { getLedger, getReconciliation, getLedgerActors, getManifest } from "../services/stockAPI";

// The tabs, each a set of movement types the server filters on.
// Kept in step with server/src/constants/movementTypes.js. 'picked' is
// in no tab: it is never written (stock is deducted at the dispatch
// gate, not at packing), so it could only ever show nothing.
// Reconciliation is not a movement type; it is the last tab because it
// answers the question the movements raise — do the balances add up.
const VIEWS = [
  { id: "all",            label: "All movements", types: [] },
  { id: "in",             label: "Stock in",      types: ["received", "donated"] },
  { id: "dispatched",     label: "Dispatched",    types: ["dispatched"] },
  { id: "wastage",        label: "Wastage",       types: ["wastage"] },
  { id: "adjustment",     label: "Adjustments",   types: ["adjustment"] },
  { id: "decanted",       label: "Decanting",     types: ["decanted"] },
  { id: "reconciliation", label: "Reconciliation", alert: true },
];
const viewById = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

const RANGES = [
  { value: "7",   label: "Last 7 days" },
  { value: "30",  label: "Last 30 days" },
  { value: "90",  label: "Last 90 days" },
  { value: "all", label: "All time" },
];

// SAST, matching the server's filter. Building this from the local
// clock would put a manager in another timezone a day out of step
// with the rows they are looking at.
const sastToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const rangeToFrom = (range) => {
  if (range === "all") return null;
  const today = new Date(`${sastToday()}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - Number(range));
  return today.toISOString().slice(0, 10);
};

const fmtQty = (n) => (Math.round(Number(n) * 1000) / 1000).toLocaleString("en-ZA");

export default function StockLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewById(searchParams.get("status"));
  const tab = view.id === "reconciliation" ? "reconciliation" : "movements";
  const typeKey = (view.types ?? []).join(",");

  const [range, setRange] = useState("30");
  const [productId, setProductId] = useState("");
  const [performedBy, setPerformedBy] = useState("");

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaging, setIsPaging] = useState(false);
  const [error, setError] = useState(null);

  const [products, setProducts] = useState([]);
  const [actors, setActors] = useState([]);

  const [recon, setRecon] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState(null);

  // ── Filter options ─────────────────────────────────────────
  // Failures here are swallowed on purpose: an empty product dropdown
  // is a degraded filter bar, not a broken page, and the ledger
  // itself still loads.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getManifest(), getLedgerActors()])
      .then(([manifest, people]) => {
        if (cancelled) return;
        setProducts(manifest);
        setActors(people);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // typeKey, a string, rather than the tab's array: the dependency has
  // to be equal from one render to the next or this refetches forever.
  const filters = useCallback(() => ({
    from: rangeToFrom(range),
    productId: productId || null,
    performedBy: performedBy || null,
    movementTypes: typeKey ? typeKey.split(",") : [],
  }), [range, productId, performedBy, typeKey]);

  // ── First page, and every refetch when a filter changes ────
  useEffect(() => {
    if (tab !== "movements") return undefined;
    let cancelled = false;

    getLedger({ ...filters(), limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setRows(res.movements);
        setSummary(res.summary);
        setNextCursor(res.nextCursor);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load the stock ledger.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [filters, tab]);

  // ── Reconciliation, loaded when its tab is first opened ────
  //
  // The guard is a ref, and the effect depends on `tab` alone.
  //
  // Writing this the obvious way — deps [tab, recon, reconLoading],
  // with a `cancelled` flag — deadlocks: setReconLoading(true) changes
  // a dependency, so the effect re-runs, its cleanup sets cancelled on
  // the closure that owns the in-flight request, and when that request
  // resolves every state setter is skipped. The tab then shows a
  // skeleton forever. A ref is not a dependency, so nothing re-runs.
  //
  // No cancelled flag: this page does not unmount while its own tab
  // button is being clicked, and a state set after unmount is a no-op.
  const reconRequested = useRef(false);

  useEffect(() => {
    if (tab !== "reconciliation" || reconRequested.current) return;
    reconRequested.current = true;
    setReconLoading(true);

    getReconciliation()
      .then((res) => { setRecon(res); setReconError(null); })
      .catch((err) => {
        setReconError(err.message || "Could not reconcile balances.");
        // Let a tab switch retry a failed load rather than leaving the
        // manager on an error with no way back to the data.
        reconRequested.current = false;
      })
      .finally(() => setReconLoading(false));
  }, [tab]);

  const loadMore = async () => {
    if (!nextCursor || isPaging) return;
    setIsPaging(true);
    try {
      const res = await getLedger({ ...filters(), limit: 50, cursor: nextCursor });
      setRows((prev) => [...prev, ...res.movements]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err.message || "Could not load more movements.");
    } finally {
      setIsPaging(false);
    }
  };

  // Movements, fifteen to a page; back to page one when a filter
  // changes (a new first page from the server).
  // Click a column to sort. The server sends fifty at a time, newest
  // first; sorting only those would put "the smallest change" on page
  // one while a smaller one sat unloaded. So choosing a sort first
  // fetches the rest of the movements for the current filters (a
  // period's worth, not the whole history), then sorts all of them.
  const ledgerSort = useSortable(rows, LEDGER_SORT);
  const [loadingAll, setLoadingAll] = useState(false);
  const sortLedger = async (key) => {
    ledgerSort.toggle(key);
    if (!nextCursor || loadingAll) return;
    setLoadingAll(true);
    try {
      let cursor = nextCursor;
      const more = [];
      // A cap, so an unfiltered "all time" can never page forever.
      for (let i = 0; cursor && i < 40; i += 1) {
        const res = await getLedger({ ...filters(), limit: 50, cursor });
        more.push(...res.movements);
        cursor = res.nextCursor;
      }
      setRows((prev) => [...prev, ...more]);
      setNextCursor(cursor);
    } catch (err) {
      setError(err.message || "Could not load the rest of the movements to sort.");
    } finally {
      setLoadingAll(false);
    }
  };

  const ledgerPage = usePaged(ledgerSort.rows, TABLE_PAGE_SIZE,
    `${range}|${productId}|${performedBy}|${typeKey}|${ledgerSort.sort?.key}|${ledgerSort.sort?.dir}`);
  // Next on the last loaded page: fetch the next fifty, then step on
  // once they have arrived (the page count only grows on the next render).
  const [advanceWhenLoaded, setAdvanceWhenLoaded] = useState(false);
  if (advanceWhenLoaded && ledgerPage.page < ledgerPage.pages) {
    setAdvanceWhenLoaded(false);
    ledgerPage.next();
  }
  const ledgerNext = async () => {
    if (ledgerPage.page < ledgerPage.pages) { ledgerPage.next(); return; }
    if (!nextCursor) return;
    setAdvanceWhenLoaded(true);
    await loadMore();
  };

  const changeView = (id) => {
    if (id !== "reconciliation") setIsLoading(true);
    setSearchParams(id === "all" ? {} : { status: id }, { replace: true });
  };

  const resetFilters = () => {
    setIsLoading(true);
    setRange("30");
    setProductId("");
    setPerformedBy("");
  };

  // The choices away from the defaults, as chips that undo themselves.
  const chips = [
    range !== "30"
      ? { key: "range", label: RANGES.find((r) => r.value === range)?.label, onRemove: () => { setIsLoading(true); setRange("30"); } }
      : null,
    productId
      ? { key: "product", label: products.find((p) => String(p.id) === productId)?.name ?? "Product", onRemove: () => { setIsLoading(true); setProductId(""); } }
      : null,
    performedBy
      ? { key: "by", label: `By ${actors.find((a) => String(a.id) === performedBy)?.name ?? "someone"}`, onRemove: () => { setIsLoading(true); setPerformedBy(""); } }
      : null,
  ].filter(Boolean);

  const variances = recon?.variances?.length;
  const signed = (n) => `${Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : ""}${fmtQty(Math.abs(Number(n)))}`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-medium">Stock ledger</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every movement of stock through the warehouse, and whether the balances still add up.
      </p>

      <ViewTabs
        className="mt-5"
        label="Ledger views"
        value={view.id}
        onChange={changeView}
        tabs={VIEWS.map((v) => ({
          id: v.id, label: v.label, alert: v.alert,
          // Only Reconciliation has a count worth showing: the movement
          // tabs are paged from the server, so their size is not known
          // until all of it has been fetched.
          count: v.id === "reconciliation" && variances !== undefined ? variances : null,
        }))}
      />

      {tab === "movements" && (
        <div className="mt-6 space-y-4">
          <ListToolbar chips={chips} onClearAll={resetFilters}>
            <Select value={range} onValueChange={(v) => { setIsLoading(true); setRange(v); }}>
              <SelectTrigger aria-label="Period" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={productId || "any"} onValueChange={(v) => { setIsLoading(true); setProductId(v === "any" ? "" : v); }}>
              <SelectTrigger aria-label="Product" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All products</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={performedBy || "any"} onValueChange={(v) => { setIsLoading(true); setPerformedBy(v === "any" ? "" : v); }}>
              <SelectTrigger aria-label="Recorded by" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anyone</SelectItem>
                {actors.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </ListToolbar>

          {/* One line in place of four tiles: the totals for exactly
              what the tab and filters select, from the server. */}
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {summary ? (
              <>
                In <span className="font-medium text-good">{signed(summary.totalIn)}</span>
                {" · "}Out <span className="font-medium text-danger">{signed(summary.totalOut)}</span>
                {" · "}Net <span className="font-medium text-foreground">{signed(summary.netChange)}</span>
                {" · "}{summary.movementCount} movement{summary.movementCount === 1 ? "" : "s"}
                {summary.productCount ? ` across ${summary.productCount} product${summary.productCount === 1 ? "" : "s"}` : ""}
              </>
            ) : " "}
          </p>

          {error && (
            <div className="rounded-md border border-brand bg-danger-soft px-4 py-3 text-sm text-brand">
              {error}
            </div>
          )}

          <Card className="py-0">
            <CardContent className="p-0">
              <LedgerTable rows={ledgerPage.slice} isLoading={isLoading || loadingAll} sort={ledgerSort.sort} onSort={sortLedger} />
              {/* Fifteen to a page. The server sends fifty at a time, so
                  Next on the last loaded page fetches the next fifty
                  and moves on to them. */}
              <TablePager
                {...ledgerPage}
                noun="movements"
                hasMore={Boolean(nextCursor)}
                loading={isPaging}
                next={ledgerNext}
                className="border-t px-3"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "reconciliation" && (
        <div className="mt-6 space-y-4">
          {reconError && (
            <div className="rounded-md border border-brand bg-danger-soft px-4 py-3 text-sm text-brand">
              {reconError}
            </div>
          )}
          <Card>
            <CardContent className="p-4">
              <ReconciliationPanel data={recon} isLoading={reconLoading} />
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
