// ─────────────────────────────────────────────────────────────
// client/src/tests/MissingDetailsNotice.test.jsx
//
// Saving a product or a supplier with an optional field blank that
// something else relies on: the form says what will go without it, and
// still lets the admin save.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductForm from '../features/products/ProductForm';
import SupplierForm from '../features/suppliers/SupplierForm';

const FULL = { name: 'Rice', sku: 'WC-RICE', defaultUnit: 'kg', weightKg: 1, unitCost: 20, reorderThreshold: 50 };

describe('ProductForm — blank optional details', () => {
  it('says what a missing weight and cost mean before saving, and saves on "Save anyway"', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm initial={{ ...FULL, weightKg: '', unitCost: '' }} submitLabel="Save changes" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).not.toHaveBeenCalled();

    const notice = screen.getByRole('alertdialog');
    expect(within(notice).getByText(/cannot work out the expected weight/)).toBeTruthy();
    expect(within(notice).getByText(/cannot work out the cost/)).toBeTruthy();
    // An edit leaves a blank threshold as it is, so it is not asked about.
    expect(within(notice).queryByText(/never marked as low stock/)).toBeNull();

    await user.click(within(notice).getByRole('button', { name: 'Save anyway' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Rice', weightKg: null, unitCost: null });
  });

  it('goes back to the form without saving', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm initial={{ ...FULL, weightKg: '' }} submitLabel="Save changes" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(screen.getByRole('button', { name: 'Go back and fill in' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves straight away when nothing that matters is blank', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm initial={FULL} submitLabel="Save changes" onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('still refuses a missing required field outright', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    expect(screen.getByText('A name is required.')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('SupplierForm — blank optional details', () => {
  const PRODUCTS = [{ id: 1, name: 'Rice' }];

  it('says what a missing lead time and no products mean, and saves on "Save anyway"', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SupplierForm products={PRODUCTS} initial={{ name: 'Wema' }} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Register supplier' }));
    const notice = screen.getByRole('alertdialog');
    expect(within(notice).getByText(/arrive late/)).toBeTruthy();
    expect(within(notice).getByText(/will offer every product/)).toBeTruthy();

    await user.click(within(notice).getByRole('button', { name: 'Save anyway' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Wema', productIds: [], expectedLeadTimeDays: null });
  });

  it('saves straight away with a lead time and a product ticked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SupplierForm products={PRODUCTS} onSubmit={onSubmit}
      initial={{ name: 'Wema', expectedLeadTimeDays: 3, suppliedProducts: [{ id: 1, name: 'Rice' }] }} />);
    await user.click(screen.getByRole('button', { name: 'Register supplier' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
