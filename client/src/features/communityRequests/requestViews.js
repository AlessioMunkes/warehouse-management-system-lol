// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/requestViews.js
//
// The manager's tabs for benevolent requests, and the one status each
// row shows.
//
//   pending      Awaiting approval   waiting for a manager to choose items
//   approved     Approved            items chosen, stock set aside
//   needs-items  Needs new items     approved, but a pallet used the stock
//   fulfilled    Fulfilled           fulfilled or partially fulfilled
//   declined     Declined
//   all          All
//
// `id` is what goes in ?status=. The dashboard's Needs attention lines
// link to pending, approved and needs-items.
// ─────────────────────────────────────────────────────────────

export const isFlagged = (r) => r.outcome === 'approved' && Boolean(r.itemsShortAt);

// What a row's badge says. A flagged request is still "approved" in
// the database, but it reads as needing new items.
export const displayStatus = (r) => (isFlagged(r) ? 'needs_items' : r.outcome);

export const DISPLAY_LABELS = {
  pending:             'Awaiting approval',
  approved:            'Approved',
  needs_items:         'Needs new items',
  fulfilled:           'Fulfilled',
  partially_fulfilled: 'Partially fulfilled',
  declined:            'Declined',
  referred:            'Referred',
};

const byFlaggedOldestFirst = (a, b) =>
  new Date(a.itemsShortAt).getTime() - new Date(b.itemsShortAt).getTime();

export const VIEWS = [
  { id: 'pending',     label: 'Awaiting approval', alert: true,
    test: (r) => r.outcome === 'pending' },
  { id: 'approved',    label: 'Approved',
    test: (r) => r.outcome === 'approved' && !r.itemsShortAt },
  { id: 'needs-items', label: 'Needs new items', alert: true,
    test: isFlagged, sort: byFlaggedOldestFirst },
  { id: 'fulfilled',   label: 'Fulfilled',
    test: (r) => r.outcome === 'fulfilled' || r.outcome === 'partially_fulfilled' },
  { id: 'declined',    label: 'Declined',
    test: (r) => r.outcome === 'declined' },
  { id: 'all',         label: 'All',
    test: () => true },
];

export const viewById = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

// The rows of a view, in the view's own order when it has one.
export const rowsForView = (requests, view) => {
  const rows = requests.filter(view.test);
  return view.sort ? [...rows].sort(view.sort) : rows;
};

// Names of the products that ran short, for "Rice, Beans".
export const shortProductNames = (r) =>
  r.items.filter((i) => i.shortAt).map((i) => i.productName);

// Who has it: the claimer, else the packer a manager picked.
export const packerLabel = (r) => {
  if (r.handledByName) return `Claimed by ${r.handledByName}`;
  if (r.assignedToName) return `Assigned to ${r.assignedToName}`;
  return null;
};
