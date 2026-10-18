// ─────────────────────────────────────────────────────────────
// src/tests/StaffDonationHistory.test.jsx
//
// My donations: a worker can go back to a donation they recorded, see
// where it has got to, and read what they filled in.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/layout/StaffShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../services/donationAPI', () => ({ getMyDonations: vi.fn(), getMyDonation: vi.fn() }));

const api = await import('../services/donationAPI');
const { default: StaffDonationHistoryPage } = await import('../pages/StaffDonationHistoryPage');

const ROWS = [
  { id: 1, status: 'committed', created_at: '2026-10-13T09:00:00', donor_name: 'Ubuntu Bakery', estimated_value_zar: '350', donation_category: 'recipe_food', section18a_requested: false, item_count: 2, awaiting_count: 0 },
  { id: 2, status: 'awaiting_resolution', created_at: '2026-10-14T09:00:00', donor_name: null, estimated_value_zar: null, donation_category: 'non_food', section18a_requested: true, item_count: 3, awaiting_count: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyDonations.mockResolvedValue(ROWS);
});

const show = () => render(<MemoryRouter><StaffDonationHistoryPage /></MemoryRouter>);

describe('My donations', () => {
  it('lists what this worker recorded with where each one has got to', async () => {
    show();
    expect(await screen.findByText('Ubuntu Bakery')).toBeInTheDocument();
    expect(screen.getByText('Anonymous donor')).toBeInTheDocument();
    const badges = [...document.querySelectorAll('.stf-history-badges')].map((n) => n.textContent);
    expect(badges).toEqual(['Waiting for a manager', 'Recorded']);
    expect(screen.getByText(/1 waiting for a manager/)).toBeInTheDocument();
    expect(api.getMyDonations).toHaveBeenCalledWith('week');
  });

  it('opens what was filled in, item by item', async () => {
    api.getMyDonation.mockResolvedValue({
      ...ROWS[0], donor_contact: 'bakery@example.org', notes: 'Left at the gate',
      items: [{ id: 11, description: 'Bread', quantity: 20, unit: 'loaf', status: 'committed' }],
    });
    show();
    const row = (await screen.findByText('Ubuntu Bakery')).closest('.stf-row');
    fireEvent.click(within(row).getByRole('button', { name: 'View' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Bread')).toBeInTheDocument();
    expect(within(dialog).getByText('bakery@example.org')).toBeInTheDocument();
    expect(within(dialog).getByText('Left at the gate')).toBeInTheDocument();
    expect(api.getMyDonation).toHaveBeenCalledWith(1);
  });
});
