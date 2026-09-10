#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 17-phase2-interactivity.sh
#
# Phase 2. No migration — every table this reads already exists.
#
#   TOASTS WITH UNDO
#     There was no toast library at all, and InventoryManagementPage
#     reported save failures with window.alert(). A small provider
#     (no dependency) replaces it, and a successful stock adjustment
#     now offers Undo.
#
#     Undo posts the INVERSE delta. It does not erase anything: the
#     reversal is its own movement, so the ledger still shows what
#     happened and the reconciliation screen still balances. Undoing
#     an audit trail would defeat the point of having one.
#
#   EMPTY STATES
#     A shared component, so a screen with nothing on it offers the
#     action that fills it instead of saying "No records found".
#
#   SKELETONS ON THE INVENTORY TABLE
#     It was the one screen still showing a bare "Loading stock
#     levels..." while eighteen others used the Skeleton primitive.
#
#   SPARKLINES
#     A 30-day stock-level trace per product, from a new
#     GET /api/stock/trends. Hand-rolled SVG, matching ReportChart
#     and DonutStat — no charting library is added.
#
#   StockHealthBar was already wired into the page (line 144), so
#   there was nothing to do there. A second per-row level bar was
#   deliberately NOT added: the table is fixed-layout and fitting on
#   screen without horizontal scroll was hard-won.
#
# Idempotent. Aborts without writing if the source has drifted.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ ! -f server/src/repositories/stock.repository.js ] || [ ! -d client/src ]; then
  echo "ERROR: run this from the repository root (the folder containing client/ and server/)." >&2
  exit 1
fi

if ! grep -q "getLedgerActors" server/src/repositories/stock.repository.js 2>/dev/null; then
  echo "ERROR: script 16 (the manager stock ledger) has not been applied to this checkout." >&2
  exit 1
fi

python3 - <<'PYEOF'
import os, sys

CHANGES = 0
FAILED  = []

def _read(p):
    with open(p, 'rb') as f:
        b = f.read()
    return b.decode('utf-8').replace('\r\n', '\n'), (b'\r\n' in b)

def _write(p, s, crlf):
    with open(p, 'wb') as f:
        f.write((s.replace('\n', '\r\n') if crlf else s).encode('utf-8'))

def patch(path, old, new, label):
    global CHANGES
    if not os.path.exists(path):
        FAILED.append("%s: file not found (%s)" % (label, path)); return
    s, crlf = _read(path)
    if new in s:
        print("  = %s (already applied)" % label); return
    if old not in s:
        FAILED.append("%s: anchor not found in %s" % (label, path)); return
    n = s.count(old)
    if n != 1:
        FAILED.append("%s: anchor appears %d times in %s (expected 1)" % (label, n, path)); return
    _write(path, s.replace(old, new, 1), crlf)
    CHANGES += 1
    print("  + %s" % label)

def write_file(path, body, label):
    global CHANGES
    if os.path.exists(path):
        cur, _ = _read(path)
        if cur == body:
            print("  = %s (already written)" % label); return
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    _write(path, body, False)
    CHANGES += 1
    print("  + %s" % label)

# ══════════════════════════════════════════════════════════════
print("1  server: stock trends")
# ══════════════════════════════════════════════════════════════

patch('server/src/repositories/stock.repository.js',
"""
export default {
  getLedger, getLedgerSummary, getReconciliation, getLedgerActors,""",
"""// ── 30-day stock level trace, for the inventory sparklines ─────
//
// One row per product per day: what the balance was at the END of
// that day, for every day in the window.
//
// THE PRE-WINDOW BALANCE HAS TO CARRY IN.
// `closing` walks the product's ENTIRE movement history, not just the
// window, so a product whose last movement was two months ago still
// plots its real balance as a flat line rather than starting from
// zero. Restricting the window before the window function — the
// obvious way to write this — draws every long-settled product as a
// step up from nothing on the first day of the chart.
//
// Days with no movement inherit the last known closing balance. That
// is the correlated subquery at the bottom: for each (product, day),
// the most recent closing on or before that day. It runs
// products x days times, which at this warehouse (tens of products,
// 30 days) is a few hundred index lookups and costs nothing. If the
// catalogue ever grows into the thousands, the fix is a lateral join
// or a materialised daily balance — not dropping the carry-in.
//
// Products that have never had a movement are excluded rather than
// returned as a flat zero line: thirty rows saying nothing happened
// is not information, and the client renders those as a dash.
const getStockTrends = async ({ days = 30 } = {}) => {
  const result = await pool.query(
    `WITH bounds AS (
       SELECT ((now() AT TIME ZONE 'Africa/Johannesburg')::date - ($1::int - 1)) AS from_day,
              (now() AT TIME ZONE 'Africa/Johannesburg')::date                    AS to_day
     ),
     daily AS (
       SELECT sm.product_id,
              (sm.created_at AT TIME ZONE 'Africa/Johannesburg')::date AS day,
              SUM(sm.quantity)::numeric                                AS net
       FROM stock_movements sm
       GROUP BY 1, 2
     ),
     closing AS (
       SELECT product_id, day,
              SUM(net) OVER (PARTITION BY product_id
                             ORDER BY day
                             ROWS UNBOUNDED PRECEDING) AS balance
       FROM daily
     ),
     series AS (
       SELECT p.id AS product_id, d.day::date AS day
       FROM products p
       CROSS JOIN bounds b
       CROSS JOIN LATERAL generate_series(b.from_day, b.to_day, INTERVAL '1 day') AS d(day)
       WHERE p.is_active = true
         AND EXISTS (SELECT 1 FROM daily dd WHERE dd.product_id = p.id)
     )
     SELECT s.product_id,
            s.day,
            COALESCE((
              SELECT c.balance
              FROM closing c
              WHERE c.product_id = s.product_id AND c.day <= s.day
              ORDER BY c.day DESC
              LIMIT 1
            ), 0)::numeric AS balance
     FROM series s
     ORDER BY s.product_id, s.day`,
    [days],
  );
  return result.rows;
};

export default {
  getStockTrends,
  getLedger, getLedgerSummary, getReconciliation, getLedgerActors,""",
"repository: getStockTrends")

