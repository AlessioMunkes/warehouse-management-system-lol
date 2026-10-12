// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/workload.js
//
// THE WORKLOAD HEATMAP: when the warehouse is busy, by weekday and hour
// of the day, for each area of the floor. It is for rostering: which
// mornings receiving needs two people, when the gate queue forms.
//
// The repository counts recorded activity per area, weekday and hour
// (South African time). This shapes those counts into a grid and works
// out the average for a weekday, because a period with five Mondays
// and four Fridays would otherwise make Monday look busier than it is.
//
// It counts WORK RECORDED, not people: a delivery note saved, a line
// confirmed, a pallet released. Nobody is named or timed.
// ─────────────────────────────────────────────────────────────

export const AREAS = [
  { id: 'receiving', label: 'Receiving', unit: 'deliveries received' },
  { id: 'packing', label: 'Picking and packing', unit: 'lines picked' },
  { id: 'gate', label: 'Dispatch gate', unit: 'pallets released' },
];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The grid always shows the working day, and stretches to hold
// anything recorded outside it.
const OPEN_HOUR = 7;
const CLOSE_HOUR = 17;

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/** How many times each weekday (0 = Monday) falls in [from, to]. */
export const weekdayCounts = (from, to) => {
  const counts = Array(7).fill(0);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86400000) counts[(new Date(t).getUTCDay() + 6) % 7] += 1;
  return counts;
};

/** rows: [{ area, weekday (1 = Monday .. 7), hour (0-23), events }] */
export const buildWorkload = (rows, { from, to }) => {
  const occurrences = weekdayCounts(from, to);
  const hoursSeen = rows.map((r) => Number(r.hour));
  const firstHour = Math.min(OPEN_HOUR, ...hoursSeen);
  const lastHour = Math.max(CLOSE_HOUR, ...hoursSeen);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);

  const areas = AREAS.map((area) => {
    const mine = rows.filter((r) => r.area === area.id);
    const grid = WEEKDAYS.map(() => hours.map(() => 0));
    for (const r of mine) grid[Number(r.weekday) - 1][Number(r.hour) - firstHour] += Number(r.events);

    const cells = [];
    grid.forEach((row, d) => row.forEach((total, h) => {
      // The typical load of that hour on that weekday.
      cells.push({ weekday: d, hour: hours[h], total, average: occurrences[d] ? round(total / occurrences[d]) : 0 });
    }));
    const total = cells.reduce((s, c) => s + c.total, 0);
    const peak = cells.reduce((best, c) => (c.average > (best?.average ?? 0) ? c : best), null);
    const byWeekday = WEEKDAYS.map((label, d) => {
      const sum = grid[d].reduce((a, b) => a + b, 0);
      return { label, total: sum, average: occurrences[d] ? round(sum / occurrences[d]) : 0 };
    });
    const byHour = hours.map((hour, h) => ({ hour, total: grid.reduce((s, row) => s + row[h], 0) }));
    return {
      ...area,
      total,
      cells,
      max: Math.max(0, ...cells.map((c) => c.total)),
      maxAverage: Math.max(0, ...cells.map((c) => c.average)),
      peak: peak && peak.total > 0 ? { weekday: WEEKDAYS[peak.weekday], hour: peak.hour, average: peak.average, total: peak.total } : null,
      busiestDay: byWeekday.reduce((best, d) => (d.average > (best?.average ?? 0) ? d : best), null),
      byWeekday,
      byHour,
    };
  });

  return { range: { from, to }, hours, weekdays: WEEKDAYS, occurrences, areas, empty: areas.every((a) => a.total === 0) };
};

export default { buildWorkload, weekdayCounts, AREAS, WEEKDAYS };
