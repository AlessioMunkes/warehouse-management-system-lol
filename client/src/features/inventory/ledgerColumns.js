// ─────────────────────────────────────────────────────────────
// client/src/features/inventory/ledgerColumns.js
//
// The stock ledger's columns, for the Columns menu (useTableView). Every
// one but When can be hidden. LedgerTable.jsx draws them.
// ─────────────────────────────────────────────────────────────
export const LEDGER_COLUMNS = [
  { key: 'when', label: 'When', alwaysOn: true },
  { key: 'product', label: 'Product' },
  { key: 'type', label: 'Type' },
  { key: 'change', label: 'Change' },
  { key: 'balance', label: 'Balance after' },
  { key: 'reference', label: 'Reference' },
  { key: 'by', label: 'By' },
];