patch('server/src/services/stock.service.js',
"""const getLedgerActors = async () => stockModel.getLedgerActors();""",
"""const getLedgerActors = async () => stockModel.getLedgerActors();

// ── Stock trends ───────────────────────────────────────────────
// Flat (product, day, balance) rows become one array of numbers per
// product, in day order, which is all a sparkline needs. Grouping
// here rather than in the component means the page does no reshaping
// and a second consumer gets the same shape for free.
//
// The cap is 90 days: the window is drawn about ninety pixels wide,
// so a longer range would render more points than there are pixels.
const MAX_TREND_DAYS     = 90;
const DEFAULT_TREND_DAYS = 30;

const getStockTrends = async (query = {}) => {
  const raw = query.days;
  let days = DEFAULT_TREND_DAYS;

  if (raw !== undefined && raw !== null && raw !== '') {
    days = Number(raw);
    if (!Number.isInteger(days) || days < 2 || days > MAX_TREND_DAYS) {
      fail(400, `Days must be a whole number between 2 and ${MAX_TREND_DAYS}.`);
    }
  }

  const rows = await stockModel.getStockTrends({ days });

  const byProduct = {};
  for (const row of rows) {
    // NUMERIC arrives from node-postgres as a string. Casting here
    // rather than in the component is the same rule stockAPI.js
    // already follows: "-5" < 0 is false, and a sparkline built from
    // strings plots nothing.
    (byProduct[row.product_id] ||= []).push(Number(row.balance));
  }

  return { days, series: byProduct };
};""",
"service: getStockTrends")

patch('server/src/services/stock.service.js',
"""export default {
  getManifest, getMovements, adjustManually,
  getLedger, getReconciliation, getLedgerActors,
};""",
"""export default {
  getManifest, getMovements, adjustManually,
  getLedger, getReconciliation, getLedgerActors,
  getStockTrends,
};""",
"service: export getStockTrends")

patch('server/src/controllers/stock.controller.js',
"""export default {
  getManifest,
  getMovements,
  adjustManually,""",
"""// ── 30-day stock level trace (all roles) ─────────────────────────
// GET /api/stock/trends?days=30
// Returns: { days, series: { [productId]: number[] } }
const getStockTrends = async (req, res) => {
  try {
    const data = await stockService.getStockTrends(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getStockTrends]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve stock trends.',
    });
  }
};

export default {
  getManifest,
  getMovements,
  adjustManually,
  getStockTrends,""",
"controller: getStockTrends")

# Appended AFTER script 16's ledger block, not before its heading —
# inserting above that comment splits 16's own inserted block, so its
# "already applied" check fails and it re-adds the ledger routes on
# every subsequent run. Same fight over one anchor that duplicated
# STORAGE_AREAS; here it duplicated three route declarations.
#
# Still above /:id/history, which is what actually matters: Express
# matches in declaration order and '/trends' would otherwise be
# swallowed as an id.
patch('server/src/routes/stock.routes.js',
"""router.get('/ledger',                auth, requireRole(...MANAGERS_UP), stockController.getLedger);""",
"""router.get('/ledger',                auth, requireRole(...MANAGERS_UP), stockController.getLedger);

// ── Trends (all roles) ────────────────────────────────────────
// The sparkline data for the inventory screen. Gated like GET /api/stock
// rather than like the ledger: it is the same manifest with a time
// axis, not a supervisory view.
router.get('/trends', auth, requireRole(...ALL_ROLES), stockController.getStockTrends);""",
"routes: GET /api/stock/trends")

# ══════════════════════════════════════════════════════════════
print("2  client API")
# ══════════════════════════════════════════════════════════════

patch('client/src/services/stockAPI.js',
"""export default {
  getManifest, getMovements, adjustStock,
  getLedger, getReconciliation, getLedgerActors,
};""",
"""// ── GET /api/stock/trends ─────────────────────────────────────
// { [productId]: number[] } — the balance at the end of each day,
// oldest first. Products that have never moved are absent, and the
// table renders those as a dash rather than a flat line.
export const getStockTrends = async (days) => {
  const qs   = days ? `?days=${encodeURIComponent(days)}` : "";
  const body = await apiGet(`/api/stock/trends${qs}`);
  const series = body.data?.series ?? {};

  // Keys arrive as strings (JSON object keys always are) but products
  // are keyed by integer id everywhere else, so the lookup in the
  // table would silently miss. Normalise once, here.
  const out = {};
  for (const [productId, points] of Object.entries(series)) {
    out[Number(productId)] = (points ?? []).map(Number);
  }
  return out;
};

export default {
  getManifest, getMovements, adjustStock,
  getLedger, getReconciliation, getLedgerActors,
  getStockTrends,
};""",
"stockAPI: getStockTrends")

