// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/mapIndicators.js
//
// What the warehouse map flags on each area, whatever it is coloured
// by, with no React in it: the badges that float over an area, the short
// figure on its label, and the colour of each packed pallet. The 3D
// view, the top view, the hover card and the legend all read these, so
// they cannot disagree.
//
// An area's alerts, most urgent first:
//   bad    over capacity; stock expired or expiring within 14 days;
//          pallets whose collection day has passed
//   warn   80% full or more; stock expiring within 30 days
//   info   pallets to be collected today
//   muted  stock on record but not counted for over 30 days
// The badge shows the most urgent; the hover card lists them all.
//
// Expiry is the same estimate as everywhere (inventoryViews.js).
// Days are the server's South African 'YYYY-MM-DD'; never the browser's.
// ─────────────────────────────────────────────────────────────
import { expiryState } from '../inventory/inventoryViews';
import { COUNT_STALE_DAYS, FILL_WARN, daysSince, percent } from './mapOverlays';
import { holdsStock, isStaging } from './mapGeometry';

const RANK = { bad: 0, warn: 1, info: 2, muted: 3 };
const DAY_MS = 86_400_000;
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** When a pallet is collected, against today: overdue, today, tomorrow or later. */
export const palletDue = (pallet, today) => {
  const day = String(pallet?.dispatchDate ?? '').slice(0, 10);
  if (!day || !today) return 'later';
  if (day < today) return 'overdue';
  if (day === today) return 'today';
  return day === addDays(today, 1) ? 'tomorrow' : 'later';
};

export const PALLET_DUE = [
  { id: 'overdue',  label: 'Collection day passed', fill: 'fill-danger',    stroke: 'stroke-danger' },
  { id: 'today',    label: 'Collected today',       fill: 'fill-warn',      stroke: 'stroke-warn' },
  { id: 'tomorrow', label: 'Collected tomorrow',    fill: 'fill-info',      stroke: 'stroke-info' },
  { id: 'later',    label: 'Collected later',       fill: 'fill-chart-sage', stroke: 'stroke-good' },
];
export const palletLook = (due) => PALLET_DUE.find((p) => p.id === due) ?? PALLET_DUE[3];

/** Every alert on an area, most urgent first: [{ level, glyph, text }]. */
export const alertsFor = (area, { today, now } = {}) => {
  const out = [];
  if (isStaging(area)) {
    const pallets = area.pallets ?? [];
    const overdue = pallets.filter((p) => palletDue(p, today) === 'overdue').length;
    const due = pallets.filter((p) => palletDue(p, today) === 'today').length;
    if (area.fill >= 1) out.push({ level: 'bad', glyph: '!', text: `Over its ${plural(area.palletSpaces, 'pallet space')}` });
    if (overdue) out.push({ level: 'bad', glyph: String(overdue), text: `${plural(overdue, 'pallet')} past the collection day` });
    if (due) out.push({ level: 'info', glyph: String(due), text: `${plural(due, 'pallet')} to be collected today` });
    return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
  }
  // A plan with no stock figures (the layout builder) has nothing to flag.
  if (!holdsStock(area) || !Array.isArray(area.items)) return out;

  const stocked = area.items.some((i) => i.about > 0);
  if (area.fill >= 1) out.push({ level: 'bad', glyph: '!', text: `Over capacity: ${percent(area.fill)} full` });
  else if (area.fill >= FILL_WARN) out.push({ level: 'warn', glyph: '!', text: `${percent(area.fill)} full` });

  const expiry = stocked ? expiryState(area.earliestExpiry, today ?? undefined) : null;
  if (expiry?.status === 'expired') out.push({ level: 'bad', glyph: '!', text: 'Holds expired stock' });
  else if (expiry?.status === 'urgent') {
    out.push({ level: 'bad', glyph: '!', text: expiry.daysLeft === 0 ? 'Stock expires today' : `Stock expires in ${plural(expiry.daysLeft, 'day')}` });
  } else if (expiry?.status === 'soon') out.push({ level: 'warn', glyph: '!', text: `Stock expires in ${expiry.daysLeft} days` });

  const days = daysSince(area.lastCountedAt, now);
  if (stocked && (days === null || days > COUNT_STALE_DAYS)) {
    out.push({ level: 'muted', glyph: '?', text: days === null ? 'Never counted' : `Not counted for ${days} days` });
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
};

/** The badge for an area: its most urgent alert and how many more, or null. */
export const badgeFor = (area, ctx) => {
  const all = alertsFor(area, ctx);
  return all.length ? { ...all[0], more: all.length - 1, all } : null;
};

/** The figure on an area's label: how full, how many pallets, or how many products. */
export const figureOf = (area) => {
  if (isStaging(area)) {
    const n = area.pallets?.length ?? 0;
    return area.palletSpaces ? `${n}/${area.palletSpaces}` : plural(n, 'pallet');
  }
  if (!holdsStock(area) || !Array.isArray(area.items)) return null;
  if (area.fill !== null && area.fill !== undefined) return percent(area.fill);
  const n = new Set(area.items.filter((i) => i.about > 0).map((i) => i.productId)).size;
  return n ? plural(n, 'product') : 'Empty';
};

export const BADGE_CLASS = {
  bad:   { fill: 'fill-danger', text: 'fill-white' },
  warn:  { fill: 'fill-warn', text: 'fill-white' },
  info:  { fill: 'fill-info', text: 'fill-white' },
  muted: { fill: 'fill-ink-soft', text: 'fill-white' },
};
