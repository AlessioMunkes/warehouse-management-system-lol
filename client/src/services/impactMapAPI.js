// ─────────────────────────────────────────────────────────────
// client/src/services/impactMapAPI.js
//
// The Impact map (managers) and Centre locations (admins). Mirrors
// impactMap.controller.js. The server already sends numbers, worked out
// in JavaScript, not NUMERIC strings.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPatch } from './api';

const query = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

/** { range: { from, to, today }, factor, centres } for a period; no dates is the last 90 days. */
export const getImpactMap = async ({ from, to } = {}) => (await apiGet(`/api/impact-map${query({ from, to })}`)).data;

/** Every centre with its address, suburb and pin. */
export const listCentreLocations = async () => (await apiGet('/api/centre-locations')).data ?? [];

/** { address, suburb, lat, lng }; null clears. Answers with the saved centre. */
export const setCentreLocation = async (id, body) => (await apiPatch(`/api/centre-locations/${id}`, body)).data;
