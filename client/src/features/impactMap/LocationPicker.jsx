// ─────────────────────────────────────────────────────────────
// client/src/features/impactMap/LocationPicker.jsx
//
// Where a centre is, chosen on a map: click the map to drop the pin,
// drag it to move it. OpenStreetMap tiles, as on the Impact map.
//
//   lat, lng   the pin, or null for none yet
//   onChange   ({ lat, lng }) => void
//   label      what the map is for, for a screen reader
//
// A pin set from outside (the address lookup, Clear) moves the pin and
// the view to it.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const CAPE_TOWN = [-33.97, 18.6];
const PIN = 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z';

const pinIcon = () => L.divIcon({
  className: '!border-0 !bg-transparent',
  html: `<svg width="30" height="30" viewBox="0 0 24 24" class="fill-brand stroke-surface" stroke-width="1"><path d="${PIN}"/></svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

const round6 = (n) => Math.round(n * 1e6) / 1e6;

export default function LocationPicker({ lat, lng, onChange, label = 'Place the pin' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const changeRef = useRef(onChange);

  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    map.setView(CAPE_TOWN, 10);
    map.on('click', (e) => changeRef.current({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }));
    map.once('focus', () => map.scrollWheelZoom.enable());
    mapRef.current = map;
    // A panel slides in: measure again once it has its width.
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat === null || lng === null || lat === undefined || lng === undefined) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const first = !markerRef.current;
    if (first) {
      markerRef.current = L.marker([lat, lng], { icon: pinIcon(), draggable: true, keyboard: true, title: 'Centre location' })
        .on('dragend', (e) => {
          const p = e.target.getLatLng();
          changeRef.current({ lat: round6(p.lat), lng: round6(p.lng) });
        })
        .addTo(map);
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
    // A pin the panel opened with, or one placed from outside the view: go to it.
    if (first || !map.getBounds().pad(-0.1).contains([lat, lng])) map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={label}
      className="isolate z-0 h-64 w-full cursor-crosshair overflow-hidden rounded-lg border"
    />
  );
}
