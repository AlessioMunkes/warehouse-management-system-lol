// ─────────────────────────────────────────────────────────────
// client/src/services/settingsAPI.js
//
// The admin Settings screen's store: /api/settings, the values that
// used to be constants (features/settings on the server).
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPatch } from './api';

// [{ key, section, label, help, default, min, max, unit, value, isDefault }]
export const listSettings = async () => (await apiGet('/api/settings')).data ?? [];

// { key: value, … } — saved together; returns the updated list.
export const updateSettings = async (changes) => (await apiPatch('/api/settings', changes)).data ?? [];

/** Every outside service, checked now: { checkedAt, connections: [{ id, name, status, summary, detail, fix }] } */
export const checkConnections = async () => (await apiGet('/api/settings/connections')).data;

export default { listSettings, updateSettings, checkConnections };
