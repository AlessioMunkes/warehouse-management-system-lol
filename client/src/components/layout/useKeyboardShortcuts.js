// ─────────────────────────────────────────────────────────────
// client/src/components/layout/useKeyboardShortcuts.js
//
// The shortcuts listed in shortcuts.js, made to work:
//   ?            open the Shortcuts window
//   /            go to the screen's search box
//   G, then a letter   go to that screen (this role's screens only)
//
// Ctrl+B (the side menu) is ManagerLayout's own; Esc, Tab and Enter are
// the browser's and the dialogs'. Nothing here fires while someone is
// typing in a field, or with Ctrl, Alt or ⌘ held.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { goToFor } from './shortcuts';

const GO_WINDOW_MS = 1500;

const typing = (target) => {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

// The first search box that is on screen.
const findSearch = () => [...document.querySelectorAll('input[type="search"], input[placeholder]')]
  .find((el) => (el.type === 'search' || /search|soek|khangela/i.test(el.placeholder)) && el.offsetParent !== null && !el.disabled);

export default function useKeyboardShortcuts(role, { onOpenShortcuts } = {}) {
  const navigate = useNavigate();
  const goUntil = useRef(0);
  // The latest callback, without re-binding the listener on every render.
  const open = useRef(onOpenShortcuts);
  useEffect(() => { open.current = onOpenShortcuts; }, [onOpenShortcuts]);

  useEffect(() => {
    if (!role || role === 'guest') return undefined;
    const routes = new Map(goToFor(role).map(([letter, path]) => [letter, path]));

    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (typing(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (Date.now() < goUntil.current) {
        goUntil.current = 0;
        const path = routes.get(key);
        if (path) { event.preventDefault(); navigate(path); }
        return;
      }
      if (key === 'g') { goUntil.current = Date.now() + GO_WINDOW_MS; return; }
      if (event.key === '?') { event.preventDefault(); open.current?.(); return; }
      if (key === '/') {
        const search = findSearch();
        if (search) { event.preventDefault(); search.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [role, navigate]);
}