# ══════════════════════════════════════════════════════════════
print("3  toast primitive")
# ══════════════════════════════════════════════════════════════

# Context and hook live in a .js file, the component in a .jsx —
# react-refresh/only-export-components is an ERROR in this project, and
# a module exporting both a component and a hook trips it. Same split
# as features/taskdashboard/components/shellContext.js.
write_file('client/src/components/ui/toastContext.js', """// ─────────────────────────────────────────────────────────────
// client/src/components/ui/toastContext.js
//
// The toast context and its hook, kept apart from the provider
// component on purpose: react-refresh/only-export-components is an
// error in this project's eslint config, and a module that exports
// both a component and a plain function trips it. shellContext.js
// exists for exactly the same reason.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

// Returns `toast(options)`.
//
//   toast({ title, description?, variant?, duration?, action? })
//
//   variant   'default' | 'success' | 'error'
//   duration  ms; an action needs time to be read and clicked, so
//             pass something generous (see ACTION_DURATION).
//   action    { label, onClick } — rendered as a button in the toast.
//
// Outside a provider this is a no-op that returns null rather than
// throwing. A missing toast should never be the thing that takes a
// screen down, and it keeps components testable in isolation.
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) return () => null;
  return ctx;
};
""", "toastContext.js")

write_file('client/src/components/ui/toast.jsx', """// ─────────────────────────────────────────────────────────────
// client/src/components/ui/toast.jsx
//
// A small toast stack. No dependency: the project had no toast
// library, and adding one for four call sites is not worth the
// bundle or the second set of styling conventions.
//
// Bottom-right on desktop. On the worker flow the tab bar is fixed at
// the bottom, so the stack sits above it — --stf-tabbar-h is defined
// on .stf-shell in staff.css, and the fallback covers every screen
// that has no tab bar.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { ToastContext } from './toastContext';

const DEFAULT_DURATION = 4500;

// An undo has to survive being read, understood and clicked. Four
// seconds is enough to notice a toast and not enough to act on it.
export const ACTION_DURATION = 9000;

const VARIANT = {
  default: { icon: Info,          cls: 'border-[#cfc7bd] bg-white' },
  success: { icon: CheckCircle2,  cls: 'border-[#2f855a] bg-[#f2fbf5]' },
  error:   { icon: AlertTriangle, cls: 'border-[#ef3a40] bg-[#fff4f2]' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Timers are held in a ref, not state: clearing them must not
  // trigger a render, and on unmount every one has to be cancelled or
  // a dismiss fires against a gone component.
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const held = timers.current;
    return () => {
      for (const timer of held.values()) clearTimeout(timer);
      held.clear();
    };
  }, []);

  const toast = useCallback((options = {}) => {
    const {
      title, description, variant = 'default', action,
      duration = action ? ACTION_DURATION : DEFAULT_DURATION,
    } = options;

    // Date.now() alone collides when two toasts are raised in the
    // same millisecond — which is exactly what a save-then-confirm
    // pair does. React then renders two children with the same key.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setToasts((prev) => [...prev, { id, title, description, variant, action }]);

    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* aria-live polite, not assertive: these confirm something the
          user just did. Interrupting a screen reader mid-sentence to
          say "saved" is worse than waiting for a pause. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        style={{ bottom: 'calc(var(--stf-tabbar-h, 0px) + 1rem)' }}
      >
        {toasts.map((t) => {
          const { icon: Icon, cls } = VARIANT[t.variant] ?? VARIANT.default;
          return (
            <div
              key={t.id}
              role={t.variant === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-[4px] border-2 p-3 shadow-md ${cls}`}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />

              <div className="min-w-0 flex-1">
                {t.title && <p className="text-sm font-semibold leading-snug">{t.title}</p>}
                {t.description && (
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t.description}</p>
                )}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => { dismiss(t.id); t.action.onClick?.(); }}
                    className="mt-2 text-xs font-semibold underline underline-offset-2 hover:text-[#ef3a40]"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
""", "toast.jsx")

# ══════════════════════════════════════════════════════════════
print("4  empty state")
# ══════════════════════════════════════════════════════════════

write_file('client/src/components/ui/empty-state.jsx', """// ─────────────────────────────────────────────────────────────
// client/src/components/ui/empty-state.jsx
//
// One empty state for the whole app.
//
// Before this there were four shapes of "nothing here" — a
// stock-empty-state div, a .stf-empty div, a colSpan table cell and a
// bare muted paragraph — and none of them offered a way out. An empty
// screen is the moment someone is most likely to be stuck, so the
// action that fills it belongs right there.
//
// `action` is optional because some empty states are good news: the
// reconciliation tab having nothing to show is the desired outcome,
// not a dead end.
// ─────────────────────────────────────────────────────────────
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-12 text-center ${className}`}>
      {Icon && (
        <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}

      <p className="text-sm font-medium">{title}</p>

      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 text-xs font-semibold underline underline-offset-2 hover:text-[#ef3a40]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
""", "empty-state.jsx")

# ══════════════════════════════════════════════════════════════
print("5  sparkline")
# ══════════════════════════════════════════════════════════════

