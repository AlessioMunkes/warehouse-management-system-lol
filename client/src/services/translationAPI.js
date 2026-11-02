// ─────────────────────────────────────────────────────────────
// client/src/services/translationAPI.js
//
// Settings → Translations: an admin's own wording for the floor and
// volunteer screens (server: translation.routes.js).
// ─────────────────────────────────────────────────────────────
import { apiDelete, apiGet, apiPut } from './api';

// { key: { af: {…}, xh: {…} }, phrase: { af: {…}, xh: {…} } }
export const getOverrides = async () => (await apiGet('/api/translations')).data;

// { language, kind: 'key' | 'phrase', source, text, placeholders }
export const saveOverride = async (change) => (await apiPut('/api/translations', change)).data;

export const resetOverride = async ({ language, kind, source }) => {
  const q = new URLSearchParams({ language, kind, source });
  return (await apiDelete(`/api/translations?${q}`)).data;
};

export default { getOverrides, saveOverride, resetOverride };
