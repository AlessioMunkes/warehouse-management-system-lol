// ─────────────────────────────────────────────────────────────
// server/src/services/pendingDonationRead.service.js
//
// The read side of pending donations: the Donation Management list, the
// reconciliation queue, one donation, and a worker's own History. Kept
// apart from pendingDonation.service.js, which holds the writes and
// their transactions, so the controller never reaches a repository.
// ─────────────────────────────────────────────────────────────
import pendingDonationRepository from '../repositories/pendingDonation.repository.js';

// Saves that failed part way and wait for someone to retry them.
const RECONCILIATION_STATUSES = ['commit_failed', 'commit_incomplete'];

// How far back each History range reaches, in days, counted in South
// African time so "today" starts at local midnight.
export const MINE_RANGE_DAYS = { today: 0, week: 7, month: 30 };
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

export const listWithItems = (statuses) =>
  pendingDonationRepository.listPendingDonationsWithItems(statuses);

export const listReconciliationQueue = () =>
  pendingDonationRepository.listPendingDonationsByStatus(RECONCILIATION_STATUSES);

export const getById = (id) =>
  pendingDonationRepository.getPendingDonationById(id);

// range is 'all' or a key of MINE_RANGE_DAYS; the controller checks it.
export const listMine = (userId, range) => {
  const from = range === 'all'
    ? null
    : new Date(Date.now() + SAST_OFFSET_MS - MINE_RANGE_DAYS[range] * 86400000).toISOString().slice(0, 10);
  return pendingDonationRepository.listPendingDonationsByCreator(userId, { from });
};

export default { listWithItems, listReconciliationQueue, getById, listMine };
