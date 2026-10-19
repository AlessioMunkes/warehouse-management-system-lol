// ─────────────────────────────────────────────────────────────
// client/src/features/beneficiaries/beneficiaryColumns.jsx
//
// The beneficiary table's columns, in useTableView's shape. Its own
// module for the same react-refresh reason as poColumns.jsx.
//
// Three columns the table never had room to show: how many children
// the centre feeds, when they last collected, and — as a filter rather
// than a column — which cohort they are in. The first two are the
// numbers a manager plans a week around, and both were only visible by
// opening the row one at a time.
// ─────────────────────────────────────────────────────────────
import StatusBadge from '@/components/ui/status-badge';
import { COHORT_LABELS } from '@/lib/cohorts';
import { formatShortDate as fmtDate } from '@/lib/dates';
import { hasPin, placeLine } from './beneficiaryLocation';

export const BENEFICIARY_COLUMNS = [
  { key: 'name', label: 'Beneficiary', alwaysOn: true, weight: 3,
    sort: (b) => (b.name ?? '').toLowerCase(),
    cellClass: 'font-medium',
    cell: (b) => b.name },

  { key: 'cohort', label: 'Cohort', weight: 1.6, minWidth: 'sm',
    sort: (b) => (COHORT_LABELS[b.cohort] ?? b.cohort ?? '').toLowerCase(),
    cell: (b) => COHORT_LABELS[b.cohort] ?? b.cohort },

  { key: 'contact', label: 'Contact', weight: 2.4, minWidth: 'md',
    sort: (b) => (b.contactName ?? '').toLowerCase(),
    cell: (b) => b.contactName || '-' },

  // Null is "nobody has recorded it", which is not zero — the
  // comparator in useTableView sorts nulls last in both directions
  // rather than letting them read as the smallest centre.
  { key: 'children', label: 'Children', weight: 1.6, minWidth: 'lg', numeric: true,
    sort: (b) => (b.childCount ?? null),
    cellClass: 'text-center',
    cell: (b) => (b.childCount === null || b.childCount === undefined ? '-' : b.childCount) },

  { key: 'lastCollected', label: 'Last collected', weight: 2.2, minWidth: 'lg', numeric: true,
    sort: (b) => (b.lastCollectedDate ? new Date(b.lastCollectedDate).getTime() : null),
    cell: (b) => fmtDate(b.lastCollectedDate) },

  // Where the centre is: its suburb (or address), or that it has no pin
  // and so is not drawn on the Impact map.
  { key: 'location', label: 'Location', weight: 2.4, minWidth: 'lg',
    sort: (b) => (b.suburb || b.address || (hasPin(b) ? '~' : '')).toLowerCase() || null,
    cell: (b) => (hasPin(b)
      ? (b.suburb || placeLine(b) || 'Pin only')
      : <StatusBadge tone="warn">No location</StatusBadge>) },

  // Two badges can land here at once, so it carries more width than a
  // one-badge status column would.
  { key: 'status', label: 'Status', sort: null, weight: 2.4,
    cell: (b) => (
      <span className="flex flex-wrap justify-end gap-1">
        {!b.approvedAt ? <StatusBadge kind="record" status="unapproved">Unapproved</StatusBadge> : null}
        {!b.isActive ? <StatusBadge kind="record" status="inactive">Inactive</StatusBadge> : null}
      </span>
    ) },
];
