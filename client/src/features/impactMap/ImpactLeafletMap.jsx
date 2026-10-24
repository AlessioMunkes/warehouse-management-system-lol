// ─────────────────────────────────────────────────────────────
// client/src/features/impactMap/ImpactLeafletMap.jsx
//
// The centres on a street map: Leaflet (already in the app for the
// landing page's drop-off map) with OpenStreetMap's tiles and their
// required attribution. Each centre is a circle, sized by meals
// (impactScale.js: area in proportion), coloured by cohort, and grey
// when nothing reached it in the period. Clicking one opens its figures.
//
// The tiles come from openstreetmap.org every time: they are not stored
// on the device (the service worker caches only this site's own files,
// and OpenStreetMap's tile policy asks that tiles are not prefetched).
//
//   centres   the centres to draw, each with lat and lng
//   sizeOf    (centre) => the value its circle is sized by
//   toneOf    (centre) => a tone key in TONES below
//   popupOf   (centre) => [[label, value]] lines for its popup
//   focusId   a centre to fly to and open (from the list beside the map)
//
// The map is fitted to the centres whenever the set of them changes
// (a filter, a new period), not when the same centres are read again.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { radiusFor } from './impactScale';
import { TONES } from './impactView';

// Cape Town, for a map with no centres on it yet.
const CAPE_TOWN = [-33.97, 18.6];

const popupNode = (title, lines) => {
  const root = document.createElement('div');
  root.className = 'text-sm';
  const h = document.createElement('p');
  h.className = 'font-medium';
  // Leaflet spaces popup paragraphs far apart; these are lines of one card.
  h.style.margin = '0 0 4px';
  h.textContent = title;
  root.appendChild(h);
  for (const [label, value] of lines) {
    const p = document.createElement('p');
    p.className = 'text-xs';
    p.style.margin = '2px 0';
    p.textContent = `${label}: ${value}`;
    root.appendChild(p);
  }
  return root;
};

export default function ImpactLeafletMap({ centres, sizeOf, toneOf, popupOf, focusId = null, className }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef(new Map());
  const fittedRef = useRef('');

  useEffect(() => {
    const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    map.setView(CAPE_TOWN, 10);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Wheel zoom only once the map is clicked, so the page still scrolls.
    map.once('focus', () => map.scrollWheelZoom.enable());
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const largest = useMemo(() => centres.reduce((m, c) => Math.max(m, Number(sizeOf(c)) || 0), 0), [centres, sizeOf]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current = new Map();
    // Small circles on top of big ones, so every one can be clicked.
    const ordered = [...centres].sort((a, b) => (Number(sizeOf(b)) || 0) - (Number(sizeOf(a)) || 0));
    for (const c of ordered) {
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: radiusFor(sizeOf(c), largest),
        className: TONES[toneOf(c)] ?? TONES.other,
        weight: 1.5,
        fillOpacity: 0.45,
      });
      marker.bindPopup(() => popupNode(c.name, popupOf(c)));
      marker.bindTooltip(c.name, { direction: 'top' });
      marker.addTo(layer);
      markersRef.current.set(c.id, marker);
    }
    const key = centres.map((c) => c.id).sort((a, b) => a - b).join(',');
    if (key !== fittedRef.current) {
      fittedRef.current = key;
      if (centres.length > 0) {
        map.fitBounds(L.latLngBounds(centres.map((c) => [c.lat, c.lng])), { padding: [32, 32], maxZoom: 14 });
      }
    }
  }, [centres, sizeOf, toneOf, popupOf, largest]);

  useEffect(() => {
    const marker = focusId === null ? null : markersRef.current.get(focusId);
    if (!marker || !mapRef.current) return;
    mapRef.current.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 14));
    marker.openPopup();
  }, [focusId]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of centres"
      className={className ?? 'isolate z-0 h-[28rem] w-full overflow-hidden rounded-xl border sm:h-[34rem]'}
    />
  );
}
