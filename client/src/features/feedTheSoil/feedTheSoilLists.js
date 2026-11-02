// ─────────────────────────────────────────────────────────────
// src/features/feedTheSoil/feedTheSoilLists.js
//
// The Feed the Soil manager page's lists: the kits and records tables'
// columns, filters and sort orders, the status words, and the tabs.
// No React.
// ─────────────────────────────────────────────────────────────

export const KIT_COLUMNS = [
  { key: 'kit', label: 'Kit', alwaysOn: true },
  { key: 'owner', label: 'Owner' },
  { key: 'suburb', label: 'Suburb' },
  { key: 'status', label: 'Status' },
  { key: 'lastLogged', label: 'Last logged' },
  { key: 'assigned', label: 'Assigned' },
];
export const RECORD_COLUMNS = [
  { key: 'kit', label: 'Kit', alwaysOn: true },
  { key: 'owner', label: 'Owner' },
  { key: 'logged', label: 'Logged' },
  { key: 'weight', label: 'Weight' },
  { key: 'sentTo', label: 'Sent to' },
  { key: 'status', label: 'Status' },
];
const STATUS_WORD = { assigned: 'Assigned', logged: 'Logged', dispatched: 'Dispatched' };
export const KIT_FILTERS = [
  { key: 'status', label: 'Status', valueOf: (k) => k.status, labelOf: (v) => STATUS_WORD[v] ?? v },
  { key: 'suburb', label: 'Suburb', valueOf: (k) => k.suburb },
];
export const RECORD_FILTERS = [
  { key: 'status', label: 'Status', valueOf: (r) => r.status, labelOf: (v) => STATUS_WORD[v] ?? v },
  { key: 'suburb', label: 'Suburb', valueOf: (r) => r.suburb },
  { key: 'sentTo', label: 'Sent to', valueOf: (r) => r.dispatched_to },
];
export const columnsProp = (idPrefix, view) => ({
  idPrefix, columns: view.availableColumns, hidden: view.hidden,
  onToggle: view.toggleColumn, onReset: view.resetColumns,
});

export const STATUS_LABELS = { assigned: 'Assigned', logged: 'Logged', dispatched: 'Dispatched' };
// Amber with the household, blue once compost is in and waiting to go
// to a farm, green when it has gone — lib/statusStyles.js.

export const fmtKg = (value) => (value === null || value === undefined ? '-' : `${Number(value).toLocaleString('en-ZA')} kg`);

// Click a column name to sort by it. Status sorts in the order a kit
// moves through (assigned → logged → dispatched), not alphabetically.
const STATUS_ORDER = { assigned: 0, logged: 1, dispatched: 2 };
const time = (v) => (v ? new Date(v).getTime() : null);
export const KIT_SORT = {
  kit: (k) => Number(k.id),
  owner: (k) => k.owner_name,
  suburb: (k) => k.suburb,
  status: (k) => STATUS_ORDER[k.status] ?? 9,
  lastLogged: (k) => time(k.last_logged_at),
  assigned: (k) => time(k.assigned_at),
};
export const RECORD_SORT = {
  kit: (r) => Number(r.kit_id),
  owner: (r) => r.owner_name,
  status: (r) => STATUS_ORDER[r.status] ?? 9,
};

// `idle`: kits assigned three months ago or more with no compost ever
// logged (is_idle, the server's rule). The dashboard's Needs attention
// line links here with ?status=idle. Shown only while there are any.
export const TABS = [
  { id: 'kits',    label: 'Kits' },
  { id: 'idle',    label: 'Idle kits', alert: true },
  { id: 'records', label: 'Records' },
  // Pop-up stands and other sites, with their QR posters (migration 069).
  { id: 'sites',   label: 'Drop-off sites' },
];
