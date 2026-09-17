// ─────────────────────────────────────────────────────────────
// client/src/services/assistantAPI.js
//
// The in-app help assistant's three calls. Same shape as
// reportingAPI.js.
//
// Only askAssistant costs anything. The catalog and a topic by id
// are catalog reads, which is why the suggestion chips and the
// "related" links go through fetchTopic rather than asking the model
// a question it already knows the answer to.
//
// These unwrap the { success, data } envelope, unlike reportingAPI,
// so the hook above reads answers rather than envelopes.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';

const unwrap = (res) => res?.data ?? res;

/** Topics and per-screen suggestions for the signed-in role. */
export const fetchAssistantCatalog = () =>
  apiGet('/api/assistant/catalog').then(unwrap);

/** One topic, by id. No model call. */
export const fetchTopic = (id) =>
  apiGet(`/api/assistant/topic/${encodeURIComponent(id)}`).then(unwrap);

/**
 * Ask a question. `screen` is the id of the screen they are on and
 * is context, not a filter — it tips a vague question toward what
 * they are looking at.
 *
 * Resolves to one of:
 *   { type:'topic',       topic }
 *   { type:'navigate',    screen }
 *   { type:'clarify',     question, options }
 *   { type:'not_covered', closest }
 */
export const askAssistant = (question, screen) =>
  apiPost('/api/assistant/ask', { question, screen }).then(unwrap);

export default { fetchAssistantCatalog, fetchTopic, askAssistant };
