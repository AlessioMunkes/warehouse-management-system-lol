// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/useMapFrame.js
//
// The box the warehouse map is drawn in, both views.
//
// A FIXED SIZE. The map used to take its height from the drawing, so
// tilting the 3D view made it grow and shrink and pushed the page up and
// down mid-drag. Now the frame keeps one height (FRAME) and the drawing
// fits inside it; nothing on the page moves while the map turns.
//
// FULL SCREEN. Expand lays the map over the whole window for a proper
// look, Esc or the same button puts it back, and the page behind does
// not scroll while it is open. A fixed overlay rather than the browser's
// Fullscreen API, which the floor tablets' Safari does not offer.
//
// FOCUS WITHOUT A JUMP. The map takes focus when it is pressed (so the
// keys and scroll-to-zoom work), but the browser would scroll a focused
// element into view, which jolted the page at the start of every drag.
// grab() focuses it without scrolling and stops the browser's own
// drag behaviour (selecting text) on it.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';

export const FRAME = 'h-[clamp(320px,62vh,680px)]';
export const FRAME_FULL = 'fixed inset-0 z-50 h-dvh rounded-none bg-background p-2 sm:p-3';

export default function useMapFrame() {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false); };
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  return { expanded, toggle };
}

/** Focus the map without the browser scrolling it into view. */
export const grab = (e) => {
  const el = e.currentTarget;
  if (document.activeElement !== el) el.focus?.({ preventScroll: true });
};

/** On the map's mousedown: no native text selection or focus scroll. */
export const noNativeDrag = (e) => { if (e.button === 0) e.preventDefault(); };
