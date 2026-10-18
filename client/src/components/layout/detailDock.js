// ─────────────────────────────────────────────────────────────
// client/src/components/layout/detailDock.js
//
// The space down the right of the manager shell where an open record
// sits beside its list, instead of over it.
//
// ManagerLayout provides the element (DetailDockContext); DetailPanel
// portals into it on a wide screen. The width the dock is taking is
// kept here as well, outside React context, because useTableView needs
// it and is called from pages and tests that may have no shell around
// them — it reads 0 there and behaves as it always did.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useSyncExternalStore } from 'react';

export const DetailDockContext = createContext(null);
export const useDetailDock = () => useContext(DetailDockContext);

// Below this the list has no room left beside a record, so the panel
// goes back to opening over the page.
export const DOCK_QUERY = '(min-width: 1280px)';

let width = 0;
const listeners = new Set();

export const setDockWidth = (next) => {
  if (next === width) return;
  width = next;
  listeners.forEach((fn) => fn());
};

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const read = () => width;

export const useDockWidth = () => useSyncExternalStore(subscribe, read, () => 0);
