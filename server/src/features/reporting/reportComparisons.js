// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reportComparisons.js
//
// Declared two-measure comparisons, drawn as scatter plots on the
// Operations page. The same rule as reportCatalog.js: every question
// this can answer is declared here once, and the AI can only name
// one of these ids — it cannot choose its own axes.
//
// `repoFn` names the query in reportingComparison.repository.js rather
// than importing it, so this file (and the AI tool schema built from
// it) loads without a database. reportingInsight.service.js runs it.
//
// OPERATIONS ONLY. Nothing here is an impact figure; the centre
// comparison uses the registered child count as context for
// collections, not as a "children reached" number.
//
// GENERATED REPORTS
//   attention — which dots the Actions list picks out, relative to the
//               averages drawn on the chart: x/y 'high' or 'low' (or
//               absent, for "either way"). The worst first.
//   pick / rank — instead of a corner, when the chart alone is not the
//               whole signal (a big centre that collected once but
//               missed three times sits above the average line).
//   unitLabel — what one dot is, in words ("ECD centre").
//   actionTitle / actionIntro — the heading and one-line instruction
//               over that list.
//   lens      — the operational requirement this chart speaks to, for
//               the Business view.
// ─────────────────────────────────────────────────────────────

export const COMPARISONS = {
  centre_collections_vs_children: {
    id: 'centre_collections_vs_children',
    label: 'Centre collections vs children',
    description:
      'One dot per ECD centre: how many children it is registered for against how many ' +
      'of its pallets it actually collected in the period. Big centres collecting little ' +
      'are the ones to call first.',
    x: { label: 'Registered children', unit: 'children' },
    y: { label: 'Pallets collected', unit: 'collections' },
    repoFn: 'centreCollectionsVsChildren',
    detail: (p) => `${p.meta.missed} missed${p.meta.cohort ? ` · ${p.meta.cohort}` : ''}`,
    caveat: 'Centres with no registered child count are left out.',
    unitLabel: 'ECD centre',
    attention: { x: 'high' },
    pick: (p, avg) => p.x >= avg.x && p.meta.missed > 0,
    rank: (a, b) => b.meta.missed - a.meta.missed || b.x - a.x,
    actionTitle: 'Larger centres that missed collections',
    actionIntro: 'Call these centres first: more children than average, and pallets left uncollected.',
    lens: 'Every registered centre should collect its allocation on its collection day; a large centre that collects little means many children going without.',
  },
  supplier_volume_vs_discrepancy: {
    id: 'supplier_volume_vs_discrepancy',
    label: 'Supplier volume vs discrepancy rate',
    description:
      'One dot per supplier: how many delivery lines they sent against how often the ' +
      'quantity was wrong. A big supplier with a high rate is the biggest reconciliation risk.',
    x: { label: 'Delivery lines', unit: 'lines' },
    y: { label: 'Discrepancy rate', unit: '%' },
    repoFn: 'supplierVolumeVsDiscrepancy',
    detail: (p) => `${p.meta.deliveries} deliveries`,
    caveat: 'A line is discrepant if received differs from expected in either direction.',
    unitLabel: 'supplier',
    attention: { x: 'high', y: 'high' },
    actionTitle: 'High-volume suppliers with an above-average discrepancy rate',
    actionIntro: 'Raise delivery accuracy with these suppliers first: they send the most and get it wrong most often.',
    lens: 'Deliveries should match the purchase order; a large supplier who often sends the wrong quantity is the biggest reconciliation and stock risk.',
  },
  product_price_vs_quantity: {
    id: 'product_price_vs_quantity',
    label: 'Product price vs quantity bought',
    description:
      'One dot per product: how much was bought against the average price paid per unit. ' +
      'Expensive products bought in bulk are where a better price saves the most.',
    x: { label: 'Quantity received', unit: 'units' },
    y: { label: 'Average unit price', unit: 'ZAR/unit' },
    repoFn: 'productPriceVsQuantity',
    detail: (p) => (p.meta.unit ? `measured in ${p.meta.unit}` : ''),
    caveat: 'Units differ between products. Excludes lines with no purchase order price.',
    unitLabel: 'product',
    attention: { x: 'high', y: 'high' },
    actionTitle: 'Expensive products bought in bulk',
    actionIntro: 'Ask for a better price on these first: a small saving per unit adds up most here.',
    lens: 'Money is accountable and should stretch as far as possible; bulk buys at a high unit price are where a better price saves the most.',
  },
  packer_workload_vs_flags: {
    id: 'packer_workload_vs_flags',
    label: 'Packer workload vs flag rate',
    description:
      'One dot per staff packer: how many picking lines they worked against how often they ' +
      'flagged one. Shows who carries the load and where packers keep hitting problems.',
    x: { label: 'Lines worked', unit: 'lines' },
    y: { label: 'Flag rate', unit: '%' },
    repoFn: 'packerWorkloadVsFlags',
    detail: (p) => `${p.meta.slips} slips`,
    caveat: 'Staff packers only; guest packers have no account and are not shown. A flag usually means stock was short, not that the packer erred.',
    unitLabel: 'staff packer',
    // The dots are people: the AI model sees "Packer A", never a name.
    people: 'Packer',
    attention: { y: 'high' },
    actionTitle: 'Packers flagging more than average',
    actionIntro: 'Check what these packers keep flagging — usually short or unsuitable stock on their slips, not their packing.',
    lens: 'Pallets should be packed complete and on time; frequent flags point to stock problems reaching the packing floor, and a heavy workload on one person is a risk to getting pallets out.',
  },
};

export const COMPARISON_IDS = Object.keys(COMPARISONS);

export const getComparison = (id) =>
  Object.prototype.hasOwnProperty.call(COMPARISONS, id) ? COMPARISONS[id] : null;

export default { COMPARISONS, COMPARISON_IDS, getComparison };
