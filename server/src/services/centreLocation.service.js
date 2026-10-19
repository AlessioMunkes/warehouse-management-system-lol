// ─────────────────────────────────────────────────────────────
// server/src/services/centreLocation.service.js
//
// The admin's Centre locations: where each beneficiary centre is, for
// the manager's Impact map. An admin types the address and suburb and
// places the pin; nothing else about a centre is changed here (that is
// the manager's Beneficiaries screen).
//
// A pin is both coordinates or neither, and inside South Africa: the
// database checks the same (migration 050). Saving here marks the pin
// as placed by hand.
// ─────────────────────────────────────────────────────────────
import locationModel from '../repositories/centreLocation.repository.js';
import { forgetImpactMap } from './impactMap.service.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

export const BOUNDS = Object.freeze({ lat: [-35, -22], lng: [16, 33] });
const MAX_ADDRESS = 200;
const MAX_SUBURB = 80;

const text = (v, max, label) => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') fail(400, `Enter the ${label} as text.`);
  const s = v.trim();
  if (s.length > max) fail(400, `Keep the ${label} to ${max} characters.`);
  return s || null;
};

const coordinate = (v, [min, max], label) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `The ${label} is outside South Africa. Place the pin again.`);
  return Math.round(n * 1e6) / 1e6;
};

const toLocation = (r) => ({
  id: r.id,
  name: r.name,
  cohort: r.cohort,
  isActive: r.is_active,
  childCount: r.child_count ?? null,
  address: r.address ?? null,
  suburb: r.suburb ?? null,
  lat: r.latitude === null || r.latitude === undefined ? null : Number(r.latitude),
  lng: r.longitude === null || r.longitude === undefined ? null : Number(r.longitude),
  source: r.location_source ?? null,
  note: r.location_note ?? null,
  updatedAt: r.location_updated_at ?? null,
  updatedByName: r.location_updated_by_name ?? null,
});

const listLocations = async () => (await locationModel.listLocations()).map(toLocation);

const setLocation = async (id, body = {}, userId) => {
  const address = text(body.address, MAX_ADDRESS, 'address');
  const suburb = text(body.suburb, MAX_SUBURB, 'suburb');
  const latitude = coordinate(body.lat, BOUNDS.lat, 'latitude');
  const longitude = coordinate(body.lng, BOUNDS.lng, 'longitude');
  if ((latitude === null) !== (longitude === null)) fail(400, 'Place the pin on the map, or clear it.');

  const before = await locationModel.getLocation(id);
  if (!before) fail(404, 'That centre was not found.');

  const pinMoved = Number(before.latitude) !== latitude || Number(before.longitude) !== longitude;
  // An unchanged pin keeps where it came from; a moved or new one was
  // placed by hand. No pin, no source.
  const source = latitude === null ? null : (pinMoved ? 'manual' : (before.location_source ?? 'manual'));
  const note = pinMoved ? null : (before.location_note ?? null);

  await locationModel.setLocation(id, { address, suburb, latitude, longitude, source, note, userId });
  forgetImpactMap();
  return toLocation(await locationModel.getLocation(id));
};

export default { listLocations, setLocation };
