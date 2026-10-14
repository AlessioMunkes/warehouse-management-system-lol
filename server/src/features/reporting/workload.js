// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/workload.js
//
// WORKLOAD: when the warehouse is busy, by weekday and hour of the
// day, for each area of the floor. It is for rostering: which mornings
// receiving needs two people, when the gate queue forms.
//
// It used to be its own tab on the Operations reports page. It is now
// the `workload` report in reportCatalog.js, so it is asked for like
// any other ("when is receiving busiest?") and drawn as a heatmap by
// the same chart every report uses.
//
// The repository counts recorded activity per area, weekday and hour
// (South African time). This turns those counts into the report's
// rows, as the AVERAGE for a weekday: a period with five Mondays and
// four Fridays would otherwise make Monday look busier than it is.
//
// It counts WORK RECORDED, not people: a delivery note saved, a line
// confirmed or flagged, a pallet released. Nobody is named or timed.
// ─────────────────────────────────────────────────────────────

export const AREAS = [
  { id: 'receiving', label: 'Receiving', unit: 'deliveries received' },
  { id: 'packing', label: 'Picking and packing', unit: 'lines picked' },
  { id: 'gate', label: 'Dispatch gate', unit: 'pallets released' },
];
export const AREA_IDS = AREAS.map((a) => a.id);
// The short names the rest of reporting uses for days (to_char 'Dy').
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The grid always shows the working day, and stretches to hold
// anything recorded outside it.
const OPEN_HOUR = 7;
const CLOSE_HOUR = 17;

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const pad = (h) => String(h).padStart(2, '0');

/** How many times each weekday (0 = Monday) falls in [from, to]. */
export const weekdayCounts = (from, to) => {
  const counts = Array(7).fill(0);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86400000) counts[(new Date(t).getUTCDay() + 6) % 7] += 1;
  return counts;
};

/**
 * The report's rows from the repository's counts.
 *
 * rows:      [{ area, weekday (1 = Monday .. 7), hour (0-23), events }]
 * dimension: 'hour_weekday'  "08|Mon" for every hour of the working day
 *                            and every weekday, quiet ones as 0, so the
 *                            heatmap is a full grid
 *            'weekday'       Mon to Sun, the average for that day
 * area:      one of AREA_IDS, or nothing for every area together
 */
export const workloadSeries = (rows, { dimension, area = null, from, to }) => {
  const occurrences = weekdayCounts(from, to);
  const mine = area ? rows.filter((r) => r.area === area) : rows;
  const avg = (total, d) => (occurrences[d] ? round(total / occurrences[d]) : 0);

  if (dimension === 'weekday') {
    const byDay = Array(7).fill(0);
    for (const r of mine) byDay[Number(r.weekday) - 1] += Number(r.events);
    return WEEKDAYS.map((label, d) => ({ label, value: avg(byDay[d], d) }));
  }

  const hoursSeen = mine.map((r) => Number(r.hour));
  const firstHour = Math.min(OPEN_HOUR, ...hoursSeen);
  const lastHour = Math.max(CLOSE_HOUR, ...hoursSeen);
  const cell = new Map();
  for (const r of mine) {
    const key = `${Number(r.weekday) - 1}|${Number(r.hour)}`;
    cell.set(key, (cell.get(key) ?? 0) + Number(r.events));
  }
  const out = [];
  for (let h = firstHour; h <= lastHour; h += 1) {
    WEEKDAYS.forEach((day, d) => {
      out.push({ label: `${pad(h)}|${day}`, value: avg(cell.get(`${d}|${h}`) ?? 0, d) });
    });
  }
  return out;
};

export default { workloadSeries, weekdayCounts, AREAS, AREA_IDS, WEEKDAYS };
