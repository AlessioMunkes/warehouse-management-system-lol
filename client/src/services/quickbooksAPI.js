// ─────────────────────────────────────────────────────────────
// client/src/services/quickbooksAPI.js
//
// The QuickBooks connection, as the screens use it. Connecting is a
// full-page trip to Intuit and back (getConnectUrl), like the Gmail
// connection; everything else is an ordinary call.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, API_BASE } from './api';

// Where an admin is sent to sign in to QuickBooks.
export const getConnectUrl = () => `${API_BASE}/api/quickbooks/connect`;

export const getStatus = async () => (await apiGet('/api/quickbooks/status')).data;

export const disconnect = async () => (await apiPost('/api/quickbooks/disconnect', {})).data;

/** Where one purchase order stands with QuickBooks. `available` is false when QuickBooks is not connected. */
export const getOrderState = async (id) => (await apiGet(`/api/quickbooks/purchase-orders/${id}`)).data;

/** Send the order to QuickBooks, or send it again. */
export const sendOrder = async (id) => (await apiPost(`/api/quickbooks/purchase-orders/${id}/send`, {})).data;

export default { getConnectUrl, getStatus, disconnect, getOrderState, sendOrder };
