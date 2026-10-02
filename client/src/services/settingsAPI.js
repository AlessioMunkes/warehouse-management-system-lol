// ─────────────────────────────────────────────────────────────
// client/src/services/settingsAPI.js
//
// The admin Settings screen's two stores:
//   /api/settings              — values that used to be constants
//                                (features/settings on the server)
//   /api/certificate-settings  — the organisation details printed on
//                                Section 18A certificates
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPatch, apiPost, apiPut } from './api';

// [{ key, section, label, help, default, min, max, unit, value, isDefault }]
export const listSettings = async () => (await apiGet('/api/settings')).data ?? [];

// { key: value, … } — saved together; returns the updated list.
export const updateSettings = async (changes) => (await apiPatch('/api/settings', changes)).data ?? [];

// null until someone has saved them once (the server answers 404).
export const getCertificateSettings = async () => {
  try {
    return (await apiGet('/api/certificate-settings')).data ?? null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
};

// Creates them the first time, updates them after.
export const saveCertificateSettings = async (values, { exists }) => {
  const body = exists
    ? await apiPut('/api/certificate-settings', values)
    : await apiPost('/api/certificate-settings', values);
  return body.data ?? null;
};

export default { listSettings, updateSettings, getCertificateSettings, saveCertificateSettings };
