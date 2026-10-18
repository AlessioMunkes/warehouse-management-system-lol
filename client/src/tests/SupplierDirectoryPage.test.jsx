import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('../services/supplierAPI', async (importOriginal) => ({
  ...(await importOriginal()),
  default: {
    getSuppliers: vi.fn(), getSupplier: vi.fn(), registerSupplier: vi.fn(), updateSupplier: vi.fn(),
    setSupplierStatus: vi.fn(), deleteSupplier: vi.fn(),
    getProspects: vi.fn(), addProspect: vi.fn(), updateProspect: vi.fn(), deleteProspect: vi.fn(), convertProspect: vi.fn(),
  },
}));

const { default: supplierAPI } = await import('../services/supplierAPI');
const { default: SupplierDirectoryPage } = await import('../pages/SupplierDirectoryPage');

const base = { contactName: '', contactPhone: '', agreementRef: '', paymentTerms: '', expectedLeadTimeDays: null, notes: '', isActive: true };
const BOKOMO = { ...base, id: 1, name: 'Bokomo Foods', category: 'Dry goods', contactEmail: 'orders@bokomo.test' };
const COLD = { ...base, id: 2, name: 'Cape Cold Storage', category: 'Cold chain', contactEmail: 'hello@cold.test' };
const DETAIL = {
  ...BOKOMO,
  stats: { purchaseOrderCount: 3, openPurchaseOrders: 1, deliveryNoteCount: 2, openDiscrepancies: 0 },
  purchaseOrders: [{ id: 7, status: 'approved', expectedDeliveryDate: null, deliveredOn: null, lineCount: 2 }],
};

const renderPage = () => render(<MemoryRouter><SupplierDirectoryPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  supplierAPI.getSuppliers.mockResolvedValue([BOKOMO, COLD]);
  supplierAPI.getSupplier.mockResolvedValue(DETAIL);
  supplierAPI.getProspects.mockResolvedValue([]);
});

describe('Supplier Management', () => {
  it('lists suppliers', async () => {
    renderPage();
    expect(await screen.findByText('Bokomo Foods')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Suppliers' })).toHaveAttribute('aria-selected', 'true');
  });

  it('filters by a category from the Filter menu', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bokomo Foods');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Cold chain' }));
    await waitFor(() => expect(screen.queryByText('Bokomo Foods')).not.toBeInTheDocument());
    expect(screen.getByText('Cape Cold Storage')).toBeInTheDocument();
  });

  it('opens a supplier in the panel with its open-orders warning and recent orders', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Bokomo Foods'));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText(/1 purchase order still open/)).toBeInTheDocument();
    expect(within(panel).getByText('#7')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('switches to prospects', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bokomo Foods');
    await user.click(screen.getByRole('tab', { name: 'Prospects' }));
    await waitFor(() => expect(supplierAPI.getProspects).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Register supplier' })).not.toBeInTheDocument();
  });
});
