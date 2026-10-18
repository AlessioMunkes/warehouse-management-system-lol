// ─────────────────────────────────────────────────────────────
// client/src/features/staff/historyView.js
//
// The date ranges and sort comparers HistoryScreen.jsx and the history
// pages share. Kept out of the component file so it exports components
// only (react-refresh).
// ─────────────────────────────────────────────────────────────
export const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all',   label: 'All' },
];

// The same bounds the server's ranges use (delivery.service.js
// resolveRange): today, the last 7 days, the last 30 days. For a
// history whose API has no range of its own, so it is narrowed here.
const localDay = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const withinRange = (value, range, now = new Date()) => {
  if (range === 'all' || !range) return true;
  if (!value) return false;
  const day = localDay(new Date(value));
  if (range === 'today') return day === localDay(now);
  const days = range === 'week' ? 7 : 30;
  return day >= localDay(new Date(now.getTime() - days * 86400000));
};

// Comparers for the sorts most histories want.
const time = (v) => (v ? new Date(v).getTime() : 0);
export const byNewest = (dateOf) => (a, b) => time(dateOf(b)) - time(dateOf(a));
export const byOldest = (dateOf) => (a, b) => time(dateOf(a)) - time(dateOf(b));
export const byText = (textOf) => (a, b) =>
  String(textOf(a) ?? '').localeCompare(String(textOf(b) ?? ''), 'en-ZA', { sensitivity: 'base' });
export const byNumber = (numOf) => (a, b) => Number(numOf(b) ?? 0) - Number(numOf(a) ?? 0);
