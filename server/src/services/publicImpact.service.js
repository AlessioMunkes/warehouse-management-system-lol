// ─────────────────────────────────────────────────────────────
// server/src/services/publicImpact.service.js
//
// The ONLY reporting numbers this app exposes with no login at all —
// the three counters on the public landing page's "Our impact so
// far" section. Everything else reporting-related lives behind auth
// + requireRole(MANAGER, ADMIN) (reporting.routes.js's own header:
// "There is no worker view of reporting. Manager and admin only."),
// so this is deliberately its own small file rather than one more
// route bolted onto that router, where it would be one accidental
// copy-paste away from losing its `auth` middleware and becoming a
// much bigger hole than intended.
//
// Reuses the SAME repository functions the Impact Calculator itself
// calls — paperSaved, compostProcessed, childrenReached — so the
// landing page and the real report can never quietly disagree about
// what "children fed" means. One function, two callers.
//
// NO CALLER INPUT REACHES THESE CALLS AT ALL.
// No metric choice, no dimension, no date range — nothing to
// validate, because nothing is accepted. This is not a scoped-down
// version of the reporting API; it is three fixed numbers computed
// the same way every time, which is what makes it safe to leave
// unauthenticated.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/reporting.repository.js';
import { runInWarehouse } from '../config/warehouseContext.js';
import { warehouseCodes } from '../config/warehouses.js';

// "So far" is cumulative, not a recent window — a marketing counter
// that reset every quarter would undersell everything before it.
// 2020-01-01 predates this org's own system by a wide margin.
// MAX_RANGE_DAYS (reportCatalog.js) caps a caller-supplied range at
// 730 days for a reason that does not apply here: that guard exists
// because an untrusted request could ask for an enormous range and
// load the database, and nothing here is untrusted — the range below
// is fixed in this file, never taken from a request.
const ALL_TIME_FROM = '2020-01-01';
const todayISO = () => new Date().toISOString().slice(0, 10);

// A short in-process cache — this endpoint has no login and no rate
// limit tight enough to make every page load hit the database, so a
// cache is what keeps a landing page getting real traffic from
// running these three queries on every visit.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

// One metric's table not existing yet (compost_processed's
// collection_kits, same 42P01 case reporting.service.js handles)
// should not take the other two down with it on a page nobody is
// logged in to see a real error on — each call gets its own
// fallback to 0 rather than the whole summary failing.
const safeTotal = async (fn, spec) => {
  try {
    const series = await fn(spec);
    return Math.round(Number(series[0]?.value) || 0);
  } catch {
    return 0;
  }
};

// One warehouse's three totals.
const siteTotals = async (spec) => {
  const [paper, compost, children] = await Promise.all([
    safeTotal(repo.paperSaved, spec),
    safeTotal(repo.compostProcessed, spec),
    safeTotal(repo.childrenReached, spec),
  ]);
  return { paper, compost, children };
};

// Multi-warehouse: the landing page speaks for Ladles of Love as a
// whole, so it shows the organisation-wide total, each site's figures
// added together. This is the ONLY place the system combines data
// across warehouses, and it only ever combines these three counts.
// Each site's own ECDs, compost and paper are separate, so summing
// never double-counts. A site whose database is down contributes 0,
// the same fallback safeTotal already applies per metric.
const getPublicImpactSummary = async () => {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  const dateRange = { from: ALL_TIME_FROM, to: todayISO() };
  const spec = { dimension: 'none', filters: {}, dateRange };

  const codes = warehouseCodes();
  const parts = codes.length
    ? await Promise.all(codes.map((code) => runInWarehouse(code, () => siteTotals(spec))))
    : [await siteTotals(spec)];

  const summary = parts.reduce(
    (total, part) => ({
      paper:    total.paper + part.paper,
      compost:  total.compost + part.compost,
      children: total.children + part.children,
    }),
    { paper: 0, compost: 0, children: 0 },
  );

  cached = summary;
  cachedAt = Date.now();
  return summary;
};

export default { getPublicImpactSummary };