write_file('client/src/features/InventoryManagement/components/Sparkline.jsx', """// ─────────────────────────────────────────────────────────────
// Sparkline.jsx
//
// A 30-day stock level trace, drawn as inline SVG.
//
// Hand-rolled rather than pulling in a chart library, matching
// ReportChart.jsx and DonutStat.jsx — this is one polyline and the
// project already draws its own charts. A charting dependency for a
// 90x24 line would be the largest thing in the bundle.
//
// Colour follows DIRECTION, not value: stock going down is the thing
// a manager is scanning for. A flat line is muted, because "nothing
// changed" is neither good nor bad.
// ─────────────────────────────────────────────────────────────
const WIDTH  = 90;
const HEIGHT = 24;
const PAD    = 2;

export default function Sparkline({ points, unit = '' }) {
  // No series at all means this product has never moved — the server
  // omits those rather than sending thirty zeroes. A single point is
  // not a line.
  if (!Array.isArray(points) || points.length < 2) {
    return <span className="text-xs text-muted-foreground" aria-hidden="true">—</span>;
  }

  const first = points[0];
  const last  = points[points.length - 1];
  const min   = Math.min(...points);
  const max   = Math.max(...points);

  // A flat series has zero range; dividing by it puts every y at NaN
  // and the polyline disappears without an error. Draw it down the
  // middle instead.
  const range = max - min;
  const innerH = HEIGHT - PAD * 2;
  const innerW = WIDTH  - PAD * 2;

  const coords = points.map((value, i) => {
    const x = PAD + (i / (points.length - 1)) * innerW;
    const y = range === 0
      ? HEIGHT / 2
      : PAD + innerH - ((value - min) / range) * innerH;
    return [x, y];
  });

  const path = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = coords[coords.length - 1];

  const delta = last - first;
  const stroke = delta < 0 ? '#ef3a40' : delta > 0 ? '#2f855a' : '#9a9a9a';

  const round = (n) => Math.round(Number(n) * 100) / 100;
  const label =
    `${round(first)} to ${round(last)} ${unit}`.trim() +
    ` over ${points.length} days (${delta > 0 ? '+' : ''}${round(delta)})`;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      className="overflow-visible"
    >
      <title>{label}</title>
      <polyline
        points={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The trailing dot marks "you are here" — without it a line
          that ends flat reads as though the chart was cut off. */}
      <circle cx={lastX} cy={lastY} r="2" fill={stroke} />
    </svg>
  );
}
""", "Sparkline.jsx")

# ══════════════════════════════════════════════════════════════
print("6  mount the provider")
# ══════════════════════════════════════════════════════════════

# Anchored on script 16's StockLedgerPage import, NOT on the
# ManagerDashboardPage line above it — 16 already anchors there, and
# two scripts inserting after the same line take turns breaking each
# other's contiguity check and duplicating on every re-run. That is
# the same failure that put a duplicate `import { STORAGE_AREAS }`
# on staging; here it produced a duplicate ToastProvider and a
# "Identifier 'ToastProvider' has already been declared" parse error.
# Appending AFTER the StockLedgerPage line leaves 16's own block
# (ManagerDashboardPage + StockLedgerPage) contiguous, so both stay
# idempotent.
# Guarded on the BINDING, not on the two-line block. An earlier build
# of this script anchored on the ManagerDashboardPage import, which
# script 16 also anchors on, so the import could already be present a
# line or two away from where this one puts it. Testing for the block
# would not see it and would add a second `import { ToastProvider }` —
# a duplicate binding, and a parse error. What matters is that the
# name is imported once, not where.
_app_path = 'client/src/App.jsx'
_app, _ = _read(_app_path) if os.path.exists(_app_path) else ('', False)
if 'import { ToastProvider }' in _app:
    print("  = App.jsx: import ToastProvider (already applied)")
else:
    patch(_app_path,
"""import StockLedgerPage                               from './pages/StockLedgerPage';""",
"""import StockLedgerPage                               from './pages/StockLedgerPage';
import { ToastProvider }                             from './components/ui/toast';""",
          "App.jsx: import ToastProvider")

# Inside the router, not outside it: a toast raised by an action that
# also navigates should outlive the route change, and the provider has
# to be above every screen that raises one.
patch('client/src/App.jsx',
"""    <BrowserRouter>
      <Routes>""",
"""    <BrowserRouter>
      <ToastProvider>
      <Routes>""",
"App.jsx: open ToastProvider")

patch('client/src/App.jsx',
"""      </Routes>
    </BrowserRouter>""",
"""      </Routes>
      </ToastProvider>
    </BrowserRouter>""",
"App.jsx: close ToastProvider")

# ══════════════════════════════════════════════════════════════
print("7  inventory page")
# ══════════════════════════════════════════════════════════════

patch('client/src/pages/InventoryManagementPage.jsx',
"""import { getManifest, getMovements, adjustStock } from "../services/stockAPI";""",
"""import { getManifest, getMovements, adjustStock, getStockTrends } from "../services/stockAPI";
import { useToast } from "@/components/ui/toastContext";""",
"inventory page: import toast and trends")

