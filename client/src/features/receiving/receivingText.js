// ─────────────────────────────────────────────────────────────
// src/features/receiving/receivingText.js
//
// The receiving screen's fixed lists and small helpers: its two views
// and steps, where a line can be put away, which products count as
// fresh, today's date, and what an order search matches on. No React.
// ─────────────────────────────────────────────────────────────
import formatPoCode from './poCode';

export const MODE_KEY = 'stf_receiving_view_mode';
export const MODES = [
  { value: 'guided', label: 'Guided', hint: 'One line at a time' },
  { value: 'full',   label: 'Form',   hint: 'Every line at once' },
];
export const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

export const TOTAL_STEPS = 2;
export const STEP_META = {
  which: { n: 1, label: 'Which delivery' },
  work:  { n: 2, label: 'Count and put away' },
  done:  { n: 2, label: 'Finished' },
};

// Where a line can go. Two options, because two is how many places the
// warehouse has (warehouse visit: cold room and dry store).
export const LOCATIONS = [
  { value: 'dry_store', label: 'Dry store', meta: 'Shelves at the back' },
  { value: 'cold_room', label: 'Cold room', meta: 'For fresh food only' },
];

// Fresh lines need a use-by date (BR-06); dry goods may carry a
// best-before and it is asked for, but never required. Reads
// products.is_perishable; the name heuristic stays only as a fallback
// for a database without that column, so a missing column degrades
// this to a guess rather than breaking the screen.
const FRESH_HINTS = [
  'spinach', 'butternut', 'cabbage', 'carrot', 'tomato', 'onion',
  'apple', 'banana', 'potato', 'lettuce', 'fresh', 'milk',
];
export const isFreshProduct = (item) =>
  typeof item.is_perishable === 'boolean'
    ? item.is_perishable
    : FRESH_HINTS.some((hint) => (item.product_name || '').toLowerCase().includes(hint));

// NOT toISOString().slice(0, 10). That formats in UTC and Cape Town is
// UTC+2, so between midnight and 02:00 SAST it returns YESTERDAY and
// the note is dated to the wrong day.
export const todayISO = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const longDate = (value) =>
  new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });

// What an order search matches on. Module level so its identity is
// stable and useListSearch's memo is not defeated by a new function
// on every render.
//
// Both date forms are in the haystack deliberately: a worker reading
// a driver's note types "16 august", and a worker reading this screen
// types "2026-08-16". "order" is in there so that "order 86" works as
// typed, rather than only the bare number.
export const orderText = (order) => [
  'order',
  order.id,
  order.po_number,
  order.supplier_name,
  order.status,
  order.expected_delivery_date,
  order.expected_delivery_date ? longDate(order.expected_delivery_date) : '',
].filter(Boolean).join(' ');

// The order's own number, the one the manager's screen and the
// supplier's paperwork carry. poCode's id-based code is only for an
// order that somehow has none.
export const orderCode = (order) => order?.po_number || formatPoCode(order?.id);
