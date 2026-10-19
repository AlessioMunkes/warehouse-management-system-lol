// ─────────────────────────────────────────────────────────────
// server/src/services/impactMap.service.js
//
// The manager's Impact map: every centre with its pin and, for a
// period, its dispatches, kilograms of food and meals enabled.
//
// Meals are kilograms times the kg_to_meals factor, the factor and the
// rounding "Meals enabled" uses (reporting.service.js), so a centre's
// meals here add up to what that report says for the same kilograms.
// With no factor set, the map still shows kilograms and says meals are
// not available, rather than refusing the whole screen.
//
// The period comes from features/impactMap/impactRange.js, measured in
// South African days from todayInSAST(). Each warehouse database
// answers for its own centres only (config/dbRouter.js).
//
// A built answer is kept for CACHE_MS per warehouse and period, and
// dropped when an admin moves a centre, so a manager clicking between
// filters does not rebuild it. Nothing here writes anything.
// ─────────────────────────────────────────────────────────────
import impactModel from '../repositories/impactMap.repository.js';
import reportingRepo from '../repositories/reporting.repository.js';
import { todayInSAST } from '../repositories/shelfLots.repository.js';
import { resolveRange } from '../features/impactMap/impactRange.js';
import { currentWarehouse } from '../config/warehouseContext.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const CACHE_MS = 60_000;
const cache = new Map();
const warehouse = () => currentWarehouse() ?? 'default';

/** Drops this warehouse's kept answers: a centre was moved. */
export const forgetImpactMap = () => {
  const prefix = `${warehouse()}|`;
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
};

const num = (v) => (v === null || v === undefined ? null : Number(v));

const getImpactMap = async (query = {}) => {
  const today = todayInSAST();
  const range = resolveRange({ from: query.from, to: query.to }, today);
  if (range.error) fail(400, range.error);

  const key = `${warehouse()}|${range.from}|${range.to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const [rows, factor] = await Promise.all([
    impactModel.listCentreImpact(range),
    reportingRepo.getFactor('kg_to_meals'),
  ]);

  const centres = rows.map((r) => {
    const kg = Number(r.kg) || 0;
    return {
      id: r.id,
      name: r.name,
      cohort: r.cohort,
      childCount: r.child_count ?? null,
      isActive: r.is_active,
      suburb: r.suburb ?? null,
      lat: num(r.latitude),
      lng: num(r.longitude),
      dispatches: Number(r.dispatches) || 0,
      // Kept to the gram so a total of many centres still matches the
      // report, which rounds once at the end.
      kg: Math.round(kg * 1000) / 1000,
      meals: factor ? Math.round(kg * factor.value) : null,
      lastCollected: r.last_collected ?? null,
    };
  });

  const value = {
    range: { ...range, today },
    factor: factor ? { value: factor.value, note: factor.source_note ?? null } : null,
    centres,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
};

// For tests: start from an empty cache.
export const clearImpactCache = () => cache.clear();

export default { getImpactMap, forgetImpactMap, clearImpactCache };
