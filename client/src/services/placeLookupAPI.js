// ─────────────────────────────────────────────────────────────
// src/services/placeLookupAPI.js
//
// "Find on map" when editing a centre on Beneficiaries: one lookup of a
// typed address on OpenStreetMap's Nominatim, to put the pin near it for
// the manager to check. Goes straight to Nominatim; our server is not involved.
//
// Nominatim's policy allows a person's occasional search like this, not
// autocomplete or bulk use, so it runs only when someone presses Find
// (never as they type), and the bulk work is the one-off
// server/scripts/locateEcdCentres.mjs. Mapbox (addressSearchAPI.js) is
// not used here: its results may not be stored, and this stores the pin.
// ─────────────────────────────────────────────────────────────

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** { lat, lng, label } for the best South African match, or null. */
export const findPlace = async (query, { signal } = {}) => {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', countrycodes: 'za' });
  const response = await fetch(`${NOMINATIM}?${params.toString()}`, { signal, headers: { 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error('The map search did not answer. Place the pin by clicking the map.');
  const [hit] = await response.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name } : null;
};

export default { findPlace };
