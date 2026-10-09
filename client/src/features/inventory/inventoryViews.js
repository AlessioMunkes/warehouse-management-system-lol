// ─────────────────────────────────────────────────────────────
// client/src/features/inventory/inventoryViews.js
//
// What each inventory tab, filter and status means, in one place, with
// no React in it — so the tab counts, the rows a tab shows and the
// badge on each row cannot disagree.
//
// Every rule reads fields stockAPI.js has already mapped; nothing here
// recomputes what the server decided. isShortfall and isLowStock come
// from getManifest's SQL, derived from AVAILABLE.
// ─────────────────────────────────────────────────────────────

export const EXPIRY_WINDOW_DAYS = 30;
// Inside this, an expiry is urgent (red) rather than soon (amber) —
// the server's first expiry warning goes out at 14 days by default.
export const URGENT_EXPIRY_DAYS = 14;
export const IDLE_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

// Today as 'YYYY-MM-DD' in Cape Town, the timezone the server's expiry
// comparison uses. toISOString() would be UTC, which is yesterday for
// the first two hours of every SAST day.
export const todaySast = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(now);

// Whole days between two 'YYYY-MM-DD' strings. Parsed as UTC midnight
// on both sides, so daylight saving (which SA does not have, but the
// browser might) cannot make a day 23 hours long.
export const daysBetween = (fromDay, toDay) =>
  Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);

// ── Stock status ──────────────────────────────────────────────
// Shortfall wins over low stock: the server's is_low_stock is also
// true for every shortfall row (available <= threshold includes
// negative), and a row is one or the other on this screen.
export const stockStatus = (p) => {
  if (p.isShortfall) return 'shortfall';
  if (p.isLowStock) return 'low_stock';
  return 'in_stock';
};

export const STOCK_STATUS_LABEL = {
  shortfall: 'Shortfall',
  low_stock: 'Low stock',
  in_stock:  'In stock',
};

// Problems first when sorting by status.
export const STOCK_STATUS_RANK = { shortfall: 2, low_stock: 1, in_stock: 0 };

// ── Expiry ────────────────────────────────────────────────────
export const expiryState = (day, today = todaySast()) => {
  if (!day) return null;
  const daysLeft = daysBetween(today, day);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= URGENT_EXPIRY_DAYS) return { status: 'urgent', daysLeft };
  if (daysLeft <= EXPIRY_WINDOW_DAYS) return { status: 'soon', daysLeft };
  return { status: 'ok', daysLeft };
};

// Within the window: inside a badge, a countdown reads faster than a
// date ("In 7 days").
export const isExpiringSoon = (state) => state?.status === 'soon' || state?.status === 'urgent';
export const countdownLabel = ({ daysLeft }) => (daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`);

export const expiryLabel = (state) => {
  if (!state) return '';
  const { status, daysLeft } = state;
  if (status === 'expired') return daysLeft === -1 ? 'Expired yesterday' : `Expired ${-daysLeft} days ago`;
  if (daysLeft === 0) return 'Expires today';
  if (daysLeft === 1) return 'Expires tomorrow';
  return `Expires in ${daysLeft} days`;
};

// ── Recency ───────────────────────────────────────────────────
// A product that has never moved but holds stock is the most idle of
// all. One that has never moved and holds nothing is a catalogue entry
// nobody has used yet, and listing it as "no movement" would bury the
// rows that matter.
export const isIdle = (p, now = new Date()) => {
  if (!p.lastMovementAt) return Number(p.onHand) !== 0;
  return (now.getTime() - new Date(p.lastMovementAt).getTime()) / DAY_MS >= IDLE_DAYS;
};

// ── Views (the tabs) ──────────────────────────────────────────
// `id` is what goes in ?status=, so the dashboard and the low-stock
// notification can link straight to a tab. 'lowstock' is the id those
// links already use.
export const VIEWS = [
  { id: 'all',       label: 'All',                                   test: () => true },
  { id: 'lowstock',  label: 'Low stock',  alert: false,              test: (p) => stockStatus(p) === 'low_stock' },
  { id: 'shortfall', label: 'Shortfall',  alert: true,               test: (p) => p.isShortfall },
  { id: 'expiring',  label: `Expiring in ${EXPIRY_WINDOW_DAYS} days`, alert: true,
    test: (p, ctx) => isExpiringSoon(expiryState(p.earliestExpiry, ctx.today)) },
  { id: 'idle',      label: `No movement ${IDLE_DAYS}+ days`,        test: (p, ctx) => isIdle(p, ctx.now) },
];

export const viewById = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

// ── Filters (the chips) ───────────────────────────────────────
export const FILTERS = [
  { key: 'committed', label: 'Has committed stock', test: (p) => p.committed > 0 },
  { key: 'reorder',   label: 'At or below reorder level', test: (p) => p.available <= p.reorderAt },
];

export const matchesSearch = (p, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.sku, p.barcode, p.ean].some((v) => v?.toLowerCase().includes(q));
};

// Rows for a view, filters and search, in the server's order
// (alphabetical by name). Sorting is the table's job.
export const filterProducts = (products, { view = 'all', filters = [], search = '', now = new Date() } = {}) => {
  const ctx = { now, today: todaySast(now) };
  const v = viewById(view);
  const active = FILTERS.filter((f) => filters.includes(f.key));
  return products.filter((p) =>
    v.test(p, ctx) && active.every((f) => f.test(p)) && matchesSearch(p, search));
};

export const countViews = (products, now = new Date()) => {
  const ctx = { now, today: todaySast(now) };
  return Object.fromEntries(VIEWS.map((v) => [v.id, products.filter((p) => v.test(p, ctx)).length]));
};

// ── The row's edge ────────────────────────────────────────────
// The worst thing about a product, as a colour down the row's left
// edge: red for a shortfall or an expiry inside two weeks, amber for
// low stock or an expiry inside the month. Scanning a long list, the
// edge says where to look before any number is read.
export const rowTone = (p, today = todaySast()) => {
  const expiry = expiryState(p.earliestExpiry, today)?.status;
  if (p.isShortfall || expiry === 'urgent') return 'bad';
  if (stockStatus(p) === 'low_stock' || expiry === 'soon') return 'warn';
  return null;
};

// ── Export ────────────────────────────────────────────────────
export const EXPORT_COLUMNS = [
  { key: 'name',           label: 'Product' },
  { key: 'sku',            label: 'SKU' },
  { key: 'category',       label: 'Category' },
  { key: 'unit',           label: 'Unit' },
  { key: 'onHand',         label: 'On hand' },
  { key: 'committed',      label: 'Committed' },
  { key: 'available',      label: 'Available' },
  { key: 'reorderAt',      label: 'Reorder at' },
  { key: 'earliestExpiry', label: 'Earliest expiry' },
  { key: 'status',         label: 'Status' },
];

export const exportRows = (products) =>
  products.map((p) => ({ ...p, earliestExpiry: p.earliestExpiry ?? '', status: STOCK_STATUS_LABEL[stockStatus(p)] }));
