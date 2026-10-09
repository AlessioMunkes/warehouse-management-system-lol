// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/keywordFallback.js
//
// Question → report WITHOUT the model. Used by reportingAi.service.js
// only when every model in the chain has failed (quota, overload,
// timeout), so the manager still gets the closest report instead of
// an error. The page labels it "closest match".
//
// Same rules as the AI path: it can only produce a metric, breakdown
// and chart hint the catalog declares, and its spec still goes
// through validateSpec. Operational metrics and comparisons only.
//
// Scoring is deliberately simple: a phrase hit is worth 3, a single
// word 1, and a question has to reach MIN_SCORE before anything is
// run — a weak guess is worse than the soft "no match" note.
// ─────────────────────────────────────────────────────────────
import { DATASETS } from './customQuery.js';
import { METRICS, DIMENSIONS } from './reportCatalog.js';
import { COMPARISONS } from './reportComparisons.js';

export const MIN_SCORE = 3;

// Words a manager actually uses, per operational report. The label
// and id are added automatically, so this only needs the synonyms.
const KEYWORDS = {
  dispatch_volume:            ['dispatched', 'dispatch', 'food out', 'left the warehouse', 'kg sent', 'sent out', 'volume'],
  collection_compliance:      ['compliance', 'collected', 'collection rate', 'collections'],
  repeat_non_collections:     ['missed', 'missing collections', 'not collected', 'no show', 'problem centres', 'problem ecds', 'who is not'],
  late_collection_rate:       ['late collection', 'collect late', 'collecting late', 'late pickups'],
  gate_load_variance:         ['gate', 'loaded', 'loading', 'packed vs loaded'],
  decanting_wastage:          ['wastage', 'waste', 'decanting', 'spill', 'lost food'],
  decanting_margin_rate:      ['decanting accuracy', 'margin', 'bag weight', 'overfilled', 'underfilled'],
  goods_received:             ['received', 'receiving', 'deliveries in', 'goods in', 'came in'],
  receiving_discrepancy_rate: ['discrepancy', 'discrepancies', 'short deliver', 'short-deliver', 'wrong quantity', 'wrong quantities', 'supplier reliability'],
  unresolved_discrepancies:   ['unresolved', 'open discrepancies', 'not reconciled'],
  po_on_time_rate:            ['on time', 'on-time', 'deliver late', 'late deliveries', 'late suppliers', 'delivery dates'],
  supplier_lead_time:         ['lead time', 'how long', 'days to deliver', 'turnaround from supplier'],
  overdue_purchase_orders:    ['overdue', 'purchase orders', 'purchase orders late', 'chase', 'outstanding orders', 'overdue orders'],
  purchase_order_pipeline:    ['purchase orders', 'po status', 'orders raised', 'pos', 'funnel', 'pipeline'],
  procurement_spend:          ['spend', 'spent', 'cost', 'money', 'procurement', 'buying'],
  unit_price_trend:           ['price', 'prices', 'unit price', 'expensive', 'inflation'],
  donation_value:             ['donation value', 'donations', 'donated value'],
  donation_routing:           ['routing', 'unmatched', 'donated items', 'intake status'],
  section18a_pipeline:        ['section 18a', '18a', 'tax certificate', 'certificates', 'pipeline'],
  stock_on_hand:              ['stock on hand', 'in stock', 'inventory', 'what do we have'],
  low_stock_items:            ['low stock', 'reorder', 'running low', 'run out', 'running out'],
  stock_value:                ['stock value', 'worth', 'value of stock', 'stock worth'],
  expiring_stock:             ['expiring', 'expiry', 'expire', 'best before', 'spoil'],
  standing_order_demand:      ['standing order', 'demand', 'orders from centres', 'need next cycle'],
  stock_movement_volume:      ['movements', 'throughput', 'moved'],
  stock_flow:                 ['opening stock', 'closing stock', 'waterfall', 'stock in and out', 'stock flow', 'reconcile stock', 'stock change', 'stock changed'],
  days_of_cover:              ['days of stock', 'days of cover', 'how long will', 'last us', 'when will', 'run out date', 'runs out', 'will last', 'forecast', 'run out of', 'stock last'],
  stock_count_variance:       ['stock count', 'count variance', 'counted', 'shrinkage'],
  adjustment_reasons:         ['adjustment', 'adjusted', 'adjustments', 'reasons'],
  picking_flag_rate:          ['flag', 'flagged', 'flags', 'packers flag'],
  picking_turnaround:         ['picking', 'picking time', 'turnaround', 'how long to pack', 'packing time', 'picking take', 'take to pack', 'take to pick'],
  slip_pipeline:              ['picking slips', 'slips', 'still to pack', 'packing this week', 'pallets to pack'],
  community_request_outcomes: ['community requests', 'walk-in', 'walk in', 'phone-in', 'requests'],
  community_response_time:    ['response time', 'respond', 'resolve requests', 'how quickly', 'answer requests'],
  volunteer_hours:            ['volunteer hours', 'volunteers', 'volunteer'],
  volunteer_event_attendance: ['attendance', 'event', 'events', 'checked in', 'no-shows'],
};

