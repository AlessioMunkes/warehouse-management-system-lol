// ─────────────────────────────────────────────────────────────
// client/src/tests/AdminActivityScreen.test.jsx
//
// Covers the D6/Q2 dashboard badge: the Classification Queue tile shows one
// DEDUPLICATED attention count — legacy/unlinked flags + pending donations
// needing attention — computed by donationManagementAPI.getAttentionCounts().
// The intake-linked flags that belong to one of the counted pending
// donations are deliberately NOT counted again (see the comment on
// getAttentionCounts). The admin landing page no longer exposes the retired
// Donation Classification, Category Routing, or Explain Routing screens.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getFlaggedItemsMock = vi.fn();
const getPendingDonationsMock = vi.fn();

vi.mock('../services/donationManagementAPI', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    default: {
      ...actual,
      getFlaggedItems: (...args) => getFlaggedItemsMock(...args),
      getPendingDonations: (...args) => getPendingDonationsMock(...args),
      // getAttentionCounts runs for real on top of the mocked sources, so
      // the deduplication logic itself is what's under test.
      async getAttentionCounts() {
        const statuses = ['awaiting_resolution', 'committing', 'commit_failed', 'commit_incomplete'];
        const [flags, pendingDonations] = await Promise.all([
          this.getFlaggedItems(),
          this.getPendingDonations(statuses),
        ]);
        // Mirror the server: only rows in the requested attention statuses
        // come back from the endpoint, so filter the same way here.
        const attentionDonations = pendingDonations.filter((donation) => statuses.includes(donation.status));
        const legacyFlagCount = flags.filter((flag) => flag.pending_donation_id == null).length;
        return {
          legacyFlagCount,
          pendingDonationCount: attentionDonations.length,
          total: legacyFlagCount + attentionDonations.length,
        };
      },
    },
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { firstName: 'Test' } }),
}));

import AdminActivityScreen from '../pages/AdminActivityScreen';

const intakeFlag = (id, pendingDonationId) => ({
  flag_id: id,
  status: 'pending_classification',
  pending_donation_id: pendingDonationId,
  pending_donation_item_id: pendingDonationId ? 100 + id : null,
});

const legacyFlag = (id) => ({
  flag_id: id,
  status: 'pending_classification',
  pending_donation_id: null,
  pending_donation_item_id: null,
});

const pendingDonation = (id, status) => ({ id, status });

const renderScreen = () =>
  render(
    <MemoryRouter>
      <AdminActivityScreen />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminActivityScreen — Donation Management badge (D6/Q2)', () => {
  it('shows the deduplicated total: legacy flags + pending donations, intake-linked flags excluded', async () => {
    // 2 legacy flags (counted) + 3 intake-linked flags belonging to the
    // 2 pending donations below (NOT counted again) + 2 pending donations
    // (counted) => badge must read 4, not 7.
    getFlaggedItemsMock.mockResolvedValue([
      legacyFlag(1),
      legacyFlag(2),
      intakeFlag(3, 21),
      intakeFlag(4, 21),
      intakeFlag(5, 22),
    ]);
    getPendingDonationsMock.mockResolvedValue([
      pendingDonation(21, 'awaiting_resolution'),
      pendingDonation(22, 'commit_failed'),
    ]);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Needs attention (4)')).toBeInTheDocument();
    });
    // The pending donations fetch must use the full attention scope.
    expect(getPendingDonationsMock).toHaveBeenCalledWith(
      expect.arrayContaining(['awaiting_resolution', 'committing', 'commit_failed', 'commit_incomplete'])
    );
  });

  it('shows no badge when there is nothing needing attention', async () => {
    getFlaggedItemsMock.mockResolvedValue([intakeFlag(3, 21)]);
    getPendingDonationsMock.mockResolvedValue([pendingDonation(21, 'committed')]);

    renderScreen();

    await waitFor(() => {
      expect(getPendingDonationsMock).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Needs attention/)).not.toBeInTheDocument();
  });

  it('shows no badge when the counts fail to load (badge is advisory)', async () => {
    getFlaggedItemsMock.mockRejectedValue(new Error('boom'));

    renderScreen();

    await waitFor(() => {
      expect(getFlaggedItemsMock).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Needs attention/)).not.toBeInTheDocument();
    // The tile itself still renders.
    expect(screen.getByText('Classification Queue')).toBeInTheDocument();
  });

  it('keeps the remaining donation admin screens available', async () => {
    getFlaggedItemsMock.mockResolvedValue([legacyFlag(1)]);
    getPendingDonationsMock.mockResolvedValue([pendingDonation(21, 'awaiting_resolution')]);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Needs attention (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('Classification Queue')).toBeInTheDocument();
    expect(screen.getByText('Section 18A Management')).toBeInTheDocument();
    expect(screen.queryByText(/Donation Classification/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Category Routing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Explain Routing/)).not.toBeInTheDocument();
  });
});
