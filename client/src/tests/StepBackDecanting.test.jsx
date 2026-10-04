// ─────────────────────────────────────────────────────────────
// client/src/tests/StepBackDecanting.test.jsx
//
// Decanting's step back: on the weighing screen the shell offers
// "‹ Choose the sack", which goes back to the product list. What was
// typed stays, so Next brings it back. The arrow at the top left is not
// touched (the shell is stubbed here to expose only onBack/backLabel).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/decantingAPI', () => ({
  getProducts: vi.fn(),
  calculateDecantingPlan: vi.fn(),
  recordDecanting: vi.fn(),
  getDecantingRecords: vi.fn(),
  getDecantingById: vi.fn(),
  getWeeklyReport: vi.fn(),
  exportDecantingSheet: vi.fn(),
}));
vi.mock('../components/layout/StaffShell', () => ({
  default: ({ children, crumb, onBack, backLabel }) => (
    <div>
      <p data-testid="crumb">{crumb}</p>
      {onBack ? <button type="button" onClick={onBack}>{`‹ ${backLabel}`}</button> : null}
      {children}
    </div>
  ),
}));

const api = await import('../services/decantingAPI');
const { default: DecantingPage } = await import('../pages/DecantingPage');

const PRODUCTS = [
  { id: 11, name: 'Maize meal', weight_kg: 50 },
  { id: 12, name: 'Sugar beans', weight_kg: 25 },
];

const BACK = '‹ Choose the sack';

const renderPage = () => render(<MemoryRouter><DecantingPage /></MemoryRouter>);

const chooseSack = async (user) => {
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Product' }), '11');
  await user.click(screen.getByRole('button', { name: 'Next' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); localStorage.setItem('stf_decanting_view_mode', 'full'); } catch { /* ignore */ }
  api.getProducts.mockResolvedValue(PRODUCTS);
});

describe('Decanting: the step back', () => {
  it('is not there on the first screen, and appears on the weighing screen', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('combobox', { name: 'Product' });
    expect(screen.queryByRole('button', { name: BACK })).not.toBeInTheDocument();

    await chooseSack(user);
    expect(await screen.findByLabelText('Kilograms on the scale')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BACK })).toBeInTheDocument();
  });

  it('goes back to choosing the sack, and the crumb follows', async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseSack(user);
    expect(screen.getByTestId('crumb')).toHaveTextContent('Weigh, bag and count back');

    await user.click(screen.getByRole('button', { name: BACK }));
    expect(await screen.findByRole('combobox', { name: 'Product' })).toBeInTheDocument();
    expect(screen.getByTestId('crumb')).toHaveTextContent('What you are working with');
    expect(screen.queryByRole('button', { name: BACK })).not.toBeInTheDocument();
  });

  it('keeps the sack and the weights typed when you go back and press Next', async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseSack(user);
    await user.type(screen.getByLabelText('Kilograms on the scale'), '48.5');
    await user.type(screen.getByLabelText('Kilograms the centres need this week'), '40');

    await user.click(screen.getByRole('button', { name: BACK }));
    // The sack is still the one chosen.
    expect(await screen.findByRole('combobox', { name: 'Product' })).toHaveValue('11');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByLabelText('Kilograms on the scale')).toHaveValue('48.5');
    expect(screen.getByLabelText('Kilograms the centres need this week')).toHaveValue('40');
  });

  it('is not offered while the bag plan is being worked out, and comes back after', async () => {
    const user = userEvent.setup();
    let finish;
    api.calculateDecantingPlan.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    await chooseSack(user);
    await user.type(screen.getByLabelText('Kilograms on the scale'), '48.5');
    await user.type(screen.getByLabelText('Kilograms the centres need this week'), '40');
    await user.click(screen.getByRole('button', { name: /Work out the bags/i }));

    await waitFor(() => expect(screen.queryByRole('button', { name: BACK })).not.toBeInTheDocument());

    finish({ plans: [{ productId: 11, bags: { '2kg': 20 }, packedKg: 40, wastageKg: 0 }] });
    expect(await screen.findByRole('button', { name: BACK })).toBeInTheDocument();
  });

  it('is not offered while the sack is being saved', async () => {
    const user = userEvent.setup();
    api.calculateDecantingPlan.mockResolvedValue({ plans: [{ productId: 11, bags: { '2kg': 20 }, packedKg: 40, wastageKg: 0 }] });
    let fail;
    api.recordDecanting.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    renderPage();
    await chooseSack(user);
    await user.type(screen.getByLabelText('Kilograms on the scale'), '48.5');
    await user.type(screen.getByLabelText('Kilograms the centres need this week'), '40');
    await user.click(screen.getByRole('button', { name: /Work out the bags/i }));
    await user.click(await screen.findByRole('button', { name: 'Save this sack' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: BACK })).not.toBeInTheDocument());

    fail(new Error('Network down'));
    expect(await screen.findByRole('button', { name: BACK })).toBeInTheDocument();
  });
});
