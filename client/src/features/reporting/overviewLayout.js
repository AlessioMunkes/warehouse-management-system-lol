// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/overviewLayout.js
//
// WHICH CARDS A PERSON HAS ON THE OPERATIONS REPORTS OVERVIEW, and in
// what order. Each card is one report shown small: a measure, how it
// is broken down, and over what period.
//
// Remembered per person, per role and per warehouse on this device,
// the same way the dashboard remembers its widgets (features/dashboard/
// useDashboardLayout.js): a layout is a preference, not a record, so
// browser storage is the right home, and losing it just brings the
// default cards back.
//
// A saved card whose report this build no longer has, or whose
// breakdown that report no longer offers, is dropped or corrected on
// read, so a renamed report can never leave a broken card.
// ─────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react';

const VERSION = 1;
export const MAX_CARDS = 12;

// The periods a card can cover (ids from dateRanges.js).
export const CARD_PERIODS = [
  { id: 'last_7d', label: 'Last 7 days' },
  { id: 'last_30d', label: 'Last 30 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_3m', label: 'Last 3 months' },
  { id: 'last_6m', label: 'Last 6 months' },
  { id: 'this_year', label: 'This year' },
];
const PERIOD_IDS = new Set(CARD_PERIODS.map((p) => p.id));
export const DEFAULT_PERIOD = 'last_3m';

// What everyone starts with: the four signals worth seeing unasked.
export const DEFAULT_CARDS = [
  { metric: 'dispatch_volume', dimension: 'month', preset: 'last_3m' },
  { metric: 'unit_price_trend', dimension: 'product', preset: 'last_3m' },
  { metric: 'collection_compliance', dimension: 'month', preset: 'last_3m' },
  { metric: 'low_stock_items', dimension: 'product', preset: 'last_3m' },
];

export const cardsKey = (user) => {
  if (!user) return null;
  return `wms.reports.overview.v${VERSION}:${user.warehouse ? `${user.warehouse}/` : ''}${user.role}:${user.id}`;
};

export const cardId = (card) => `${card.metric}|${card.dimension}|${card.preset}`;

/**
 * Cards as saved → cards this build can draw. Unknown reports go; a
 * breakdown the report does not offer becomes its first one; the same
 * card twice is kept once.
 */
export const cleanCards = (cards, metrics) => {
  const byId = new Map((metrics ?? []).map((m) => [m.id, m]));
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(cards) ? cards : []) {
    const metric = byId.get(c?.metric);
    if (!metric) continue;
    const dimension = metric.dimensions.some((d) => d.id === c.dimension) ? c.dimension : metric.dimensions[0]?.id;
    if (!dimension) continue;
    const card = { metric: metric.id, dimension, preset: PERIOD_IDS.has(c.preset) ? c.preset : DEFAULT_PERIOD };
    if (seen.has(cardId(card))) continue;
    seen.add(cardId(card));
    out.push(card);
    if (out.length >= MAX_CARDS) break;
  }
  return out;
};

const read = (key) => {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    const saved = raw ? JSON.parse(raw) : null;
    return Array.isArray(saved?.cards) ? saved.cards : null;
  } catch {
    return null;
  }
};
const write = (key, cards) => {
  if (!key) return;
  try { window.localStorage.setItem(key, JSON.stringify({ cards })); } catch { /* not kept; still works this visit */ }
};

/** The cards for this person, and the ways to change them. */
export default function useOverviewCards(user, metrics) {
  const key = cardsKey(user);
  // Held with the key it was read for, so a change of person or
  // warehouse never shows a frame of someone else's cards.
  const [state, setState] = useState(() => ({ key, saved: read(key) }));
  const saved = state.key === key ? state.saved : read(key);

  const cards = useMemo(() => cleanCards(saved ?? DEFAULT_CARDS, metrics), [saved, metrics]);
  const customised = saved !== null;

  const save = useCallback((next) => {
    write(key, next);
    setState({ key, saved: next });
  }, [key]);

  const add = useCallback((card) => {
    const next = cleanCards([...cards, card], metrics);
    if (next.length === cards.length) return false;      // already there, or full
    save(next);
    return true;
  }, [cards, metrics, save]);

  const remove = useCallback((id) => save(cards.filter((c) => cardId(c) !== id)), [cards, save]);

  const move = useCallback((id, by) => {
    const from = cards.findIndex((c) => cardId(c) === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= cards.length) return;
    const next = [...cards];
    [next[from], next[to]] = [next[to], next[from]];
    save(next);
  }, [cards, save]);

  const reset = useCallback(() => {
    try { if (key) window.localStorage.removeItem(key); } catch { /* ignore */ }
    setState({ key, saved: null });
  }, [key]);

  return { cards, customised, add, remove, move, reset, full: cards.length >= MAX_CARDS };
}
