// ─────────────────────────────────────────────────────────────
// server/src/services/vmsIntegration.service.js
//
// Thin technical boundary to the external VMS.
// Exposes ONLY publishEventBooking(data).
// Calls the configured adapter — no repositories, no
// transactions, no sync persistence, no HTTP, no RBAC.
// ─────────────────────────────────────────────────────────────
import mockVMSAdapter from '../integrations/mockVMS.adapter.js';

let adapter = mockVMSAdapter;

// Test seam: swap the transport without touching callers.
const setAdapter = (nextAdapter) => {
  if (!nextAdapter || typeof nextAdapter.publishEventBooking !== 'function') {
    throw new Error('VMS adapter must expose publishEventBooking(data).');
  }
  adapter = nextAdapter;
};

const getAdapter = () => adapter;

const publishEventBooking = async (data) => adapter.publishEventBooking(data);

export default {
  publishEventBooking,
  setAdapter,
  getAdapter,
};

export { publishEventBooking, setAdapter, getAdapter };
