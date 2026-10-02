import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('../services/productAPI', async (importOriginal) => ({
  ...(await importOriginal()),
  default: {
    getProducts: vi.fn(), getProduct: vi.fn(), createProduct: vi.fn(),
    updateProduct: vi.fn(), setProductStatus: vi.fn(), deleteProduct: vi.fn(),
  },
}));

const { default: productAPI } = await import('../services/productAPI');
const { default: ProductManagementPage } = await import('../pages/ProductManagementPage');

const RICE = { id: 1, name: 'Rice 10kg', sku: 'RICE-10', category: 'Dry goods', storageType: 'dry', isActive: true, weightKg: 10, unitCost: 120, isPerishable: false, defaultUnit: 'bag' };
const MILK = { id: 2, name: 'Milk 1l', sku: 'MILK-1', category: 'Dairy', storageType: 'cold', isActive: true, weightKg: 1, unitCost: 18, isPerishable: true, defaultUnit: 'l' };

const renderPage = () => render(<MemoryRouter><ProductManagementPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  productAPI.getProducts.mockResolvedValue([RICE, MILK]);
  productAPI.getProduct.mockImplementation(async (id) => [RICE, MILK].find((p) => p.id === id));
  productAPI.setProductStatus.mockResolvedValue({});
});

describe('Product Management', () => {
  it('lists products with storage tabs', async () => {
    renderPage();
    expect(await screen.findByText('Rice 10kg')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cold 1' })).toBeInTheDocument();
  });

  it('narrows to cold storage', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Rice 10kg');
    await user.click(screen.getByRole('tab', { name: 'Cold 1' }));
    expect(screen.getByText('Milk 1l')).toBeInTheDocument();
    expect(screen.queryByText('Rice 10kg')).not.toBeInTheDocument();
  });

  it('opens a product in the panel and deactivates it', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Rice 10kg'));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('R 120,00')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(productAPI.setProductStatus).toHaveBeenCalledWith(1, false));
  });

  it('opens the add form in the panel from the header', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Rice 10kg');
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    expect(await screen.findByRole('dialog', { name: 'Add a product' })).toBeInTheDocument();
  });
});
