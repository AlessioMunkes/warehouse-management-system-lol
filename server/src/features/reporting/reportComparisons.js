// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reportComparisons.js
//
// Declared two-measure comparisons, drawn as scatter plots on the
// Operations page. The same rule as reportCatalog.js: every question
// this can answer is declared here once, and the AI can only name
// one of these ids — it cannot choose its own axes.
//
// OPERATIONS ONLY. Nothing here is an impact figure; the centre
// comparison uses the registered child count as context for
// collections, not as a "children reached" number.
// ─────────────────────────────────────────────────────────────
import repo from '../../repositories/reportingComparison.repository.js';

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
    run: repo.centreCollectionsVsChildren,
    detail: (p) => `${p.meta.missed} missed${p.meta.cohort ? ` · ${p.meta.cohort}` : ''}`,
    caveat: 'Centres with no registered child count are left out.',
  },
  supplier_volume_vs_discrepancy: {
    id: 'supplier_volume_vs_discrepancy',
    label: 'Supplier volume vs discrepancy rate',
    description:
      'One dot per supplier: how many delivery lines they sent against how often the ' +
      'quantity was wrong. A big supplier with a high rate is the biggest reconciliation risk.',
    x: { label: 'Delivery lines', unit: 'lines' },
    y: { label: 'Discrepancy rate', unit: '%' },
    run: repo.supplierVolumeVsDiscrepancy,
    detail: (p) => `${p.meta.deliveries} deliveries`,
    caveat: 'A line is discrepant if received differs from expected in either direction.',
  },
  product_price_vs_quantity: {
    id: 'product_price_vs_quantity',
    label: 'Product price vs quantity bought',
    description:
      'One dot per product: how much was bought against the average price paid per unit. ' +
      'Expensive products bought in bulk are where a better price saves the most.',
    x: { label: 'Quantity received', unit: 'units' },
    y: { label: 'Average unit price', unit: 'ZAR/unit' },
    run: repo.productPriceVsQuantity,
    detail: (p) => (p.meta.unit ? `measured in ${p.meta.unit}` : ''),
    caveat: 'Units differ between products. Excludes lines with no purchase order price.',
  },
  packer_workload_vs_flags: {
    id: 'packer_workload_vs_flags',
    label: 'Packer workload vs flag rate',
    description:
      'One dot per staff packer: how many picking lines they worked against how often they ' +
      'flagged one. Shows who carries the load and where packers keep hitting problems.',
    x: { label: 'Lines worked', unit: 'lines' },
    y: { label: 'Flag rate', unit: '%' },
    run: repo.packerWorkloadVsFlags,
    detail: (p) => `${p.meta.slips} slips`,
    caveat: 'Staff packers only; guest packers have no account and are not shown. A flag usually means stock was short, not that the packer erred.',
  },
};

export const COMPARISON_IDS = Object.keys(COMPARISONS);

export const getComparison = (id) =>
  Object.prototype.hasOwnProperty.call(COMPARISONS, id) ? COMPARISONS[id] : null;

export default { COMPARISONS, COMPARISON_IDS, getComparison };
