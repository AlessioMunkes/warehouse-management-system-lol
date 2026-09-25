import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = {
  getPublicFinanceReport: vi.fn(),
};

vi.mock('../services/financeAPI', () => api);

const { default: PublicFinanceReportPage } = await import('../pages/PublicFinanceReportPage');

const REPORT = {
  movements: [
    {
      movement_type: 'received',
      reference_id: '15',
      movement_date: '2026-09-03',
      source_destination: 'Meridian Foods',
      product: 'Rice',
      quantity: '10',
      unit: 'bag',
      monetary_value: '1250.00',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getPublicFinanceReport.mockResolvedValue(REPORT);
});

const renderPublicPage = () =>
  render(
    <MemoryRouter initialEntries={['/finance/report/public-token-123']}>
      <Routes>
        <Route path="/finance/report/:token" element={<PublicFinanceReportPage />} />
      </Routes>
    </MemoryRouter>,
  );

const expectedThisMonthRange = () => {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    limit: 200,
  };
};

describe('PublicFinanceReportPage', () => {
  it('loads the report through the tokenized public API without login context', async () => {
    renderPublicPage();

    await waitFor(() => expect(api.getPublicFinanceReport).toHaveBeenCalled());
    expect(api.getPublicFinanceReport).toHaveBeenCalledWith('public-token-123', expectedThisMonthRange());
    expect(await screen.findByText('Movement Trends')).toBeInTheDocument();
    expect(screen.getByLabelText(/movement chart/i)).toHaveAccessibleName(
      'Movement chart. Donations 0. Purchase Orders 1. Dispatch 0.',
    );
  });

  it('does not render admin-only controls', async () => {
    renderPublicPage();

    expect(await screen.findByText('Warehouse Movement Report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset filters/i })).not.toBeInTheDocument();
  });

  it('shows public link failures in place', async () => {
    api.getPublicFinanceReport.mockRejectedValueOnce(new Error('Finance report link is invalid or has been revoked.'));

    renderPublicPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Finance report link is invalid or has been revoked.');
    expect(screen.getByText('Warehouse Movement Report')).toBeInTheDocument();
  });
});
