// ─────────────────────────────────────────────────────────────
// client/src/pages/ManagerDashboardPage.jsx
//
// The real manager home screen at /manager, superseding the old
// task-grid-only ManagerActivityScreen.jsx (removed — nothing else
// routed to it, so it would otherwise just be dead code). Wrapped in
// ManagerLayout's sidebar rather than TopNavbar.
//
// Panel choices are the Zoho-inspired set approved this session,
// adapted rather than copied verbatim — see the plan discussion for
// the full adopt/skip breakdown. Nothing here invents a new backend
// beyond dashboard.repository.js's getSummary: "most dispatched
// products" and "dispatched by beneficiary type" both reuse the
// existing dispatch_volume reporting metric with a different
// dimension, exactly the way ReportingPage.jsx's own report builder
// would run them by hand.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { STAFF, ADMIN } from '../routes/paths';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import DonutStat from '../features/taskdashboard/components/DonutStat';
import StatTile from '../features/taskdashboard/components/StatTile';
import dashboardAPI from '../services/dashboardAPI';
import { runReport } from '../services/reportingAPI';
import { resolvePreset } from '../features/reporting/dateRanges';

import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, Package, ShoppingCart, Truck,
} from 'lucide-react';

const BENEFICIARY_LABELS = {
  ecd: 'ECDs', soup_kitchen: 'Soup kitchens',
  dignity_kitchen: 'Dignity kitchens', community: 'Community',
};

// One fixed palette, reused across every donut on this page rather
// than each panel inventing its own — a legend only reads as
// consistent if red always means the same kind of thing.
const DONUT_COLORS = ['#2b3336', '#ef3a40', '#c9a86a', '#6b8f71', '#8a8a8a'];

const ErrorBanner = ({ message }) => (
  <div className="p-3 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm">
    {message}
  </div>
);

// A small ranked bar list — reused for both "most dispatched
// products" and "dispatched by beneficiary type," which are the same
// shape (label + kg) with a different dimension.
const RankedBars = ({ rows, labelFor }) => {
  const max = Math.max(1, ...rows.map((r) => Number(r.value ?? 0)));
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const value = Number(row.value ?? 0);
        return (
          <div key={row.label}>
            <div className="flex justify-between text-sm">
              <span>{labelFor ? labelFor(row.label) : row.label}</span>
              <span className="text-muted-foreground">{value.toLocaleString('en-ZA')} kg</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-[#2b3336]"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function ManagerDashboardPage() {
  const { user } = useAuth();

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [topProducts, setTopProducts] = useState(null);
  const [byBeneficiary, setByBeneficiary] = useState(null);
  const [reportError, setReportError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    dashboardAPI.getDashboardSummary()
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch((err) => { if (!cancelled) setSummaryError(err.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const dateRange = resolvePreset('this_month');

    Promise.all([
      runReport({ metric: 'dispatch_volume', dimension: 'product', filters: {}, dateRange }),
      runReport({ metric: 'dispatch_volume', dimension: 'beneficiary', filters: {}, dateRange }),
    ])
      .then(([productsRes, beneficiaryRes]) => {
        if (cancelled) return;
        const products = (productsRes.data ?? productsRes)?.data ?? [];
        const beneficiary = (beneficiaryRes.data ?? beneficiaryRes)?.data ?? [];
        setTopProducts(
          [...products].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5)
        );
        setByBeneficiary(beneficiary);
      })
      .catch((err) => { if (!cancelled) setReportError(err.message); });

    return () => { cancelled = true; };
  }, []);

  const summaryLine = summary
    ? [
        summary.pendingDispatchesToday > 0 ? `${summary.pendingDispatchesToday} pallet${summary.pendingDispatchesToday === 1 ? '' : 's'} due out today` : null,
        summary.deliveriesExpectedToday > 0 ? `${summary.deliveriesExpectedToday} ${summary.deliveriesExpectedToday === 1 ? 'delivery' : 'deliveries'} expected` : null,
      ].filter(Boolean).join(', ') || "nothing's overdue today"
    : null;

  return (
    <ManagerLayout>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <DashboardGreeting name={user?.firstName} summaryLine={summaryLine} />

        {summaryError ? <div className="mt-4"><ErrorBanner message={summaryError} /></div> : null}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary ? (
            <>
              <StatTile icon={AlertTriangle} label="Low stock items" value={summary.lowStockCount} to="/noc/inventory" warn />
              <StatTile icon={ShoppingCart} label="Open purchase orders" value={summary.openPurchaseOrders} to={STAFF.purchaseOrders} />
              <StatTile icon={Truck} label="Pending dispatches today" value={summary.pendingDispatchesToday} to={STAFF.pickingSlips} />
              <StatTile icon={Package} label="Active products" value={summary.activeProductCount} to={ADMIN.products} />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card className="sm:col-span-2">
            <CardHeader><CardTitle>Most dispatched products this month</CardTitle></CardHeader>
            <CardContent>
              {reportError ? (
                <ErrorBanner message={reportError} />
              ) : topProducts === null ? (
                <Skeleton className="h-24 w-full" />
              ) : topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing dispatched yet this month.</p>
              ) : (
                <RankedBars rows={topProducts} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Product health</CardTitle></CardHeader>
            <CardContent>
              {summary ? (
                <DonutStat
                  centerValue={summary.activeProductCount}
                  centerLabel="active"
                  segments={[
                    { label: 'Healthy stock', value: Math.max(0, summary.activeProductCount - summary.lowStockCount), color: DONUT_COLORS[0] },
                    { label: 'Low stock', value: summary.lowStockCount, color: DONUT_COLORS[1] },
                  ]}
                />
              ) : (
                <Skeleton className="h-24 w-full" />
              )}
            </CardContent>
          </Card>

          <Card className="sm:col-span-2">
            <CardHeader><CardTitle>Dispatched by beneficiary type this month</CardTitle></CardHeader>
            <CardContent>
              {reportError ? (
                <ErrorBanner message={reportError} />
              ) : byBeneficiary === null ? (
                <Skeleton className="h-24 w-full" />
              ) : byBeneficiary.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing dispatched yet this month.</p>
              ) : (
                <DonutStat
                  centerValue={byBeneficiary.reduce((s, r) => s + Number(r.value), 0).toLocaleString('en-ZA')}
                  centerLabel="kg total"
                  segments={byBeneficiary.map((row, i) => ({
                    label: BENEFICIARY_LABELS[row.label] ?? row.label,
                    value: Number(row.value),
                    color: DONUT_COLORS[i % DONUT_COLORS.length],
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ManagerLayout>
  );
}