// Scatter plots: a "vs / against / scatter" question naming the pair.
const COMPARISON_KEYWORDS = {
  centre_collections_vs_children:  ['centre', 'centres', 'ecd', 'ecds', 'children', 'collections'],
  supplier_volume_vs_discrepancy:  ['supplier', 'suppliers', 'discrepancy', 'volume', 'lines'],
  product_price_vs_quantity:       ['product', 'products', 'price', 'quantity', 'bought'],
  packer_workload_vs_flags:        ['packer', 'packers', 'workload', 'flag', 'flags'],
};

// Breakdown words → dimension ids, tried in order, first valid wins.
const DIMENSION_WORDS = [
  [/\bby month|monthly|per month|each month|over time|trend|month\b|getting (worse|better)|improving|worsening/, ['month', 'month_supplier', 'month_beneficiary', 'month_movement']],
  [/\bweekly|per week|by week|each week\b/, ['week']],
  [/\bsuppliers?\b/, ['supplier', 'month_supplier']],
  [/\b(centres?|centers?|ecds?|schools?)\b/, ['ecd_centre']],
  [/\bproducts?|items?\b/, ['product']],
  [/\b(day of (the )?week|week ?days?|busiest days?|busy days?|which days?|quiet days?)\b/, ['weekday']],
  [/\bcohorts?|tuesdays?|thursdays?|pickup days?\b/, ['cohort']],
  [/\bstatus\b/, ['po_status', 'slip_status', 's18a_status', 'routing_status', 'outcome']],
  [/\breasons?\b/, ['reason']],
  [/\b(flow|sankey|ended up|end up)\b/, ['category_flow']],
  [/\bcategor(y|ies)\b/, ['category', 'product_category']],
  [/\b(cold|dry|storage)\b/, ['storage_type']],
  [/\bevents?\b/, ['event']],
  [/\bbeneficiar(y|ies)|soup kitchens?\b/, ['beneficiary', 'month_beneficiary']],
  [/\btotal|overall|how much|how many\b/, ['none']],
];

const CHART_WORDS = [
  [/\b(pie|donut|doughnut)\b/, 'donut'],
  [/\bstacked\b/, 'stacked'],
  [/\bheat ?map\b/, 'heatmap'],
  [/\bpareto\b/, 'pareto'],
  [/\bfunnel\b/, 'funnel'],
  [/\bwaterfall\b/, 'waterfall'],
  [/\b(sankey|flow (chart|diagram))\b/, 'sankey'],
  [/\btable\b/, 'table'],
  [/\barea\b/, 'area'],
  [/\bline (chart|graph)\b/, 'line'],
];

