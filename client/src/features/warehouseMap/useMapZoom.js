// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/useMapZoom.js
//
// Zooming and moving round the warehouse map, both views. The view
// starts fitted to the drawn plan (`fit`, in SVG units); zoom k is how
// much closer than that (1 = fitted), and dx, dy how far the middle has
// moved, in SVG units.
//
//   scroll        zooms towards the pointer, once the map has been
//                 clicked (has focus) or with Ctrl held, so scrolling
//                 down the page never gets stuck in the map
//   pinch         two fingers zoom on a touch screen
//   drag          moves the plan when `dragPans` (the top view); in 3D a
//                 drag turns the view and Shift-drag, or the middle
//                 button, moves it
//   + - 0         zoom in, zoom out, fit the plan (from the keyboard)
//
// The pointer handlers answer whether they used the event, so the 3D
// view can turn the floor with whatever the zoom did not take.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const ZOOM_RANGE = Object.freeze({ min: 0.8, max: 6 });
export const ZOOM_STEP = 1.4;
const WHEEL_STEP = 1.0015; // per pixel of wheel

const clampK = (k) => Math.min(Math.max(k, ZOOM_RANGE.min), ZOOM_RANGE.max);

/** The box on screen for a fit and a zoom. */
export const zoomedBox = (fit, { k, dx, dy }) => {
  const w = fit.w / k;
  const h = fit.h / k;
  return { x: fit.x + fit.w / 2 + dx - w / 2, y: fit.y + fit.h / 2 + dy - h / 2, w, h };
};

/** The zoom after zooming by `factor` about a point (SVG units): the point stays put. */
export const zoomAbout = (zoom, fit, point, factor) => {
  const k = clampK(zoom.k * factor);
  const f = k / zoom.k;
  const cx = fit.x + fit.w / 2 + zoom.dx;
  const cy = fit.y + fit.h / 2 + zoom.dy;
  const p = point ?? { x: cx, y: cy };
  const ncx = p.x + (cx - p.x) / f;
  const ncy = p.y + (cy - p.y) / f;
  return keepNear(fit, { k, dx: ncx - (fit.x + fit.w / 2), dy: ncy - (fit.y + fit.h / 2) });
};

// The middle never wanders off the plan.
const keepNear = (fit, zoom) => ({
  ...zoom,
  dx: Math.min(Math.max(zoom.dx, -fit.w / 2), fit.w / 2),
  dy: Math.min(Math.max(zoom.dy, -fit.h / 2), fit.h / 2),
});

export const FITTED = Object.freeze({ k: 1, dx: 0, dy: 0 });

export default function useMapZoom({ fit, svgRef, dragPans = false }) {
  const [zoom, setZoom] = useState(FITTED);
  const [hint, setHint] = useState(false);
  const zoomRef = useRef(zoom);
  const fitRef = useRef(fit);
  const pointers = useRef(new Map());
  const gesture = useRef(null); // { kind: 'pan' | 'pinch', ... }
  const hintTimer = useRef(0);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { fitRef.current = fit; }, [fit]);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  const box = useMemo(() => zoomedBox(fit, zoom), [fit, zoom]);
  const viewBox = `${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`;

  // A point on screen in SVG units.
  const toSvg = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, [svgRef]);

  // SVG units per screen pixel, for a drag.
  const unitsPerPx = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect?.();
    const b = zoomedBox(fitRef.current, zoomRef.current);
    return rect?.width ? b.w / rect.width : 1;
  }, [svgRef]);

  const zoomBy = useCallback((factor, client = null) => {
    const point = client ? toSvg(client.x, client.y) : null;
    setZoom((z) => zoomAbout(z, fitRef.current, point, factor));
  }, [toSvg]);
  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);
  const fitPlan = useCallback(() => setZoom(FITTED), []);

  // Scroll to zoom: a native listener, since React's wheel listener is
  // passive and could not stop the page scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e) => {
      const engaged = e.ctrlKey || document.activeElement === svg;
      if (!engaged) {
        setHint(true);
        clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(() => setHint(false), 1600);
        return;
      }
      e.preventDefault();
      setHint(false);
      const point = toSvg(e.clientX, e.clientY);
      setZoom((z) => zoomAbout(z, fitRef.current, point, WHEEL_STEP ** -e.deltaY));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef, toSvg]);

  /** On pointer down: true when a pan or pinch begins and the event is the zoom's. */
  const onPointerDown = useCallback((e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), from: zoomRef.current };
      return true;
    }
    if (dragPans || e.shiftKey || e.button === 1) {
      // The pointer is only held once the drag moves, so a plain click on
      // an area still reaches it.
      gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY, from: zoomRef.current, moved: false };
      return true;
    }
    return false;
  }, [dragPans]);

  /** On pointer move: true when it moved the zoom. */
  const onPointerMove = useCallback((e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return false;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.dist > 0) {
        const mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
        setZoom(zoomAbout(g.from, fitRef.current, mid, dist / g.dist));
      }
      return true;
    }
    if (g.kind === 'pan') {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 4) return true;
      if (!g.moved) e.currentTarget.setPointerCapture?.(e.pointerId);
      g.moved = true;
      const u = unitsPerPx();
      setZoom(keepNear(fitRef.current, { ...g.from, dx: g.from.dx - dx * u, dy: g.from.dy - dy * u }));
      return true;
    }
    return false;
  }, [toSvg, unitsPerPx]);

  /** On pointer up: true when it ended a pan that moved (so it is not a click). */
  const onPointerUp = useCallback((e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size < 2 && g?.kind === 'pinch') gesture.current = null;
    if (g?.kind === 'pan') { gesture.current = null; return g.moved; }
    return g?.kind === 'pinch';
  }, []);

  /** Keyboard: true when the key was a zoom key. */
  const onKeyDown = useCallback((e) => {
    if (e.key === '+' || e.key === '=') { zoomIn(); return true; }
    if (e.key === '-' || e.key === '_') { zoomOut(); return true; }
    if (e.key === '0') { fitPlan(); return true; }
    return false;
  }, [zoomIn, zoomOut, fitPlan]);

  return {
    zoom, viewBox, hint, zoomIn, zoomOut, fitPlan,
    onPointerDown, onPointerMove, onPointerUp, onKeyDown,
    isPinching: () => gesture.current?.kind === 'pinch',
  };
}