patch('client/src/pages/InventoryManagementPage.jsx',
"""  // Movement history drawer state
  const [historyFor, setHistoryFor] = useState(null);""",
"""  // 30-day sparkline series, keyed by product id. Loaded alongside
  // the manifest but never blocking it: a failure here costs one
  // column, and the stock numbers are the reason the page exists.
  const [trends, setTrends] = useState({});

  const toast = useToast();

  // Movement history drawer state
  const [historyFor, setHistoryFor] = useState(null);""",
"inventory page: trends state and toast hook")

patch('client/src/pages/InventoryManagementPage.jsx',
"""    loadManifest();
    return () => {
      cancelled = true;
    };
  }, []);""",
"""    loadManifest();

    // Deliberately not awaited with the manifest and deliberately
    // swallowing its error: the sparkline column degrades to dashes
    // if this fails, which is a smaller loss than a blank screen.
    getStockTrends(30)
      .then((series) => { if (!cancelled) setTrends(series); })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);""",
"inventory page: load trends")

patch('client/src/pages/InventoryManagementPage.jsx',
"""  // ── Adjustment Handler ─────────────────────────────────────
  const handleAdjustSave = async (payload) => {
    setIsSaving(true);
    try {
      await adjustStock(payload);
      await reloadManifest();
      return true;
    } catch (err) {
      alert(err.message || "Failed to save stock adjustment.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };""",
"""  // ── Undo ───────────────────────────────────────────────────
  // Posts the inverse delta. It does NOT delete the original
  // movement, and it must not: stock_movements is the audit trail
  // the reconciliation screen balances against, and a ledger you can
  // quietly edit is not a ledger. The reversal is its own row, with a
  // reason that says what it reverses.
  //
  // The reason is prefixed rather than reused, which also keeps the
  // movement type honest — "Undo of: Spillage" does not match the
  // WASTAGE_REASONS list in stock.repository.js, so undoing a wastage
  // entry is filed as an adjustment. Reversing a loss is not itself
  // a loss.
  const undoAdjustment = async (payload, productName) => {
    try {
      await adjustStock({
        productId:     payload.productId,
        quantityDelta: -Number(payload.quantityDelta),
        unit:          payload.unit,
        reason:        `Undo of: ${payload.reason}`,
      });
      await reloadManifest();
      toast({
        variant: "success",
        title: `Reversed the adjustment to ${productName}`,
        description: "The reversal is recorded as its own movement — the original entry stays in the ledger.",
      });
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not undo that adjustment",
        description: err.message || "The original adjustment is unchanged.",
      });
    }
  };

  // ── Adjustment Handler ─────────────────────────────────────
  const handleAdjustSave = async (payload) => {
    setIsSaving(true);
    try {
      await adjustStock(payload);
      await reloadManifest();

      // Read the name before the modal closes and clears it.
      const product = products.find((p) => p.id === payload.productId);
      const name    = product?.name ?? "this product";
      const delta   = Number(payload.quantityDelta);
      const unit    = payload.unit || product?.unit || "";

      toast({
        variant: "success",
        title: `${delta < 0 ? "Removed" : "Added"} ${Math.abs(delta)} ${unit} — ${name}`.trim(),
        description: payload.reason,
        action: { label: "Undo", onClick: () => undoAdjustment(payload, name) },
      });
      return true;
    } catch (err) {
      // Was window.alert(), which blocks the whole tab and cannot be
      // read by anything assistive.
      toast({
        variant: "error",
        title: "Could not save that adjustment",
        description: err.message || "Nothing was changed.",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };""",
"inventory page: toast on save, with undo")

patch('client/src/pages/InventoryManagementPage.jsx',
"""            onAdjust={(prod) => setAdjustingProduct(prod)}
            onViewHistory={handleViewHistory}""",
"""            trends={trends}
            onAdjust={(prod) => setAdjustingProduct(prod)}
            onViewHistory={handleViewHistory}""",
"inventory page: pass trends to the table")

# ══════════════════════════════════════════════════════════════
print("8  manifest table")
# ══════════════════════════════════════════════════════════════

