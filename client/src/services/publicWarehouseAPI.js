// ─────────────────────────────────────────────────────────────
// src/services/publicWarehouseAPI.js
//
// The warehouses a person can choose from before signing in (the guest
// sign-in page). No login needed.
// ─────────────────────────────────────────────────────────────
import { apiGet } from './api';

// GET /api/public/warehouses → { multiWarehouse, warehouses: [{ code, name }] }
export const listPublicWarehouses = () => apiGet('/api/public/warehouses');

export default { listPublicWarehouses };
