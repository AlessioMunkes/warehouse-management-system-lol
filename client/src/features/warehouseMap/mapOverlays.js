// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/mapOverlays.js
//
// What colour each area is under each "Colour by" choice, and the
// legend that explains it, in one place, so the map and its legend
// cannot disagree. No React here.
//
// A tone is a pair of design-token classes (fill and outline) the map
// puts on an area's shape, so both themes come for free.
//
// Fill level compares what an area holds with the capacity set in
// Warehouse layout: kilograms for a store, pallets for a staging area.
//
// Expiry reads the same rules as the Inventory list (inventoryViews.js):
// an area takes the soonest expiry among the products it holds. Which
// deliveries are still on the shelf is an estimate there, and so it is
// here.
// ─────────────────────────────────────────────────────────────
import { expiryState } from '../inventory/inventoryViews';
import { isStaging, kindById } from './mapGeometry';

export const TONES = {
  bad:     { fill: 'fill-danger-soft', stroke: 'stroke-danger' },
  warn:    { fill: 'fill-warn-soft', stroke: 'stroke-warn' },
  good:    { fill: 'fill-good-soft', stroke: 'stroke-good' },
  info:    { fill: 'fill-info-soft', stroke: 'stroke-info' },
  violet:  { fill: 'fill-violet-soft', stroke: 'stroke-violet' },
  tan:     { fill: 'fill-chart-tan', stroke: 'stroke-gold' },
  sage:    { fill: 'fill-chart-sage', stroke: 'stroke-good' },
  neutral: { fill: 'fill-surface-2', stroke: 'stroke-line-strong' },
  empty:   { fill: 'fill-surface', stroke: 'stroke-line-strong', dashed: true },
  door:    { fill: 'fill-brand', stroke: 'stroke-brand' },
};

export const OVERLAYS = [
  { id: 'expiry',    label: 'Expiry' },
  { id: 'programme', label: 'Programme' },
  { id: 'counted',   label: 'Last counted' },
  { id: 'fill',      label: 'Fill level' },
  { id: 'kind',      label: 'Area type' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
export const COUNT_FRESH_DAYS = 7;
export const COUNT_STALE_DAYS = 30;
export const FILL_WARN = 0.8;

const hasStock = (area) => area.items?.some((i) => i.about > 0);

// The programme palette, in the order programmes first appear among
// the products. Grey is kept for "no programme".
const PROGRAMME_TONES = ['info', 'good', 'violet', 'warn', 'tan', 'sage'];

/** { [programmeId]: tone } for every programme the products carry. */
export const programmeTones = (products) => {
  const ids = [...new Set(products.map((p) => p.programmeId).filter((id) => id !== null && id !== undefined))]
    .sort((a, b) => a - b);
  return Object.fromEntries(ids.map((id, i) => [id, PROGRAMME_TONES[i % PROGRAMME_TONES.length]]));
};

/** Days since an ISO timestamp, whole and rounded down; null for none. */
export const daysSince = (iso, now = new Date()) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(Math.floor((now.getTime() - t) / DAY_MS), 0);
};

/** 'Counted 3 days ago', for an area's newest count. */
export const countedWhen = (iso, now = new Date()) => {
  const days = daysSince(iso, now);
  if (days === null) return 'Never counted';
  if (days === 0) return 'Counted today';
  if (days === 1) return 'Counted yesterday';
  return `Counted ${days} days ago`;
};

const KIND_TONE = { dry: 'tan', cold: 'info', floor: 'sage', staging: 'violet', door: 'door' };

/** The tone for how full something is: 0.5 is half. */
export const fillTone = (fill) => {
  if (fill === null || fill === undefined) return 'neutral';
  if (fill >= 1) return 'bad';
  return fill >= FILL_WARN ? 'warn' : 'good';
};

/** '45%', or '' with no capacity set. */
export const percent = (fill) => (fill === null || fill === undefined ? '' : `${Math.round(fill * 100)}%`);

/** The tone name for an area under an overlay. */
export const toneFor = (area, overlay, ctx = {}) => {
  if (area.kind === 'door') return 'door';
  if (overlay === 'kind') return KIND_TONE[area.kind];
  if (overlay === 'fill') return fillTone(area.fill);
  // A staging area holds pallets, not counted stock.
  if (isStaging(area)) return area.pallets?.length ? 'neutral' : 'empty';
  if (overlay === 'counted') {
    const days = daysSince(area.lastCountedAt, ctx.now);
    if (days === null) return 'empty';
    if (days <= COUNT_FRESH_DAYS) return 'good';
    return days <= COUNT_STALE_DAYS ? 'warn' : 'bad';
  }
  if (!hasStock(area)) return 'empty';
  if (overlay === 'programme') {
    const top = area.programmes?.[0];
    return top && top.id !== null ? (ctx.programmeTones?.[top.id] ?? 'neutral') : 'neutral';
  }
  // Expiry
  const state = expiryState(area.earliestExpiry, ctx.today ?? undefined);
  if (!state) return 'neutral';
  if (state.status === 'expired' || state.status === 'urgent') return 'bad';
  return state.status === 'soon' ? 'warn' : 'good';
};

/** The legend for an overlay: [{ tone, label }]. */
export const legendFor = (overlay, { products = [] } = {}) => {
  if (overlay === 'kind') {
    return ['dry', 'cold', 'floor', 'staging', 'door'].map((k) => ({ tone: KIND_TONE[k], label: kindById(k).label }));
  }
  if (overlay === 'fill') {
    return [
      { tone: 'good', label: `Under ${FILL_WARN * 100}% full` },
      { tone: 'warn', label: `${FILL_WARN * 100}% full or more` },
      { tone: 'bad', label: 'Full or over' },
      { tone: 'neutral', label: 'No capacity set' },
    ];
  }
  if (overlay === 'counted') {
    return [
      { tone: 'good', label: `Within ${COUNT_FRESH_DAYS} days` },
      { tone: 'warn', label: `Within ${COUNT_STALE_DAYS} days` },
      { tone: 'bad', label: `Over ${COUNT_STALE_DAYS} days` },
      { tone: 'empty', label: 'Never counted' },
    ];
  }
  if (overlay === 'programme') {
    const tones = programmeTones(products);
    const names = new Map(products.filter((p) => p.programmeId !== null && p.programmeId !== undefined)
      .map((p) => [p.programmeId, p.programmeName]));
    return [
      ...Object.entries(tones).map(([id, tone]) => ({ tone, label: names.get(Number(id)) || 'Programme' })),
      { tone: 'neutral', label: 'No programme' },
      { tone: 'empty', label: 'Empty' },
    ];
  }
  return [
    { tone: 'bad', label: 'Expired or within 14 days' },
    { tone: 'warn', label: 'Within 30 days' },
    { tone: 'good', label: 'Later' },
    { tone: 'neutral', label: 'No expiry on record' },
    { tone: 'empty', label: 'Empty' },
  ];
};

/** Ids of the areas holding a product that matches the search. */
export const areasMatching = (areas, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return new Set(areas
    .filter((a) => a.items?.some((i) => i.about > 0
      && [i.name, i.sku].some((v) => v?.toLowerCase().includes(q))))
    .map((a) => a.id));
};