patch('client/src/features/InventoryManagement/components/StockManifestTable.jsx',
"""const COLUMNS = [
  { key: 'name',      label: 'Product',   width: '26%', align: 'left',
    sort: (p) => (p.name ?? '').toLowerCase() },
  { key: 'sku',       label: 'SKU',       width: '14%', align: 'left',
    sort: (p) => (p.sku ?? '').toLowerCase() },
  { key: 'onHand',    label: 'On Hand',   width: '10%', align: 'right',
    sort: (p) => Number(p.onHand ?? 0) },
  { key: 'committed', label: 'Committed', width: '10%', align: 'right',
    sort: (p) => Number(p.committed ?? 0) },
  { key: 'available', label: 'Available', width: '10%', align: 'right',
    sort: (p) => Number(p.available ?? 0) },
  { key: 'reorderAt', label: 'Reorder At',width: '10%', align: 'right',
    sort: (p) => Number(p.reorderAt ?? 0) },
  { key: 'status',    label: 'Status',    width: '10%', align: 'left',
    // Shortfall first, then low stock, then healthy — the order someone
    // scanning for problems wants, not alphabetical.
    sort: (p) => (p.isShortfall ? 2 : p.isLowStock ? 1 : 0) },
  { key: 'actions',   label: 'Actions',   width: '10%', align: 'right',
    sort: null },
];

const COLUMN_KEY = 'wms_stock_columns';""",
"""// Widths re-proportioned to make room for the trend column without
// reintroducing horizontal scroll — they still total 100%.
const COLUMNS = [
  { key: 'name',      label: 'Product',   width: '22%', align: 'left',
    sort: (p) => (p.name ?? '').toLowerCase() },
  { key: 'sku',       label: 'SKU',       width: '12%', align: 'left',
    sort: (p) => (p.sku ?? '').toLowerCase() },
  { key: 'onHand',    label: 'On Hand',   width: '9%',  align: 'right',
    sort: (p) => Number(p.onHand ?? 0) },
  { key: 'committed', label: 'Committed', width: '9%',  align: 'right',
    sort: (p) => Number(p.committed ?? 0) },
  { key: 'available', label: 'Available', width: '9%',  align: 'right',
    sort: (p) => Number(p.available ?? 0) },
  { key: 'reorderAt', label: 'Reorder At',width: '9%',  align: 'right',
    sort: (p) => Number(p.reorderAt ?? 0) },
  // Not sortable, deliberately. Every other accessor here reads a
  // field off the product row, but the series lives in the `trends`
  // prop keyed by id, and COLUMNS is module scope — it cannot see it.
  // Sorting by "what fell the most this month" would mean special-
  // casing this one column inside the component; worth doing if
  // someone asks for it, not worth a fake accessor that silently
  // sorts by nothing.
  { key: 'trend',     label: '30 days',   width: '12%', align: 'left',
    sort: null },
  { key: 'status',    label: 'Status',    width: '9%',  align: 'left',
    // Shortfall first, then low stock, then healthy — the order someone
    // scanning for problems wants, not alphabetical.
    sort: (p) => (p.isShortfall ? 2 : p.isLowStock ? 1 : 0) },
  { key: 'actions',   label: 'Actions',   width: '9%',  align: 'right',
    sort: null },
];

// Versioned. The stored value is a list of visible column keys, so a
// browser holding the pre-trend list would hide the new column
// forever and there is no way to tell "deliberately hidden" from
// "saved before this column existed". Bumping the key resets the
// choice once; leaving it would ship a column nobody could see.
const COLUMN_KEY = 'wms_stock_columns_v2';""",
"table: trend column and versioned column preference")

patch('client/src/features/InventoryManagement/components/StockManifestTable.jsx',
"""export default function StockManifestTable({
  products = [],
  isLoading = false,
  canAdjust = false,
  onAdjust,
  onViewHistory,
}) {""",
"""export default function StockManifestTable({
  products = [],
  isLoading = false,
  canAdjust = false,
  trends = {},
  onAdjust,
  onViewHistory,
}) {""",
"table: accept the trends prop")

patch('client/src/features/InventoryManagement/components/StockManifestTable.jsx',
"""        {isLoading ? (
          <div className="stock-empty-state">
            Loading stock levels...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="stock-empty-state">
            <p>No matching products found.</p>
            {(activeFiltersCount > 0 || searchTerm) && (
              <Button
                variant="link"
                size="sm"
                onClick={handleResetFilters}
                className="mt-2 text-xs"
              >
                Clear all active filters
              </Button>
            )}
          </div>
        ) : (""",
"""        {isLoading ? (
          // Skeleton rows rather than a line of text: the table is the
          // whole screen, and eighteen other pages already load this
          // way. A sentence where a table is about to appear reads as
          // an error message.
          <div className="space-y-2 py-2" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title={
              activeFiltersCount > 0 || searchTerm
                ? "No products match these filters"
                : "No products in the catalogue yet"
            }
            description={
              activeFiltersCount > 0 || searchTerm
                ? "Nothing in the manifest matches what you have selected."
                : "Products appear here once they are added to the catalogue or arrive through receiving."
            }
            action={
              (activeFiltersCount > 0 || searchTerm)
                ? { label: "Clear all active filters", onClick: handleResetFilters }
                : undefined
            }
          />
        ) : (""",
"table: skeleton loading and shared empty state")

patch('client/src/features/InventoryManagement/components/StockManifestTable.jsx',
"""                      if (c.key === 'status') return (
                        <TableCell key={c.key}>{renderStatusBadge(product)}</TableCell>
                      );""",
"""                      if (c.key === 'trend') return (
                        <TableCell key={c.key} className="stock-cell-trend">
                          <Sparkline points={trends[product.id]} unit={product.unit} />
                        </TableCell>
                      );
                      if (c.key === 'status') return (
                        <TableCell key={c.key}>{renderStatusBadge(product)}</TableCell>
                      );""",
"table: render the sparkline cell")

# The import block differs between checkouts, so anchor on the file's
# own first import rather than guessing a neighbour.
_tbl_path = 'client/src/features/InventoryManagement/components/StockManifestTable.jsx'
_tbl, _ = _read(_tbl_path) if os.path.exists(_tbl_path) else ('', False)
# Check for the IMPORT, not for the identifiers: the patches above
# have already written <Sparkline>, <EmptyState> and PackageSearch into
# the JSX by this point, so testing for those names would always say
# "already applied" and silently skip the imports.
if "from './Sparkline'" in _tbl:
    print("  = table: imports (already applied)")
else:
    import re as _re
    _m = _re.search(r"^import .+?;$", _tbl, _re.M)
    if not _m:
        FAILED.append("table imports: no import statement found in %s" % _tbl_path)
    else:
        _first = _m.group(0)
        patch(_tbl_path, _first,
              _first + """
import { PackageSearch } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/empty-state';
import Sparkline from './Sparkline';""",
              "table: imports")

