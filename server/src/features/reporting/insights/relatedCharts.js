// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/insights/relatedCharts.js
//
// Picks the two related diagrams shown with every generated report, and a
// short note on how each connects. Candidates, best first: the report's
// own related charts, then the same figure over time or split another
// way, then another report from the same area. The service keeps the
// first two that have data.
// ─────────────────────────────────────────────────────────────
import { METRICS, DIMENSIONS, isSnapshot } from '../reportCatalog.js';
import { OPERATIONAL_INSIGHTS } from './operationalInsights.js';
import { DATASETS } from '../customQuery.js';

export const RELATED_COUNT = 2;

const AREA_WORDS = {
  dispatch: 'getting food to centres', receiving: 'receiving stock from suppliers',
  procurement: 'buying stock', stock: 'keeping the right stock on the shelf',
  decanting: 'decanting bulk food', picking: 'packing pallets', donations: 'donations',
  community: 'benevolent requests', volunteers: 'volunteering', compost: 'Feed the Soil',
};

const dimLabel = (id) => (DIMENSIONS[id]?.label ?? id).toLowerCase();
const firstSentence = (s) => (String(s ?? '').match(/^.*?[.!?](\s|$)/)?.[0] ?? String(s ?? '')).trim();
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** How `rel` (metric id + dimension) connects to the main report. */
export const connectionFor = (main, mainDim, rel) => {
  const m = METRICS[rel.metric];
  if (rel.why) return rel.why;
  if (rel.metric === main.id) {
    if (rel.dimension === 'month' || rel.dimension === 'week') {
      return `The same figure ${rel.dimension} by ${rel.dimension}, so you can see whether what the main chart shows is new or has been building up.`;
    }
    if (rel.dimension === 'none') return 'The same figure as one overall total, to put the breakdown above in proportion.';
    return `The same figure split by ${dimLabel(rel.dimension)} instead of ${dimLabel(mainDim)}, to show where the total comes from.`;
  }
  const area = OPERATIONAL_INSIGHTS[main.id]?.area;
  const sameArea = area && OPERATIONAL_INSIGHTS[rel.metric]?.area === area;
  const what = `${m.label}${rel.dimension && rel.dimension !== 'none' ? ` by ${dimLabel(rel.dimension)}` : ''}`;
  const tie = sameArea
    ? `Both are part of ${AREA_WORDS[area] ?? 'the same work'}, so a change in one usually shows in the other.`
    : 'Read them together: one often explains a change in the other.';
  return `${what}: ${lower(firstSentence(m.description))} ${tie}`;
};

const key = (r) => `${r.metric}/${r.dimension}`;

/** Ordered candidates for a prepared report. */
export const candidatesFor = (metric, spec) => {
  const cfg = OPERATIONAL_INSIGHTS[metric.id];
  const seen = new Set([key({ metric: metric.id, dimension: spec.dimension })]);
  const out = [];
  const add = (r) => {
    const m = METRICS[r.metric];
    if (!m || m.impactOnly || !m.dimensions.includes(r.dimension) || seen.has(key(r))) return;
    seen.add(key(r));
    out.push({ ...r, why: connectionFor(metric, spec.dimension, r) });
  };

  for (const r of cfg?.related ?? []) add(r);
  // The same figure over time, then split another way.
  if (!isSnapshot(metric) && spec.dimension !== 'month') add({ metric: metric.id, dimension: 'month' });
  if (!isSnapshot(metric) && spec.dimension === 'month') add({ metric: metric.id, dimension: 'week' });
  for (const d of metric.dimensions) {
    if (!['none', 'week', 'month', 'week_weekday', 'flow', 'category_flow'].includes(d)) add({ metric: metric.id, dimension: d });
  }
  // Other reports in the same area, their first breakdown.
  const area = cfg?.area;
  for (const [id, c] of Object.entries(OPERATIONAL_INSIGHTS)) {
    if (id !== metric.id && area && c.area === area) add({ metric: id, dimension: METRICS[id].dimensions[0] });
  }
  return out;
};

/** Ordered candidates for a custom report: the same count over time, or grouped another way. */
export const customCandidatesFor = (custom) => {
  const ds = DATASETS[custom.dataset];
  if (!ds) return [];
  const current = custom.groupBy ?? [];
  const out = [];
  const time = Object.keys(ds.groups).find((g) => ds.groups[g].time && g === 'month');
  if (time && !current.includes(time)) {
    out.push({ custom: { ...custom, groupBy: [time] }, why: `The same count month by month, so you can see whether what the main chart shows is new or has been building up.` });
  }
  for (const [g, def] of Object.entries(ds.groups)) {
    if (def.time || current.includes(g)) continue;
    out.push({ custom: { ...custom, groupBy: [g] }, why: `The same count split by ${def.label.toLowerCase()}, to show another side of it.` });
  }
  return out;
};

export default { RELATED_COUNT, connectionFor, candidatesFor, customCandidatesFor };
