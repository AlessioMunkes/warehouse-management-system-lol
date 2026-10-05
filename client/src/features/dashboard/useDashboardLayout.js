// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/useDashboardLayout.js
//
// Which widgets this person has, in what order. Remembered per
// person, per role and per warehouse on this device — a layout is a
// preference, not a record, so browser storage is the right home and
// losing it (private window, cleared site data) just means the
// default board comes back.
//
// Stored as ids (plus each chart's chosen period). An id this build no longer has, or one this
// role may not use, is dropped on read, so a renamed widget or a role
// change can never leave a hole or offer something the role cannot
// open.
// ─────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';
import { DEFAULT_LAYOUT, getWidget } from './widgetCatalog';

const VERSION = 1;

export const layoutKey = (user) => {
  if (!user) return null;
  const person = `${user.role}:${user.id}`;
  return `wms.dashboard.v${VERSION}:${user.warehouse ? `${user.warehouse}/` : ''}${person}`;
};

export const cleanLayout = (ids, role) => {
  const seen = new Set();
  return (Array.isArray(ids) ? ids : []).filter((id) => {
    const w = getWidget(id);
    if (!w || !w.roles.includes(role) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const defaultsFor = (role) => cleanLayout(DEFAULT_LAYOUT[role] ?? [], role);

const EMPTY = { ids: null, periods: {} };

// Stored as { ids, periods }. An older save is a bare array of ids;
// it reads as that layout with every chart on its default period.
const read = (key, role) => {
  if (!key) return EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY;
    const saved = JSON.parse(raw);
    const ids = Array.isArray(saved) ? saved : saved?.ids;
    const periods = !Array.isArray(saved) && saved?.periods && typeof saved.periods === 'object' ? saved.periods : {};
    return { ids: ids ? cleanLayout(ids, role) : null, periods };
  } catch {
    return EMPTY;
  }
};

const write = (key, value) => {
  if (!key) return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* not kept; still works this visit */ }
};

const load = (key, role) => {
  const saved = read(key, role);
  return { key, ids: saved.ids ?? defaultsFor(role), periods: saved.periods };
};

export default function useDashboardLayout(user) {
  const role = user?.role;
  const key = layoutKey(user);
  const [state, setState] = useState(() => load(key, role));

  // A different person or warehouse on the same tab gets their own
  // board. Adjusted during render rather than in an effect, so there
  // is never a frame of the previous person's layout.
  if (state.key !== key) setState(load(key, role));
  const current = state.key === key ? state : load(key, role);

  // Every change goes through here, so what is saved is always what
  // is shown.
  const commit = useCallback((change) => setState((prev) => {
    const next = { ...prev, ...change(prev) };
    next.ids = cleanLayout(next.ids, role);
    write(key, { ids: next.ids, periods: next.periods });
    return next;
  }), [key, role]);

  const update = useCallback((fn) => commit((prev) => ({ ids: fn(prev.ids) })), [commit]);

  // `afterId` puts it in a particular gap — the + a person clicked —
  // rather than at the end.
  const add = useCallback((id, afterId) => update((prev) => {
    const at = afterId ? prev.indexOf(afterId) : -1;
    if (at < 0) return [...prev, id];
    return [...prev.slice(0, at + 1), id, ...prev.slice(at + 1)];
  }), [update]);
  const remove = useCallback((id) => update((prev) => prev.filter((x) => x !== id)), [update]);

  // Swap one widget for another in the same place.
  const replace = useCallback((oldId, newId) => update((prev) => prev.map((x) => (x === oldId ? newId : x))), [update]);

  // Moves within its own kind — tiles among tiles, panels among
  // panels — because that is how they are drawn.
  const move = useCallback((id, dir) => update((prev) => {
    const kind = getWidget(id)?.kind;
    const same = prev.filter((x) => getWidget(x)?.kind === kind);
    const i = same.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= same.length) return prev;
    const swapped = [...same];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    const others = prev.filter((x) => getWidget(x)?.kind !== kind);
    return kind === 'tile' ? [...swapped, ...others] : [...others, ...swapped];
  }), [update]);

  // A chart's Month / 3 months / Year choice, remembered with the layout.
  // Drag and drop: put `activeId` where `overId` is, among widgets of
  // its own kind (a number tile never lands among the charts).
  const reorder = useCallback((activeId, overId) => update((prev) => {
    const kind = getWidget(activeId)?.kind;
    if (!kind || getWidget(overId)?.kind !== kind) return prev;
    const same = prev.filter((x) => getWidget(x)?.kind === kind);
    const from = same.indexOf(activeId);
    const to = same.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return prev;
    const moved = [...same];
    moved.splice(to, 0, moved.splice(from, 1)[0]);
    const others = prev.filter((x) => getWidget(x)?.kind !== kind);
    return kind === 'tile' ? [...moved, ...others] : [...others, ...moved];
  }), [update]);

  const setPeriod = useCallback((id, period) => commit((prev) => ({
    periods: { ...prev.periods, [id]: period },
  })), [commit]);

  const reset = useCallback(() => {
    try { if (key) window.localStorage.removeItem(key); } catch { /* ignore */ }
    setState({ key, ids: defaultsFor(role), periods: {} });
  }, [key, role]);

  return {
    ids: current.ids, periods: current.periods,
    add, remove, replace, move, reorder, setPeriod, reset,
  };
}

/**
 * The panels in grid order, with the gaps a customising person can
 * fill. The grid is two columns: a medium panel alone at the end of a
 * row leaves a medium hole beside it, and a full last row leaves room
 * for any chart underneath.
 */
export const panelSlots = (panels) => {
  const out = [];
  let col = 0;
  panels.forEach((w, i) => {
    if (w.wide && col === 1) {
      out.push({ gap: 'medium', after: panels[i - 1].id });
      col = 0;
    }
    out.push({ widget: w });
    col = w.wide ? 0 : (col + 1) % 2;
  });
  const last = panels[panels.length - 1]?.id;
  out.push(col === 1 ? { gap: 'medium', after: last } : { gap: 'panel', after: last });
  return out;
};
