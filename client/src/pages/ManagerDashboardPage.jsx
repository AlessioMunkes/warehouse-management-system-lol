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
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { STAFF, ADMIN } from '../routes/paths';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import DashboardGreeting from '../features/taskdashboard/components/DashboardGreeting';
import dashboardAPI from '../services/dashboardAPI';
import { runReport } from '../services/reportingAPI';
import { resolvePreset } from '../features/reporting/dateRanges';

import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, Package, ShoppingCart, Truck, Users2,
} from 'lucide-react';

const BENEFICIARY_LABELS = {
  ecd: 'ECDs', soup_kitchen: 'Soup kitchens',
  dignity_kitchen: 'Dignity kitchens', community: 'Community',
};

const ErrorBanner = ({ message }) => (
  <div className="p-3 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm">
    {message}
  </div>
);

const StatTile = ({ icon: Icon, label, value, to, warn }) => {
  const content = (
    <Card className={warn && value > 0 ? 'border-[#ef3a40]' : undefined}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-full p-2 ${warn && value > 0 ? 'bg-[#fff4f2] text-[#ef3a40]' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
};

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

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
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
            <CardHeader><CardTitle>Dispatched by beneficiary type this month</CardTitle></CardHeader>
            <CardContent>
              {reportError ? (
                <ErrorBanner message={reportError} />
              ) : byBeneficiary === null ? (
                <Skeleton className="h-24 w-full" />
              ) : byBeneficiary.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing dispatched yet this month.</p>
              ) : (
                <RankedBars rows={byBeneficiary} labelFor={(l) => BENEFICIARY_LABELS[l] ?? l} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <Card>
            <CardHeader><CardTitle>Quick links</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link to={STAFF.beneficiaries} className="flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-sm hover:bg-muted/50">
                <Users2 className="size-4" /> Beneficiaries
              </Link>
              <Link to={STAFF.reporting} className="flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-sm hover:bg-muted/50">
                <Package className="size-4" /> Full reporting
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </ManagerLayout>
  );
}
