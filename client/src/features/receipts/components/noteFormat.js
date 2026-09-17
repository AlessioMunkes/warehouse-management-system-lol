// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/components/noteFormat.js
//
// Formatting shared by both note documents and the archive list.
//
// Dates are rendered in en-ZA. A delivery_date is a plain DATE column
// with no timezone, so it is sliced rather than passed through
// new Date(), which would treat "2026-08-12" as UTC midnight and
// print the 11th for anyone west of Greenwich. Timestamps
// (created_at, collected_at) ARE timestamptz and get the full
// conversion, pinned to Africa/Johannesburg so a manager checking
// from anywhere sees warehouse time.
// ─────────────────────────────────────────────────────────────

const SAST = 'Africa/Johannesburg';

// A DATE column: 'YYYY-MM-DD' or an ISO string whose date part is the truth.
export const formatDate = (value) => {
  if (!value) return '—';
  const datePart = String(value).slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return '—';
  // Constructed as UTC and formatted as UTC — no shifting either way.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
};

// A TIMESTAMPTZ column. Shown in warehouse time.
export const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: SAST,
  });
};

// Short form for list rows.
export const formatDateShort = (value) => {
  if (!value) return '—';
  const datePart = String(value).slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-ZA', {
    year: '2-digit', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
};

// Quantities arrive from pg as strings, because numeric does not fit in a JS
// number safely and node-postgres refuses to guess. Number() them at the edge.
export const qty = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const fmtQty = (value, unit) => {
  const n = qty(value);
  if (n === null) return '—';
  // Trim a trailing .00 without mangling 1.5
  const text = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
  return unit ? `${text} ${unit}` : text;
};

// ── Variance ─────────────────────────────────────────────────
// Returns { diff, label, className } or null when the two match.
// Used by both notes: goods-in compares received against expected,
// goods-out compares loaded against packed.
export const variance = (actual, expected) => {
  const a = qty(actual);
  const e = qty(expected);
  if (a === null || e === null) return null;
  const diff = a - e;
  if (diff === 0) return null;
  return {
    diff,
    label:     diff > 0 ? `${diff} over` : `${Math.abs(diff)} short`,
    className: diff > 0 ? 'pdf-variance-over' : 'pdf-variance-short',
  };
};

// Human labels for the dispatch_events.status enum.
export const DISPATCH_STATUS_LABEL = {
  awaiting:       'Awaiting collection',
  collected:      'Collected',
  late_collected: 'Collected late',
  not_collected:  'Not collected',
  cancelled:      'Cancelled',
};

export const DELIVERY_STATUS_LABEL = {
  recorded: 'Recorded',
  flagged:  'Flagged',
  closed:   'Closed',
};

export const BENEFICIARY_LABEL = {
  ecd:             'ECD centre',
  dignity_kitchen: 'Dignity Kitchen',
  soup_kitchen:    'Soup kitchen',
  community:       'Community',
};
