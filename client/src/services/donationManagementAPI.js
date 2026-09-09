// Thin authenticated-fetch wrapper for the Donation Management feature.
// Mirrors the donationClassificationAPI pattern: pages call a thin service
// that handles the fetch, JSON parsing, credentials and server error
// conversion — never raw fetch in the component.
//
// The flagged-items source of truth is GET .../admin/pending-classifications
// (intake-linked rows enriched with donor/category/description/unit), and
// every resolution — intake Accept/Reject and the legacy finalize-style
// resolve — goes through the single unified endpoint
//   POST /api/donations/pending/:flagId/resolve   (D1/D2).
//
// The Reconciliation tab reuses getPendingDonations(['commit_failed',
// 'commit_incomplete']) rather than the narrower GET /pending/reconciliation
// endpoint, because that endpoint returns bare pending_donations rows with
// no .items/.item_counts — getPendingDonations already returns the full
// shape needed to show per-item resolved counts on commit_incomplete rows,
// with no backend change required.

// Same category enum as the classification UIs; reused here for the
// accept select and the standalone-item category select.
export { PRODUCT_CLASSIFICATION_CATEGORIES } from './donationClassificationAPI';

// The Pending Donations tab scope (D4). The tab always pulls these four
// statuses in one call: the two actively-working states plus the two
// failure states, so failure donations can show a cross-link into
// Reconciliation alongside the in-progress ones in the same view.
export const PENDING_DONATION_STATUSES = ['awaiting_resolution', 'committing', 'commit_failed', 'commit_incomplete'];

// The Reconciliation tab's scope: only the two failure states.
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
  // All warehouse_manager_flags rows with status='pending_classification',
  // enriched so the client can label each source (donation-linked vs standalone).
  async getFlaggedItems() {
    const response = await fetch(`${API_BASE}/api/donations/admin/pending-classifications`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await parseResponse(response);
    return Array.isArray(body.data) ? body.data : [];
  },

  // Whole pending_donations records with their item lists (used by both
  // the Pending Donations tab and the Reconciliation tab). statuses may be
  // an array or a comma-separated string; when omitted it defaults to the
  // D4 tab scope.
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

  // Single unified resolution endpoint (D1/D2). One call handles both
  // intake-linked flags (accept/reject) and legacy flags (finalize-style
  // fields), so the client never needs to know which server branch runs.
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

  // Retry a stuck commit (commit_failed / commit_incomplete only — the
  // service itself enforces that status precondition and returns a 409
  // if called on anything else). This is the only place in the whole
  // feature that triggers a retry (D3/D4) — Pending Donations tab only
  // cross-links here.
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

  // D6/Q2 — the dashboard tile badge is ONE combined, DEDUPLICATED number:
  // (unlinked/legacy flags awaiting resolution) + (pending donations in
  // any of the four attention statuses). This is intentional deduplication,
  // NOT a raw sum of every row in every table: intake-linked flags are
  // deliberately EXCLUDED from the flag term because each of them already
  // belongs to a pending donation counted by the second term — counting
  // them again would inflate the badge (e.g. one pending donation blocked
  // by 3 flagged items counts as 1, not 4). Do not "fix" this back to a
  // literal count without re-reading D6/Q2.
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
};

export default donationManagementAPI;