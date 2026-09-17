import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductMatchCombobox } from '../features/donation/components/ProductMatchComboBox';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProductMatchCombobox', () => {
  it('searches stock items and selects the matching SKU result', async () => {
    const onSelect = vi.fn();
    const fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [{ id: 42, name: 'Rice 10kg', sku: 'RICE-10KG', weight_kg: 10 }],
        }),
      })
    );
    vi.stubGlobal('fetch', fetch);

    render(<ProductMatchCombobox value={null} label="" onSelect={onSelect} />);

    await userEvent.type(screen.getByLabelText(/search stock items/i), 'RICE-10');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/donations/intake/products/search?name=RICE-10',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
    });

    await userEvent.click(await screen.findByRole('button', { name: /Rice 10kg.*RICE-10KG/i }));

    expect(onSelect).toHaveBeenCalledWith(42, 'Rice 10kg');
  });

  it('does not show pending product review rows in search results', async () => {
    const onSelect = vi.fn();
    const fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [
            { id: 41, name: 'Pending mystery tin', sku: 'PENDING-41', status: 'PENDING_PRODUCT_REVIEW' },
            { id: 42, name: 'Rice 10kg', sku: 'RICE-10KG', weight_kg: 10 },
          ],
        }),
      })
    );
    vi.stubGlobal('fetch', fetch);

    render(<ProductMatchCombobox value={null} label="" onSelect={onSelect} />);

    await userEvent.type(screen.getByLabelText(/search stock items/i), 'rice');

    expect(await screen.findByRole('button', { name: /Rice 10kg/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pending mystery tin/i })).not.toBeInTheDocument();
  });
});
