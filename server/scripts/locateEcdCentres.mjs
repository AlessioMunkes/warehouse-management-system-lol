#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// server/scripts/locateEcdCentres.mjs
//
// One-off: puts the beneficiary centres on the Impact map (migration 050).
// Run from the server folder:
//
//   node --env-file-if-exists=.env.local scripts/locateEcdCentres.mjs --dry-run
//   node --env-file-if-exists=.env.local scripts/locateEcdCentres.mjs
//   node --env-file-if-exists=.env.local scripts/locateEcdCentres.mjs --geocode-missing
//
// WHAT IT DOES
//   1. Reads scripts/data/ecdLocations.json: centres whose address was
//      found by research, each with where it came from (`note`) and how
//      exact the pin is (`precision`):
//        exact    the building, as mapped on OpenStreetMap
//        street   the street address, looked up
//        suburb   only the suburb is known; the pin is its middle
//      It matches each by name to a centre in this warehouse's database
//      and writes the address, suburb and pin.
//   2. With --geocode-missing, also looks up every centre that has an
//      address or suburb but no pin (one an admin typed without placing
//      it), using OpenStreetMap's Nominatim.
//
// NEVER OVER AN ADMIN. A centre whose pin an admin placed on the Centre
// locations screen (location_source 'manual') is left alone, so this is
// safe to run again after admins have corrected pins.
//
// NOMINATIM'S RULES (operations.osmfoundation.org/policies/nominatim):
// one request a second at most, a User-Agent naming the application and
// a contact, results kept rather than looked up again. Lookups happen
// only here, never while someone uses the app.
//
// Every warehouse database in WAREHOUSE_DB_URLS is done in turn (or the
// one DATABASE_URL); a centre is matched only in its own warehouse.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { default: locationModel } = await import('../src/repositories/centreLocation.repository.js');
const { default: pool } = await import('../src/config/db.js');
const { runInWarehouse } = await import('../src/config/warehouseContext.js');
const { warehouseCodes } = await import('../src/config/warehouses.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, 'data', 'ecdLocations.json');
const DRY = process.argv.includes('--dry-run');
const GEOCODE_MISSING = process.argv.includes('--geocode-missing');

const UA = `LadlesOfLoveWMS/1.0 (ECD centre locations; ${process.env.NOMINATIM_CONTACT || 'ops@ladlesoflove.org.za'})`;
const VIEWBOX = '18.30,-33.45,19.00,-34.40'; // the Cape Town metro, as a preference
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastLookup = 0;

const geocode = async (query) => {
  const wait = 1100 - (Date.now() - lastLookup);
  if (wait > 0) await sleep(wait);
  lastLookup = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=za&viewbox=${VIEWBOX}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
  const [hit] = await res.json();
  return hit ? { lat: Number(Number(hit.lat).toFixed(6)), lng: Number(Number(hit.lon).toFixed(6)) } : null;
};

const PRECISION = {
  exact: 'Pin: the building, as mapped on OpenStreetMap.',
  street: 'Pin: the street address, looked up.',
  suburb: 'Pin: the middle of the suburb, not the building.',
};

const key = (name) => String(name ?? '').trim().toLowerCase();

const locateOne = async (label) => {
  const centres = await locationModel.listLocations();
  const byName = new Map(centres.map((c) => [key(c.name), c]));
  const entries = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const counts = { set: 0, manual: 0, missing: 0, geocoded: 0, notFound: 0 };

  for (const e of entries) {
    const centre = byName.get(key(e.name));
    if (!centre) { counts.missing += 1; continue; }
    if (centre.location_source === 'manual') { counts.manual += 1; continue; }
    if (e.lat === null || e.lat === undefined) continue;
    const source = e.precision === 'exact' ? 'imported' : 'geocoded';
    const note = [e.note, PRECISION[e.precision]].filter(Boolean).join(' ');
    console.log(`  ${DRY ? 'would set' : 'set'}  ${centre.name}: ${[e.address, e.suburb].filter(Boolean).join(', ') || '-'} (${e.lat}, ${e.lng}) ${e.precision}`);
    if (!DRY) {
      await locationModel.setLocation(centre.id, {
        address: e.address ?? null, suburb: e.suburb ?? null, latitude: e.lat, longitude: e.lng, source, note, userId: null,
      });
    }
    counts.set += 1;
  }

  if (GEOCODE_MISSING) {
    const fresh = await locationModel.listLocations();
    for (const c of fresh.filter((x) => x.latitude === null && (x.address || x.suburb) && x.location_source !== 'manual')) {
      const query = [c.address, c.suburb, 'Cape Town'].filter(Boolean).join(', ');
      const pin = await geocode(query);
      if (!pin) { counts.notFound += 1; console.log(`  not found  ${c.name}: ${query}`); continue; }
      console.log(`  ${DRY ? 'would geocode' : 'geocoded'}  ${c.name}: ${query} (${pin.lat}, ${pin.lng})`);
      if (!DRY) {
        await locationModel.setLocation(c.id, {
          address: c.address, suburb: c.suburb, latitude: pin.lat, longitude: pin.lng,
          source: 'geocoded', note: `Looked up from "${query}" on OpenStreetMap Nominatim. Check the pin.`, userId: null,
        });
      }
      counts.geocoded += 1;
    }
  }

  console.log(`[${label}] ${counts.set} placed, ${counts.geocoded} geocoded, ${counts.manual} left to the admin's pin, `
    + `${counts.missing} in the data file but not in this warehouse, ${counts.notFound} not found.`);
};

try {
  const codes = warehouseCodes();
  if (codes.length === 0) await locateOne('default');
  for (const code of codes) await runInWarehouse(code, () => locateOne(code));
  if (DRY) console.log('Dry run: nothing was changed.');
} finally {
  await pool.end?.();
}
