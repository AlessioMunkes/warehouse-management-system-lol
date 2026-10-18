// ─────────────────────────────────────────────────────────────
// src/services/addressSearchAPI.js
//
// Address suggestions from Mapbox, for typing an event's address. Goes
// straight to Mapbox with the public, domain-restricted token
// (VITE_MAPBOX_PUBLIC_TOKEN); our server is not involved.
// ─────────────────────────────────────────────────────────────

const MAPBOX_SEARCH_URL = 'https://api.mapbox.com/search/geocode/v6/forward';

/** False when no token is set: the address is then typed by hand. */
export const addressSearchAvailable = () => Boolean(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN);

/**
 * Up to five South African matches, as Mapbox's `features`. Throws on a
 * failed search; an aborted one throws the AbortError for the caller to
 * ignore.
 */
export const searchAddresses = async (query, { signal } = {}) => {
  const params = new URLSearchParams({
    q: query,
    country: 'ZA',
    limit: '5',
    access_token: import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN,
  });
  const response = await fetch(`${MAPBOX_SEARCH_URL}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Address search failed.');
  const body = await response.json();
  return body.features;
};

export default { addressSearchAvailable, searchAddresses };
