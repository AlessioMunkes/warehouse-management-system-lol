// -------------------------------------------------------------
// client/src/services/gmailAPI.js
//
// Thin client for the Gmail OAuth connection endpoints.
// All calls carry the httpOnly session cookie (credentials: 'include'
// inside apiGet/apiPost) and the server enforces admin-only access.
// -------------------------------------------------------------
import { apiGet, apiPost, API_BASE } from './api';

const getStatus = async () => {
  const response = await apiGet('/api/gmail/status');
  return response.data;
};

const disconnect = async () => {
  const response = await apiPost('/api/gmail/disconnect', {});
  return response.data;
};

const sendTestEmail = async ({ to }) => {
  const response = await apiPost('/api/gmail/test-email', {
    to,
    subject: 'Donation email test',
    text: 'This is a test email from the donation email integration settings.',
  });
  return response.data;
};

const saveDisplayName = async (displayName) => {
  const response = await apiPost('/api/gmail/save-display-name', { displayName });
  return response.data;
};

// Not fetched — the browser navigates to it directly for the OAuth flow.
const getConnectUrl = () => `${API_BASE}/api/gmail/connect`;

export default {
  getStatus,
  disconnect,
  sendTestEmail,
  saveDisplayName,
  getConnectUrl,
};
