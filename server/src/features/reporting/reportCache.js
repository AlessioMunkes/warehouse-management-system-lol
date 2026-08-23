// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reportCache.js
//
// In-process TTL cache. Not Redis, and deliberately not lru-cache.
//
// Render's free tier sleeps on inactivity, so ANY in-process cache
// is cold on every wake — it cannot be a cross-session latency
// strategy, only a within-session one. At that job, against
// eighteen metrics and a handful of ranges, a Map with timestamps is
// the whole requirement and one less dependency at handover.
// ─────────────────────────────────────────────────────────────
import { CACHE_TTL } from './reportCatalog.js';

const store = new Map();
const MAX_ENTRIES = 300;

// Key from the NORMALISED spec, never the raw request or the user's
// question — two differently-worded questions resolving to the same
// spec should share an entry. Keys are sorted so filter ordering
// cannot produce two keys for one query. dateRange is null on
// snapshots, which is fine: it just means one key per snapshot spec.
export const cacheKey = (spec) => JSON.stringify({
  m: spec.metric,
  d: spec.dimension,
  f: Object.keys(spec.filters).sort().map((k) => [k, spec.filters[k]]),
  r: spec.dateRange ? [spec.dateRange.from, spec.dateRange.to] : null,
  l: spec.limit,
});

// Historic only once the range has fully ended. todayISO is passed
// in so the caller owns date resolution and tests can pin it.
export const ttlFor = (spec, todayISO) =>
  spec.dateRange && spec.dateRange.to < todayISO ? CACHE_TTL.HISTORIC : CACHE_TTL.LIVE;

export const get = (key) => {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { store.delete(key); return null; }
  // Refresh insertion order so eviction drops genuinely cold entries
  // rather than merely old ones.
  store.delete(key); store.set(key, hit);
  return hit.value;
};

export const set = (key, value, ttlMs) => {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

// Cheap and blunt on purpose: correctness beats a partial
// invalidation scheme nobody will maintain.
export const clear = () => store.clear();
export const size  = () => store.size;

export default { cacheKey, ttlFor, get, set, clear, size };