# ══════════════════════════════════════════════════════════════
print("9  tidy")
# ══════════════════════════════════════════════════════════════

patch('client/src/main.jsx',
"""import './styles/index.css'
import './styles/staff.css'
import './styles/landingpage.css'
import './styles/index.css'
import './styles/staff.css'
import App from './App.jsx'""",
"""import './styles/index.css'
import './styles/staff.css'
import './styles/landingpage.css'
import App from './App.jsx'""",
"main.jsx: drop the duplicated stylesheet imports")

# ══════════════════════════════════════════════════════════════
print("10 tests")
# ══════════════════════════════════════════════════════════════

write_file('server/__tests__/stock.trends.test.js', """// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.trends.test.js
//
// The service layer of the sparkline feed: day validation and the
// reshaping of flat rows into one series per product.
//
// The repository is mocked. The SQL itself — the window over full
// history, the pre-window carry-in, the forward fill — was verified
// against a real Postgres 16 instance, which is the only thing that
// can prove a window function.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  getStockTrends:    vi.fn(),
  getManifest:       vi.fn(),
  getMovements:      vi.fn(),
  manualAdjust:      vi.fn(),
  getLedger:         vi.fn(),
  getLedgerSummary:  vi.fn(),
  getReconciliation: vi.fn(),
  getLedgerActors:   vi.fn(),
};

vi.mock('../src/repositories/stock.repository.js', () => ({ default: repoMock }));

const { default: stockService } = await import('../src/services/stock.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getStockTrends.mockResolvedValue([]);
});

describe('stockService.getStockTrends — validation', () => {
  it('defaults to a 30 day window', async () => {
    const res = await stockService.getStockTrends({});
    expect(repoMock.getStockTrends).toHaveBeenCalledWith({ days: 30 });
    expect(res.days).toBe(30);
  });

  it('accepts an explicit window', async () => {
    await stockService.getStockTrends({ days: '7' });
    expect(repoMock.getStockTrends).toHaveBeenCalledWith({ days: 7 });
  });

  it('rejects a window longer than the cap', async () => {
    await expect(stockService.getStockTrends({ days: '400' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a single-day window — one point is not a line', async () => {
    await expect(stockService.getStockTrends({ days: '1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a non-integer window', async () => {
    await expect(stockService.getStockTrends({ days: '7.5' }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('stockService.getStockTrends — reshaping', () => {
  it('groups flat rows into one ordered series per product', async () => {
    repoMock.getStockTrends.mockResolvedValue([
      { product_id: 1, day: '2026-09-01', balance: '100' },
      { product_id: 1, day: '2026-09-02', balance: '90'  },
      { product_id: 2, day: '2026-09-01', balance: '300' },
      { product_id: 2, day: '2026-09-02', balance: '300' },
    ]);

    const res = await stockService.getStockTrends({});
    expect(res.series).toEqual({ 1: [100, 90], 2: [300, 300] });
  });

  it('casts NUMERIC strings to numbers', async () => {
    // node-postgres returns NUMERIC as a string. A series of strings
    // renders no line at all — Math.min over strings, and arithmetic
    // that concatenates.
    repoMock.getStockTrends.mockResolvedValue([
      { product_id: 1, day: '2026-09-01', balance: '12.5' },
      { product_id: 1, day: '2026-09-02', balance: '10' },
    ]);

    const res = await stockService.getStockTrends({});
    expect(res.series[1].every((n) => typeof n === 'number')).toBe(true);
    expect(res.series[1]).toEqual([12.5, 10]);
  });

  it('returns an empty map when nothing has ever moved', async () => {
    const res = await stockService.getStockTrends({});
    expect(res.series).toEqual({});
  });
});
""", "server/__tests__/stock.trends.test.js")

# The page's module gained an export, so the existing mock has to
# declare it — otherwise getStockTrends is undefined and calling it
# throws inside the effect, taking every test in that file down.
patch('client/src/tests/InventoryManagementPage.test.jsx',
"""vi.mock('../services/stockAPI', () => ({
  getManifest:  vi.fn(),
  getMovements: vi.fn(),
  adjustStock:  vi.fn(),
}));""",
"""vi.mock('../services/stockAPI', () => ({
  getManifest:  vi.fn(),
  getMovements: vi.fn(),
  adjustStock:  vi.fn(),
  // The sparkline feed. Given a default implementation here rather
  // than in beforeEach because vi.clearAllMocks() clears calls but
  // not implementations, and an undefined export would throw inside
  // the page's effect before any assertion ran.
  getStockTrends: vi.fn(async () => ({})),
}));""",
"existing inventory test: declare getStockTrends in the mock")

