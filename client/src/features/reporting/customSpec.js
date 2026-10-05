// A fresh custom-report spec for a dataset: its first grouping,
// counted, no filters. Shared by the builder and the page.
export const defaultCustom = (dataset) => ({
  dataset: dataset.id,
  groupBy: [dataset.groups[0]?.id].filter(Boolean),
  measure: dataset.measures[0]?.id ?? 'count',
  filters: {},
});
