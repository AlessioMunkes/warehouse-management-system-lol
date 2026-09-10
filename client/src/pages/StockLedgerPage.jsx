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
// history drawer on the inventory screen.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Layers, Scale } from "lucide-react";

import StatTile from "../features/taskdashboard/components/StatTile";
import LedgerTable from "../features/InventoryManagement/components/LedgerTable";
import ReconciliationPanel from "../features/InventoryManagement/components/ReconciliationPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLedger, getReconciliation, getLedgerActors, getManifest } from "../services/stockAPI";

// Kept in step with server/src/constants/movementTypes.js. 'picked' is
// omitted: it is never written (stock is deducted at the dispatch
// gate, not at packing), so offering it as a filter would only ever
// return nothing.
const TYPES = [
  { value: "received",   label: "Received" },
  { value: "donated",    label: "Donation" },
  { value: "dispatched", label: "Dispatched" },
  { value: "wastage",    label: "Wastage" },
  { value: "adjustment", label: "Adjustment" },
  { value: "decanted",   label: "Decanting" },
];

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
  const [tab, setTab] = useState("movements");

  const [range, setRange] = useState("30");
  const [productId, setProductId] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [types, setTypes] = useState([]);

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

  const filters = useCallback(() => ({
    from: rangeToFrom(range),
    productId: productId || null,
    performedBy: performedBy || null,
    movementTypes: types,
  }), [range, productId, performedBy, types]);

  // ── First page, and every refetch when a filter changes ────
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

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
  }, [filters]);

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

  const toggleType = (value) => {
    setTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
  };

  const resetFilters = () => {
    setRange("30");
    setProductId("");
    setPerformedBy("");
    setTypes([]);
  };

  const filtersActive = range !== "30" || productId || performedBy || types.length > 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Stock ledger</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every movement of stock through the warehouse, and whether the balances
          still add up.
        </p>
      </header>

      {/* Tabs — two buttons rather than a tab primitive, since there
          is no Tabs component in components/ui and two states do not
          justify adding one. */}
      <div className="flex gap-1 border-b">
        {[
          { id: "movements", label: "Movements" },
          { id: "reconciliation", label: "Reconciliation" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-[#ef3a40] text-[#ef3a40]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "movements" && (
        <>
          {/* ── Filters ─────────────────────────────────────── */}
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <label className="flex flex-col gap-1 text-xs font-medium">
                Period
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  {RANGES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium">
                Product
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="h-9 max-w-[220px] rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">All products</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium">
                Recorded by
                <select
                  value={performedBy}
                  onChange={(e) => setPerformedBy(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Anyone</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col gap-1 text-xs font-medium">
                Movement type
                <div className="flex flex-wrap gap-1">
                  {TYPES.map((t) => {
                    const on = types.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleType(t.value)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          on
                            ? "border-[#ef3a40] bg-[#fff4f2] text-[#ef3a40]"
                            : "border-input text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Reset
                </Button>
              )}
            </CardContent>
          </Card>

          {/* ── Summary ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={ArrowUpRight} label="Stock in"
                      value={summary ? fmtQty(summary.totalIn) : "—"} />
            <StatTile icon={ArrowDownLeft} label="Stock out"
                      value={summary ? fmtQty(Math.abs(summary.totalOut)) : "—"} />
            <StatTile icon={Scale} label="Net change"
                      value={summary ? fmtQty(summary.netChange) : "—"} />
            <StatTile icon={Layers} label="Movements"
                      value={summary ? summary.movementCount : "—"} />
          </div>

          {error && (
            <div className="rounded-md border border-[#ef3a40] bg-[#fff4f2] px-4 py-3 text-sm text-[#ef3a40]">
              {error}
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <LedgerTable rows={rows} isLoading={isLoading} />
            </CardContent>
          </Card>

          {nextCursor && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={isPaging}>
                {isPaging ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      {tab === "reconciliation" && (
        <>
          {reconError && (
            <div className="rounded-md border border-[#ef3a40] bg-[#fff4f2] px-4 py-3 text-sm text-[#ef3a40]">
              {reconError}
            </div>
          )}
          <Card>
            <CardContent className="p-4">
              <ReconciliationPanel data={recon} isLoading={reconLoading} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