// Everyday wording → the report vocabulary above, applied to the
// question before it is scored ("vendor" is a supplier, food that
// "went out" was dispatched). Tried in order. Grown from the misses in
// phrasings.js: when a real question lands on the wrong report, the
// fix is usually a line here.
const SYNONYMS = [
  [/\b(went|go|goes|going) out\b|\bcarr(y|ied)\b|\bsen[dt] to the centres?\b/g, ' dispatched '],
  [/\b(did ?n[o']?t|didnt|not|never) (collect|fetch|pick up)\w*\b|\bnot fetching\b|\bnot picking up\b/g, ' not collected '],
  [/\b(fetch|fetching|pick(ing)? up)\b/g, ' collected '],
  [/\b(collections?|pickups?) (were|was|that were) late\b|\blate collections?\b/g, ' late collection '],
  [/\bvendors?\b/g, ' supplier '],
  [/\b(sending|sends|sent|delivering|delivers) short\b|\bshort deliver(y|ies)\b|\bshort(ed)?\b/g, ' short deliver '],
  [/\b(late from suppliers?|suppliers? (are|is|were) late|late orders)\b/g, ' late deliveries '],
  [/\b(go|goes|going|gone) off\b|\bgoing bad\b|\bsell by\b/g, ' expire '],
  [/\bstock (do )?we have\b|\bhow much stock (do we have|is there|have we got)\b/g, ' stock on hand '],
  [/\border(s)? (each|every|per) (week|cycle|fortnight)\b/g, ' standing order '],
  [/\bsplitting( sacks?)?\b|\bsplit sacks?\b/g, ' decanting '],
  [/\bbags? lost\b|\blost bags?\b/g, ' wastage '],
  [/\b(how quickly|how fast)\b.*\brequests?\b|\banswer .*requests?\b/g, ' response time requests '],
];

const synonyms = (q) => SYNONYMS.reduce((acc, [re, to]) => acc.replace(re, to), q);

const norm = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9%\- ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

const scoreTerms = (q, terms) => {
  let score = 0;
  for (const t of terms) {
    const term = norm(t);
    const phrase = term.trim().includes(' ');
    // A single word also matches as the start of a longer one, so
    // "reorder" finds "reordering" and "price" finds "prices".
    if (phrase ? !q.includes(term) : !q.includes(term.trimEnd())) continue;
    score += phrase ? 3 : 1;
  }
  return score;
};

const iso = (d) => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));

// "last month", "this year", "last 6 weeks"… else the ask box's
// default of the last three months.
export const resolveDates = (question, todayISO) => {
  const q = norm(question);
  const [y, m, d] = todayISO.split('-').map(Number);
  const today = utc(y, m - 1, d);
  if (/ last month /.test(q)) return { from: iso(utc(y, m - 2, 1)), to: iso(utc(y, m - 1, 0)) };
  if (/ this month /.test(q)) return { from: iso(utc(y, m - 1, 1)), to: todayISO };
  if (/ this year /.test(q)) return { from: iso(utc(y, 0, 1)), to: todayISO };
  if (/ last year /.test(q)) return { from: iso(utc(y - 1, 0, 1)), to: iso(utc(y - 1, 11, 31)) };
  const n = / last (\d{1,2}) (week|month)s? /.exec(q);
  if (n) {
    const count = Number(n[1]);
    const from = n[2] === 'week'
      ? new Date(today.getTime() - count * 7 * 86400000)
      : utc(y, m - 1 - count, d);
    return { from: iso(from), to: todayISO };
  }
  return { from: iso(utc(y, m - 3, 1)), to: todayISO };
};

export const matchQuestion = (question, todayISO) => {
  const q = norm(synonyms(norm(question)));

  // "X by status" / "how many X are inactive": a custom report grouped
  // by that dataset's status, when one clearly fits and no prepared
  // report was named more strongly.
  const custom = STATUS_WORDS.test(q) ? bestCustom(q) : null;

  // A scatter request goes to a comparison when one fits.
  if (/ (scatter|vs|versus|against|compared? to) /.test(q)) {
    let best = null;
    for (const [id, words] of Object.entries(COMPARISON_KEYWORDS)) {
      const s = scoreTerms(q, words);
      if (!best || s > best.score) best = { id, score: s };
    }
    if (best && best.score >= 2) {
      return { kind: 'comparison', id: best.id, dateRange: resolveDates(question, todayISO), score: best.score, label: COMPARISONS[best.id].label };
    }
  }

  let best = null;
  for (const m of Object.values(METRICS)) {
    if (m.impactOnly) continue;
    const terms = [...(KEYWORDS[m.id] ?? []), m.label, m.id.replace(/_/g, ' ')];
    const s = scoreTerms(q, terms);
    if (s > 0 && (!best || s > best.score)) best = { metric: m, score: s };
  }
  if (!best && custom) {
    const ds = DATASETS[custom.id];
    return { kind: 'custom', id: custom.id, spec: { custom: custom.custom, dateRange: ds.date ? resolveDates(question, todayISO) : undefined }, score: custom.score };
  }
  if (!best || best.score < MIN_SCORE) {
    // One strong single word (e.g. "wastage") still earns a match
    // when nothing else competes with it.
    if (!best || best.score < 1) return null;
    const rivals = Object.values(METRICS).filter((m) => !m.impactOnly && m.id !== best.metric.id
      && scoreTerms(q, [...(KEYWORDS[m.id] ?? []), m.label]) === best.score);
    if (rivals.length) return null;
  }

  if (custom && custom.score >= best.score) {
    const ds = DATASETS[custom.id];
    return {
      kind: 'custom', id: custom.id,
      spec: { custom: custom.custom, dateRange: ds.date ? resolveDates(question, todayISO) : undefined },
      score: custom.score,
    };
  }

  const metric = best.metric;
  let dimension = metric.dimensions[0];
  for (const [re, dims] of DIMENSION_WORDS) {
    if (!re.test(q)) continue;
    const hit = dims.find((d) => metric.dimensions.includes(d) && DIMENSIONS[d]);
    if (hit) { dimension = hit; break; }
  }
  // "stacked" / "heatmap" need a two-way breakdown when one exists.
  const chartHint = CHART_WORDS.find(([re]) => re.test(q))?.[1];
  // A heatmap of days means week × weekday.
  if (chartHint === 'heatmap' && /\bdays?\b/.test(q) && metric.dimensions.includes('week_weekday')) {
    dimension = 'week_weekday';
  } else if ((chartHint === 'stacked' || chartHint === 'heatmap') && !dimension.startsWith('month_')) {
    dimension = metric.dimensions.find((d) => d.startsWith('month_')) ?? dimension;
  }
  if (chartHint === 'funnel' && metric.funnel) dimension = metric.funnel.dimension;
  if (chartHint === 'sankey' && metric.flows) dimension = metric.flows;

  return {
    kind: 'report',
    spec: {
      metric: metric.id,
      dimension,
      filters: {},
      dateRange: metric.temporal === 'snapshot' ? undefined : resolveDates(question, todayISO),
    },
    chartHint,
    score: best.score,
  };
};

// ── "Not what you meant? Try:" ────────────────────────────────
// The next closest answers to a question, whatever answered it: the
// prepared reports, the scatter comparisons, and — for a question
// about statuses — a custom report grouped by that dataset's status.
// Scored with the same keywords as matchQuestion; `exclude` drops the
// one already shown.
const STATUS_WORDS = / (status|statuses|state|outcome|outcomes|stage|stages|pipeline|flagged|pending|approved|returned|cancelled|inactive|active|by type) /;

// What people call each custom dataset, beyond its label.
const DATASET_WORDS = {
  purchase_orders: ['purchase orders', 'orders', 'pos'],
  picking_slips: ['picking slips', 'slips'],
  picking_lines: ['slip lines', 'picking lines'],
  collections: ['collections', 'collected', 'pallets', 'gate'],
  deliveries: ['deliveries', 'delivery notes'],
  delivery_lines: ['delivery lines'],
  donations: ['donations', '18a', 'section 18a'],
  community_requests: ['benevolent', 'requests', 'food parcel'],
  compost: ['compost', 'feed the soil', 'kits'],
  volunteer_events: ['volunteer events', 'events'],
  stock_movements: ['stock movements', 'movements'],
  beneficiaries: ['beneficiaries', 'centres', 'centre', 'ecds'],
  products: ['products', 'catalogue'],
};

const statusKeyOf = (d) => Object.keys(d.groups).find((k) => /status|outcome|^type$|active/.test(k));

function bestCustom(q) {
  let best = null;
  for (const [id, d] of Object.entries(DATASETS)) {
    const key = statusKeyOf(d);
    if (!key) continue;
    const s = scoreTerms(q, DATASET_WORDS[id] ?? [d.label]);
    if (s > 0 && (!best || s > best.score)) {
      best = { id, score: s + 1, label: `${d.label} by ${d.groups[key].label.toLowerCase()}`,
        custom: { dataset: id, groupBy: [key], measure: 'count', filters: {} } };
    }
  }
  return best;
}

export const rankReports = (question, { exclude = null, limit = 3 } = {}) => {
  const q = norm(synonyms(norm(question)));
  const out = [];
  for (const m of Object.values(METRICS)) {
    if (m.impactOnly || m.id === exclude) continue;
    const s = scoreTerms(q, [...(KEYWORDS[m.id] ?? []), m.label, m.id.replace(/_/g, ' ')]);
    if (s > 0) out.push({ kind: 'report', id: m.id, label: m.label, score: s });
  }
  for (const [id, words] of Object.entries(COMPARISON_KEYWORDS)) {
    if (`comparison:${id}` === exclude) continue;
    const s = scoreTerms(q, words);
    if (s >= 2) out.push({ kind: 'comparison', id, label: COMPARISONS[id].label, score: s });
  }
  if (STATUS_WORDS.test(q)) {
    for (const [id, d] of Object.entries(DATASETS)) {
      if (`custom:${id}` === exclude) continue;
      const key = statusKeyOf(d);
      if (!key) continue;
      const s = scoreTerms(q, DATASET_WORDS[id] ?? [d.label]);
      if (s > 0) out.push({ kind: 'custom', id, label: `${d.label} by ${d.groups[key].label.toLowerCase()}`, custom: { dataset: id, groupBy: [key], measure: 'count', filters: {} }, score: s + 1 });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score, ...rest }) => rest);
};

export default { matchQuestion, rankReports, resolveDates, MIN_SCORE };
