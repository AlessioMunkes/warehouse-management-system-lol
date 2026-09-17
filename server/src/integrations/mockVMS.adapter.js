// ─────────────────────────────────────────────────────────────
// server/src/integrations/mockVMS.adapter.js
//
// Code-only simulator for the external Volunteer Management System.
// No DB tables, no HTTP, no persistence — it only simulates the
// transport boundary so Phase 4 sync logic can be exercised.
//
// Behaviours simulated:
// - successful publish (deterministic fake external IDs)
// - VMS unavailable / failure
// - retry success (fail N times, then succeed)
// - optional forced failure mode for tests
// ─────────────────────────────────────────────────────────────

let forceFail = false;
let failNextCount = 0;

const fail = (message) => {
  const err = new Error(message);
  err.code = 'VMS_UNAVAILABLE';
  throw err;
};

// Deterministic fake external ID — same input always yields the
// same output, so retries and assertions are stable.
const buildExternalId = (data = {}) => {
  const entityType = data.entityType ?? data.entity_type ?? 'event_booking';
  const entityId = data.entityId ?? data.entity_id ?? data.eventId ?? data.event_id ?? 'unknown';
  return `VMS-${String(entityType).toUpperCase()}-${String(entityId)}`;
};

const publishEventBooking = async (data) => {
  if (!data || typeof data !== 'object') fail('VMS publish requires a payload.');
  // Per-call opt-in failure (useful for targeted tests).
  if (data.forceFail === true) fail('VMS unavailable (forced failure).');
  if (forceFail) fail('VMS unavailable (forced failure).');
  if (failNextCount > 0) {
    failNextCount -= 1;
    fail('VMS unavailable (transient failure).');
  }
  return {
    externalId: buildExternalId(data),
    publishedAt: new Date().toISOString(),
  };
};

// ── Test controls (code-only, no persistence) ──────────────────
const setForceFail = (value) => {
  forceFail = value === true;
};

const failNext = (count = 1) => {
  failNextCount = Number(count) > 0 ? Number(count) : 0;
};

const resetMockVMS = () => {
  forceFail = false;
  failNextCount = 0;
};

export default {
  publishEventBooking,
  setForceFail,
  failNext,
  resetMockVMS,
};

export { publishEventBooking, setForceFail, failNext, resetMockVMS };
