// ─────────────────────────────────────────────────────────────
// client/src/tests/SupplierProducts.test.jsx
//
// What a supplier supplies: ticking products on the supplier form, and
// the purchase order form offering only those once a supplier with a
// list is chosen.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SupplierForm from '../features/suppliers/components/SupplierForm';
import { toSupplier } from '../services/supplierAPI';

const PRODUCTS = [
  { id: 1270, name: 'Rice' },
  { id: 10, name: 'Samp' },
  { id: 1274, name: 'Sugar' },
];

describe('toSupplier', () => {
  it('carries what the supplier supplies, and an empty list when nothing is listed', () => {
    expect(toSupplier({ id: 1, name: 'Wema', supplied_products: [{ id: 10, name: 'Samp' }] }).suppliedProducts)
      .toEqual([{ id: 10, name: 'Samp' }]);
    expect(toSupplier({ id: 2, name: 'Legit Doors' }).suppliedProducts).toEqual([]);
  });
});

describe('SupplierForm — products supplied', () => {
  it('sends the ticked products with the supplier', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SupplierForm products={PRODUCTS} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Supplier name'), 'Wema');
    // With a lead time, so the form has nothing blank to ask about.
    await user.type(screen.getByLabelText('Expected lead time (days)'), '3');
    const list = screen.getByRole('group', { name: 'Product list' });
    await user.click(within(list).getByLabelText('Rice'));
    await user.click(within(list).getByLabelText('Samp'));
    await user.click(screen.getByRole('button', { name: 'Register supplier' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Wema', productIds: [1270, 10] });
  });

  it('starts from what is already listed when editing, and can untick one', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SupplierForm
        products={PRODUCTS} submitLabel="Save changes" onSubmit={onSubmit}
        initial={{ name: 'Wema', expectedLeadTimeDays: 3, suppliedProducts: [{ id: 1270, name: 'Rice' }, { id: 10, name: 'Samp' }] }}
      />,
    );

    const list = screen.getByRole('group', { name: 'Product list' });
    expect(within(list).getByLabelText('Rice')).toBeChecked();
    expect(within(list).getByLabelText('Sugar')).not.toBeChecked();
    expect(screen.getByText(/2 ticked/)).toBeInTheDocument();

    await user.click(within(list).getByLabelText('Rice'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit.mock.calls[0][0].productIds).toEqual([10]);
  });

  it('narrows the list as the admin searches, without losing what is ticked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SupplierForm products={PRODUCTS} onSubmit={onSubmit} initial={{ name: 'Wema', expectedLeadTimeDays: 3, suppliedProducts: [{ id: 1270, name: 'Rice' }] }} />);

    await user.type(screen.getByLabelText('Products supplied'), 'sa');
    const list = screen.getByRole('group', { name: 'Product list' });
    expect(within(list).getByLabelText('Samp')).toBeInTheDocument();
    expect(within(list).queryByLabelText('Rice')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Register supplier' }));
    expect(onSubmit.mock.calls[0][0].productIds).toEqual([1270]);
  });

  it('says that nothing ticked means every product is offered', () => {
    render(<SupplierForm products={PRODUCTS} onSubmit={vi.fn()} />);
    expect(screen.getByText(/With none ticked, every product is offered/)).toBeInTheDocument();
  });
});
