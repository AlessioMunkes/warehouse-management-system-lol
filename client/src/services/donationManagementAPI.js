// Thin authenticated-fetch wrapper for the Donation Management feature.
// Keep this limited to deployed backend contracts; frontend-only placeholder
// tabs should not call future Section 18A endpoints before they exist.

export { PRODUCT_CLASSIFICATION_CATEGORIES } from './donationClassificationAPI';

export const PENDING_DONATION_STATUSES = ['awaiting_resolution', 'committing', 'commit_failed', 'commit_incomplete'];
export const RECONCILIATION_STATUSES = ['commit_failed', 'commit_incomplete'];

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : '');

const parseResponse = async (response) => {
  let payload;

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return payload;
};

const donationManagementAPI = {
  async getFlaggedItems() {
    const response = await fetch(`${API_BASE}/api/donations/admin/pending-classifications`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return Array.isArray(body.data) ? body.data : [];
  },

  async getPendingDonations(statuses = PENDING_DONATION_STATUSES) {
    const joined = (Array.isArray(statuses) ? statuses : String(statuses).split(','))
      .filter(Boolean)
      .join(',');
    const query = joined ? `?statuses=${encodeURIComponent(joined)}` : '';
    const response = await fetch(`${API_BASE}/api/donations/pending${query}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return Array.isArray(body.data) ? body.data : [];
  },

  async resolveFlag(flagId, payload) {
    const response = await fetch(`${API_BASE}/api/donations/pending/flags/${encodeURIComponent(flagId)}/resolve`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await parseResponse(response);
    return body.data;
  },

  async retryCommit(pendingDonationId) {
    const response = await fetch(
      `${API_BASE}/api/donations/pending/${encodeURIComponent(pendingDonationId)}/retry-commit`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const body = await parseResponse(response);
    return body.data;
  },

  async getAttentionCounts() {
    const [flags, pendingDonations] = await Promise.all([
      this.getFlaggedItems(),
      this.getPendingDonations(PENDING_DONATION_STATUSES),
    ]);

    const legacyFlagCount = flags.filter((flag) => flag.pending_donation_id == null).length;
    const pendingDonationCount = pendingDonations.length;

    return {
      legacyFlagCount,
      pendingDonationCount,
      total: legacyFlagCount + pendingDonationCount,
    };
  },

  async getSection18AQueue() {
    const response = await fetch(`${API_BASE}/api/donations/section-18a`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return Array.isArray(body.data) ? body.data : [];
  },

  async getEmailHistory() {
    const response = await fetch(`${API_BASE}/api/donations/section-18a/emails`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return Array.isArray(body.data) ? body.data : [];
  },

  async resendEmail(emailId) {
    const response = await fetch(`${API_BASE}/api/donations/section-18a/emails/${encodeURIComponent(emailId)}/resend`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return body.data;
  },

  async getDonationById(id) {
    const response = await fetch(`${API_BASE}/api/donations/${encodeURIComponent(id)}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return body.data ?? null;
  },

  downloadCertificate(donationId) {
    window.open(
      `${API_BASE}/api/donations/${encodeURIComponent(donationId)}/section-18a/certificate`,
      '_blank',
      'noopener'
    );
  },
};

export default donationManagementAPI;