write_file('client/src/tests/InventoryToastUndo.test.jsx', """// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// InventoryToastUndo.test.jsx
//
// The toast primitive, and the undo path on top of it.
//
// The invariant worth pinning: undo posts the INVERSE delta as a new
// movement. It never asks the server to delete the original. The
// reconciliation screen balances stock_levels against the sum of
// stock_movements, so a ledger anyone can quietly edit is not a
// ledger \u2014 and the reason is prefixed rather than reused so an undone
// wastage entry does not itself file as wastage.
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/stockAPI', () => ({
  getManifest:    vi.fn(),
  getMovements:   vi.fn(),
  adjustStock:    vi.fn(),
  getStockTrends: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, firstName: 'Alessio', lastName: 'M', role: 'manager' }, logout: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const { getManifest, getMovements, adjustStock, getStockTrends } = await import('../services/stockAPI');
const { ToastProvider } = await import('../components/ui/toast');
const { useToast } = await import('../components/ui/toastContext');
const { default: InventoryManagementPage } = await import('../pages/InventoryManagementPage');

const MAIZE = {
  id: 3, name: 'Maize Meal', sku: 'MAIZE-5', unit: 'kg',
  onHand: 55, committed: 0, available: 55, reorderAt: 10,
  isShortfall: false, isLowStock: false,
};

const renderPage = () =>
  render(<ToastProvider><InventoryManagementPage /></ToastProvider>);

async function openAdjustModal(user) {
  await user.click(await screen.findByRole('button', { name: /Adjust/ }));
  return within(await screen.findByRole('dialog'));
}

beforeEach(() => {
  vi.clearAllMocks();
  getManifest.mockResolvedValue([MAIZE]);
  getMovements.mockResolvedValue([]);
  getStockTrends.mockResolvedValue({ 3: [60, 58, 55] });
  adjustStock.mockResolvedValue({ before: 60, after: 48, isShortfall: false });
});

// \u2500\u2500 The primitive \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function Raiser({ options }) {
  const toast = useToast();
  return <button type=\"button\" onClick={() => toast(options)}>raise</button>;
}

describe('toast primitive', () => {
  it('shows a toast and its description', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Raiser options={{ title: 'Saved', description: 'All good' }} /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'raise' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('runs the action and dismisses the toast when it is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <Raiser options={{ title: 'Removed 5 kg', action: { label: 'Undo', onClick } }} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'raise' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Removed 5 kg')).not.toBeInTheDocument());
  });

  it('uses role=alert for errors so they are announced immediately', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Raiser options={{ title: 'Nope', variant: 'error' }} /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'raise' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
  });

  it('is a no-op outside a provider rather than throwing', async () => {
    const user = userEvent.setup();
    render(<Raiser options={{ title: 'Orphan' }} />);

    await user.click(screen.getByRole('button', { name: 'raise' }));
    expect(screen.queryByText('Orphan')).not.toBeInTheDocument();
  });
});

// \u2500\u2500 The page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
describe('inventory adjustments \u2014 toast and undo', () => {
  it('loads the 30 day sparkline series alongside the manifest', async () => {
    renderPage();
    await waitFor(() => expect(getStockTrends).toHaveBeenCalledWith(30));
  });

  it('still renders the manifest when the trend fetch fails', async () => {
    getStockTrends.mockRejectedValue(new Error('trends unavailable'));
    renderPage();
    expect(await screen.findAllByText('Maize Meal')).not.toHaveLength(0);
  });

  it('offers Undo after a successful adjustment', async () => {
    const user = userEvent.setup();
    renderPage();

    const modal = await openAdjustModal(user);
    await user.selectOptions(modal.getByLabelText('Direction'), 'remove');
    await user.type(modal.getByLabelText(/Quantity/), '12');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Damaged / spoiled');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('posts the inverse delta on undo, and never asks the server to delete', async () => {
    const user = userEvent.setup();
    renderPage();

    const modal = await openAdjustModal(user);
    await user.selectOptions(modal.getByLabelText('Direction'), 'remove');
    await user.type(modal.getByLabelText(/Quantity/), '12');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Damaged / spoiled');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(adjustStock).toHaveBeenLastCalledWith({
      productId: 3,
      quantityDelta: 12,                      // the inverse of -12
      unit: 'kg',
      reason: 'Undo of: Damaged / spoiled',   // prefixed, so it files as an adjustment
    }));
    expect(adjustStock).toHaveBeenCalledTimes(2);
  });

  it('reports a save failure through the toast, not window.alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    adjustStock.mockRejectedValue(new Error('A reason is required for manual adjustments.'));

    const user = userEvent.setup();
    renderPage();

    const modal = await openAdjustModal(user);
    await user.type(modal.getByLabelText(/Quantity/), '5');
    await user.selectOptions(modal.getByLabelText('Reason'), 'Spillage');
    await user.click(modal.getByRole('button', { name: /Save Adjustment/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save that adjustment/i);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
""", "client/src/tests/InventoryToastUndo.test.jsx")

# ── Report ────────────────────────────────────────────────────
print("")
if FAILED:
    print("ABORTED — the failures below were not applied:")
    for f in FAILED:
        print("  ! %s" % f)
    print("")
    print("%d change(s) applied before the failure." % CHANGES)
    sys.exit(1)

print("%d change(s) applied." % CHANGES)
PYEOF

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Script 17 done. No migration needed."
echo ""
echo "Verify:"
echo "  cd client && npm run lint && npm run build && npm test"
echo "  cd ../server && npm test"
echo ""
echo "Then open /noc/inventory. The 30 days column draws each product's"
echo "stock level; adjust something and the toast offers Undo, which"
echo "posts the reversal as its own ledger movement rather than"
echo "deleting the original."
echo ""
echo "NOTE: the saved column-visibility preference is versioned to"
echo "wms_stock_columns_v2, so hidden-column choices reset once."
echo "─────────────────────────────────────────────────────────────"