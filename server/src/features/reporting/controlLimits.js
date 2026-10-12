// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/controlLimits.js
//
// EXCEPTION ALERTS: which weekly measure is outside its normal range.
// The statistics of a control chart, with no SQL: the service runs the
// ordinary weekly reports and hands their figures here.
//
// For one measure, the weeks before the latest one are its BASELINE.
// Their mean and standard deviation give the control limits, mean ± 2σ,
// and the latest complete week is judged against them:
//
//   out of control   the latest week is beyond a limit
//   adverse          ... on the side that is bad for that measure
//                    (wastage above its range, compliance below it)
//   favourable       ... on the good side: worth knowing, not a worry
//   trend            three changes in a row in the bad direction, even
//                    though no single week has crossed a limit yet
//
// 2σ, not the textbook 3σ: with a dozen weekly points 3σ almost never
// fires, and a manager would rather look at a week that turns out to
// be fine than miss one that was not.
//
// A measure needs MIN_BASELINE weeks of history before it is judged at
// all. Limits drawn from three points are noise.
// ─────────────────────────────────────────────────────────────

export const SIGMAS = 2;
export const MIN_BASELINE = 6;
const TREND_RUN = 3;

const round = (n, dp = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** dp) / 10 ** dp);

const isoWeekOf = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/**
 * The last `weeks` complete weeks before `today` (Monday to Sunday),
 * oldest first: { from, to, labels }. The week in progress is left out,
 * because half a week always looks like a collapse.
 */
export const completeWeeks = (today, weeks) => {
  const now = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  const thisMonday = new Date(now.getTime() - sinceMonday * 86400000);
  const labels = [];
  for (let i = weeks; i >= 1; i -= 1) labels.push(isoWeekOf(new Date(thisMonday.getTime() - i * 7 * 86400000)));
  return {
    from: new Date(thisMonday.getTime() - weeks * 7 * 86400000).toISOString().slice(0, 10),
    to: new Date(thisMonday.getTime() - 86400000).toISOString().slice(0, 10),
    labels,
  };
};

/**
 * series: [{ label, value }] from a weekly report (weeks with nothing
 * recorded are simply absent).
 * `fillZero`: an absent week counts as zero (a volume) rather than as
 * no reading (a rate, which has no value in a week with no activity).
 */
export const alignWeeks = (series, labels, { fillZero = false } = {}) => {
  const byLabel = new Map(series.map((p) => [p.label, Number(p.value)]));
  return labels.map((label) => ({ label, value: byLabel.has(label) ? byLabel.get(label) : (fillZero ? 0 : null) }));
};

/**
 * points: [{ label, value | null }] oldest first, the last being the
 * week under judgement. better: 'up' | 'down' | null.
 */
export const assess = (points, better = null) => {
  const latest = points[points.length - 1] ?? null;
  const baseline = points.slice(0, -1).map((p) => p.value).filter((v) => v !== null && Number.isFinite(v));
  const out = { latest: latest?.value ?? null, latestWeek: latest?.label ?? null, baselineWeeks: baseline.length };

  if (!latest || latest.value === null || baseline.length < MIN_BASELINE) {
    return { ...out, status: 'insufficient', mean: null, sigma: null, lower: null, upper: null, deviation: null, signal: null, trend: false };
  }

  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const sigma = Math.sqrt(baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / (baseline.length - 1));
  const upper = mean + SIGMAS * sigma;
  const lower = mean - SIGMAS * sigma;
  const side = latest.value > upper + 1e-9 ? 'above' : latest.value < lower - 1e-9 ? 'below' : 'within';
  const deviation = sigma > 0 ? (latest.value - mean) / sigma : (latest.value === mean ? 0 : null);

  // Three week-on-week changes in a row the bad way.
  const recent = points.map((p) => p.value).filter((v) => v !== null).slice(-(TREND_RUN + 1));
  const bad = better === 'up' ? -1 : better === 'down' ? 1 : 0;
  const trend = bad !== 0 && recent.length === TREND_RUN + 1
    && recent.slice(1).every((v, i) => Math.sign(v - recent[i]) === bad);

  let signal = null;
  if (side !== 'within') {
    if (better === null) signal = 'unusual';
    else signal = (side === 'above') === (better === 'down') ? 'adverse' : 'favourable';
  } else if (trend) signal = 'trend';

  return {
    ...out,
    status: side === 'within' ? 'in_control' : 'out_of_control',
    side,
    mean: round(mean),
    sigma: round(sigma),
    lower: round(lower),
    upper: round(upper),
    deviation: round(deviation, 1),
    signal,
    trend,
  };
};

const SIGNAL_ORDER = ['adverse', 'trend', 'unusual', 'favourable'];

/** Most pressing first: adverse, worsening, unusual, favourable, then the quiet ones. */
export const rankAlerts = (items) => [...items].sort((a, b) => {
  const rank = (x) => (x.signal ? SIGNAL_ORDER.indexOf(x.signal) : x.status === 'insufficient' ? 9 : 5);
  return rank(a) - rank(b) || Math.abs(b.deviation ?? 0) - Math.abs(a.deviation ?? 0) || a.label.localeCompare(b.label);
});

export default { assess, alignWeeks, completeWeeks, rankAlerts, SIGMAS, MIN_BASELINE };
