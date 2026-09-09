import pendingDonationRepository from '../repositories/pendingDonation.repository.js';
import pendingDonationService from '../services/pendingDonation.service.js';

const handleError = (res, label, fallbackMessage) => (err) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  return res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallbackMessage,
  });
};

const createPendingDonation = async (req, res) => {
  try {
    const pendingDonation = await pendingDonationService.createPendingDonationFromIntake({
      ...req.body,
      createdBy: req.user.id,
    });

    return res.status(201).json({ success: true, data: pendingDonation });
  } catch (err) {
    return handleError(res, 'createPendingDonation', 'Failed to create pending donation.')(err);
  }
};

const resolvePendingDonationFlag = async (req, res) => {
  try {
    const result = await pendingDonationService.resolveFlagAndMaybeCommit(req.params.flagId, {
      ...req.body,
      resolvedBy: req.user.id,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return handleError(res, 'resolvePendingDonationFlag', 'Failed to resolve pending donation flag.')(err);
  }
};

const retryPendingDonationCommit = async (req, res) => {
  try {
    const result = await pendingDonationService.retryCommit(req.params.pendingDonationId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return handleError(res, 'retryPendingDonationCommit', 'Failed to retry pending donation commit.')(err);
  }
};

// Whitelist for the donation-management list endpoint (D4 scope). Anything
// else in ?statuses= is rejected outright rather than silently filtered.
const LISTABLE_PENDING_STATUSES = [
  'awaiting_resolution',
  'committing',
  'commit_failed',
  'commit_incomplete',
];

const parseRequestedStatuses = (rawQuery) => {
  const requested = String(rawQuery ?? '').trim();
  // Default per D4: the Donation Management page opens on what actively
  // needs attention. Reconciliation-only failures arrive via an explicit
  // ?statuses= request, not this default.
  if (!requested) {
    return ['awaiting_resolution', 'committing'];
  }

  const parsed = [...new Set(requested.split(',').map((part) => part.trim()).filter(Boolean))];
  const invalid = parsed.filter((status) => !LISTABLE_PENDING_STATUSES.includes(status));
  if (invalid.length > 0) {
    const error = new Error(
      `Unknown pending donation status(es): ${invalid.join(', ')}. Valid values: ${LISTABLE_PENDING_STATUSES.join(', ')}.`
    );
    error.status = 400;
    throw error;
  }

  return parsed;
};

const listPendingDonations = async (req, res) => {
  try {
    const statuses = parseRequestedStatuses(req.query.statuses);
    const data = await pendingDonationRepository.listPendingDonationsWithItems(statuses);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return handleError(res, 'listPendingDonations', 'Failed to retrieve pending donations.')(err);
  }
};

const listReconciliationQueue = async (req, res) => {
  try {
    const queue = await pendingDonationRepository.listPendingDonationsByStatus([
      'commit_failed',
      'commit_incomplete',
    ]);

    return res.status(200).json({ success: true, data: queue });
  } catch (err) {
    return handleError(res, 'listPendingDonationReconciliationQueue', 'Failed to retrieve pending donation reconciliation queue.')(err);
  }
};

const getPendingDonationById = async (req, res) => {
  try {
    const pendingDonation = await pendingDonationRepository.getPendingDonationById(req.params.id);
    if (!pendingDonation) {
      return res.status(404).json({ success: false, message: 'Pending donation not found.' });
    }

    return res.status(200).json({ success: true, data: pendingDonation });
  } catch (err) {
    return handleError(res, 'getPendingDonationById', 'Failed to retrieve pending donation.')(err);
  }
};

export default {
  createPendingDonation,
  resolvePendingDonationFlag,
  retryPendingDonationCommit,
  listReconciliationQueue,
  listPendingDonations,
  getPendingDonationById,
};
