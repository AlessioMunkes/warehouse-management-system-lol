// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/savedReports.js
//
// Rules for saved and scheduled reports (no database access):
//   periodFor   - the last full week (Mon-Sun) or calendar month
//   isDue       - whether that period has ended since the last email
//   presetRange - a page period ("last_3m") as dates, for "send now"
//   emailFor    - the email's subject, text and HTML
// Emails only contain totals, never names or contact details.
// ─────────────────────────────────────────────────────────────
export const SCHEDULES = ['none', 'weekly', 'monthly'];
export const PRESETS = ['this_month', 'last_month', 'last_3m', 'last_6m', 'this_year'];
export const MAX_SAVED = 20;

const iso = (d) => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return utc(y, m - 1, d); };

/** The period a schedule reports on, given today (YYYY-MM-DD, SAST). */
export const periodFor = (schedule, todayISO) => {
  const t = parse(todayISO);
  if (schedule === 'weekly') {
    const dow = (t.getUTCDay() + 6) % 7;                  // Monday = 0
    const thisMonday = utc(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow);
    const from = utc(thisMonday.getUTCFullYear(), thisMonday.getUTCMonth(), thisMonday.getUTCDate() - 7);
    const to = utc(thisMonday.getUTCFullYear(), thisMonday.getUTCMonth(), thisMonday.getUTCDate() - 1);
    return { from: iso(from), to: iso(to), label: `the week of ${iso(from)}` };
  }
  if (schedule === 'monthly') {
    const from = utc(t.getUTCFullYear(), t.getUTCMonth() - 1, 1);
    const to = utc(t.getUTCFullYear(), t.getUTCMonth(), 0);
    return { from: iso(from), to: iso(to), label: from.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }
  return null;
};

/**
 * Due when the period it reports on ended after it was last sent —
 * so a missed day (server asleep) is caught up, and a restart never
 * sends twice.
 */
export const isDue = (row, todayISO) => {
  const period = periodFor(row.schedule, todayISO);
  if (!period) return false;
  if (!row.last_sent_at) return true;
  const sent = iso(new Date(row.last_sent_at));
  return sent <= period.to;
};

/** A page preset as dates (mirrors client dateRanges.js). */
export const presetRange = (preset, todayISO) => {
  const t = parse(todayISO);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  switch (preset) {
    case 'this_month': return { from: iso(utc(y, m, 1)), to: todayISO };
    case 'last_month': return { from: iso(utc(y, m - 1, 1)), to: iso(utc(y, m, 0)) };
    case 'last_6m':    return { from: iso(utc(y, m - 5, 1)), to: todayISO };
    case 'this_year':  return { from: iso(utc(y, 0, 1)), to: todayISO };
    case 'last_3m':
    default:           return { from: iso(utc(y, m - 2, 1)), to: todayISO };
  }
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const humanise = (s) => String(s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const fmt = (v, unit) => {
  if (typeof v !== 'number') return esc(v);
  const n = v.toLocaleString('en-GB', { maximumFractionDigits: 1 });
  if (unit === '%') return `${n}%`;
  if (unit === 'ZAR') return `R${n}`;
  return unit ? `${n} ${esc(unit)}` : n;
};

/** Subject, plain text and HTML for one saved report's result. */
export const emailFor = ({ saved, result, period, appUrl }) => {
  const unit = result.meta?.unit;
  const rows = (result.series ?? result.points ?? []).slice(0, 15);
  const isScatter = Boolean(result.points);
  const link = appUrl ? `${appUrl.replace(/\/$/, '')}/noc/reporting` : null;
  const subject = `${saved.title}: ${period.label}`;
  const headline = isScatter
    ? `${rows.length} ${rows.length === 1 ? 'item' : 'items'} compared.`
    : rows.length ? `Total: ${fmt(result.total, unit)}.` : 'Nothing was recorded in this period.';

  const lines = rows.map((r) => (isScatter
    ? `${humanise(r.label)}: ${fmt(r.x)} / ${fmt(r.y)}`
    : `${humanise(r.label)}: ${fmt(r.value, unit)}`));
  const text = [
    `${saved.title}`, `${result.description ?? ''}`, `Period: ${period.from} to ${period.to}`, '', headline, '',
    ...lines,
    result.meta?.caveat ? `\nNote: ${result.meta.caveat}` : '',
    link ? `\nOpen Operations reports: ${link}` : '',
    '\nYou get this because you scheduled it in Operations reports. Change or stop it there.',
  ].join('\n');

  const cell = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;';
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;max-width:640px;margin:0 auto;padding:16px">
<p style="font-size:12px;color:#6b6b6b;margin:0">Ladles of Love · Operations reports</p>
<h1 style="font-size:20px;margin:8px 0 4px">${esc(saved.title)}</h1>
<p style="font-size:13px;color:#6b6b6b;margin:0 0 12px">${esc(result.description ?? '')}<br>Period: ${esc(period.from)} to ${esc(period.to)}</p>
<p style="font-size:15px;font-weight:bold;margin:0 0 12px">${headline}</p>
${rows.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px">
<thead><tr><th style="${cell}text-align:left">Item</th>${isScatter ? `<th style="${cell}text-align:center">${esc(result.x?.label ?? 'X')}</th><th style="${cell}text-align:center">${esc(result.y?.label ?? 'Y')}</th>` : `<th style="${cell}text-align:center">Value</th>`}</tr></thead>
<tbody>${rows.map((r) => `<tr><td style="${cell}">${esc(humanise(r.label))}</td>${isScatter
    ? `<td style="${cell}text-align:center">${fmt(r.x)}</td><td style="${cell}text-align:center">${fmt(r.y)}</td>`
    : `<td style="${cell}text-align:center">${fmt(r.value, unit)}</td>`}</tr>`).join('')}</tbody></table>` : ''}
${result.meta?.caveat ? `<p style="font-size:12px;color:#6b6b6b">Note: ${esc(result.meta.caveat)}</p>` : ''}
${link ? `<p><a href="${esc(link)}" style="color:#1a56db">Open Operations reports</a> to see the chart, generate the full written report or drill in.</p>` : ''}
<p style="font-size:11px;color:#8a8a8a;margin-top:24px">You get this because you scheduled it in Operations reports. Change or stop it there.</p>
</body></html>`;
  return { subject, text, html };
};

export default { SCHEDULES, PRESETS, MAX_SAVED, periodFor, isDue, presetRange, emailFor };
