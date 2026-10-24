// ─────────────────────────────────────────────────────────────
// client/src/features/beneficiaries/beneficiaryLocation.js
//
// A centre's location on Beneficiaries, with no React in it: whether it
// has a pin, the location part of a form, and whether it changed. The
// location is saved apart from the rest of the centre
// (centreLocation.service.js), so the page only sends it when it moved.
// ─────────────────────────────────────────────────────────────

export const LOCATION_KEYS = ['address', 'suburb', 'lat', 'lng'];

export const hasPin = (v) => v?.lat !== null && v?.lat !== undefined && v?.lng !== null && v?.lng !== undefined;

const clean = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/** The location of a row or form, in the shape the location endpoint takes. */
export const locationOf = (v = {}) => ({
  address: clean(v.address),
  suburb: clean(v.suburb),
  lat: hasPin(v) ? Number(v.lat) : null,
  lng: hasPin(v) ? Number(v.lng) : null,
});

export const locationChanged = (before, after) => {
  const a = locationOf(before);
  const b = locationOf(after);
  return LOCATION_KEYS.some((k) => a[k] !== b[k]);
};

/** The centre's details without its location, for the beneficiary endpoint. */
export const withoutLocation = (payload) => Object.fromEntries(
  Object.entries(payload).filter(([k]) => !LOCATION_KEYS.includes(k)),
);

/** "12 Ncumo Road, Harare", or '' with neither. */
export const placeLine = (v) => [clean(v?.address), clean(v?.suburb)].filter(Boolean).join(', ');
