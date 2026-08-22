// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reportCache.js
//
// In-process TTL cache. Not Redis, and deliberately not lru-cache.
//
// Render's free tier sleeps on inactivity, so ANY in-process cache
// is cold on every wake — it cannot be a cross-session latency
// strategy, only a within-session one. At that job, against six
// metrics and a handful of ranges, a Map with timestamps is the
// whole requirement, and it is one less dependency to explain to
// whoever maintains this after handover.
//
// The TTL split is by mutability, not by metric. A date range that
// ended before today is closed — the fortnightly cycle is done and
// those rows will not change — so it can be held for an hour. A
// range including today gets sixty seconds, because a manager who
// records a collection and re-asks must see it.
// ─────────────────────────────────────────────────────────────
import { CACHE_TTL } from './reportCatalog.js';

const store = new Map();

// Hard ceiling. Six metrics × dimensions × ranges will not approach
// this in practice; it exists so a scripted client cannot grow the
// map without bound on a 512 MB instance.
const MAX_ENTRIES = 200;

// Key from the NORMALISED spec, never the raw request or the user's
// question text — two differently-worded questions that resolve to
// the same spec should share a cache entry. Object.keys are sorted
// so filter ordering cannot produce two keys for one query.
export const cacheKey = (spec) => JSON.stringify({
  m: spec.metric,
  d: spec.dimension,
  f: Object.keys(spec.filters).sort().map((k) => [k, spec.filters[k]]),
  r: [spec.dateRange.from, spec.dateRange.to],
  l: spec.limit,
});

// A range is historic only once it has fully ended. `todayISO` is
// passed in rather than read here so the caller owns date
// resolution and tests can pin it.
export const ttlFor = (spec, todayISO) =>
  spec.dateRange.to < todayISO ? CACHE_TTL.HISTORIC : CACHE_TTL.LIVE;

export const get = (key) => {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  // Refresh insertion order so the eviction below drops genuinely
  // cold entries rather than merely old ones.
  store.delete(key);
  store.set(key, hit);
  return hit.value;
};

export const set = (key, value, ttlMs) => {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

// Called after any write that could change a reported number. Cheap
// and blunt on purpose: correctness beats a partial invalidation
// scheme nobody will maintain.
export const clear = () => store.clear();

export const size = () => store.size;

export default { cacheKey, ttlFor, get, set, clear, size };
