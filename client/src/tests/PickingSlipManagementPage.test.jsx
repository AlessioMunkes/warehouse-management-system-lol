// ─────────────────────────────────────────────────────────────
// src/tests/PickingSlipManagementPage.test.jsx
//
// The Picking Slips list on the shared list pattern: the week it
// loads, the tabs (and the gate outcome folded into them), the slip
// panel, and the bulk actions — which must make the same per-slip
// requests the panel does, only for the slips each one applies to.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  countViews, shiftWeek, slipState, weekLabel, weekOf,
} from '../features/pickingSlips/slipViews';

vi.mock('../services/pickingAPI', () => ({
  fetchPickingSlips: vi.fn(),
  fetchPickingSlip: vi.fn(),
  fetchAssignableWorkers: vi.fn(),
  assignSlip: vi.fn(),
  releaseSlip: vi.fn(),
  addSecondPacker: vi.fn(),
  generateSlips: vi.fn(),
  createSlip: vi.fn(),
  editSlip: vi.fn(),
}));
vi.mock('../services/beneficiaryAPI', () => ({ default: { getBeneficiaries: vi.fn(async () => []) } }));
vi.mock('../services/productAPI', () => ({ default: { getProducts: vi.fn(async () => []) } }));
vi.mock('../features/packing/palletLabelPdf', () => ({
  openLabelPdf: vi.fn(() => ({ opened: true, skipped: 0 })),
  publicAppOrigin: () => 'https://example.org',
  isReachableByPhone: () => true,
}));
vi.mock('../components/layout/ManagerLayout', () => ({ default: ({ children }) => children }));
vi.mock('@/components/ui/toastContext', () => ({ useToast: () => vi.fn() }));

const router = { params: new URLSearchParams(), setParams: vi.fn() };
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [router.params, router.setParams],
}));

const api = await import('../services/pickingAPI');
const { openLabelPdf } = await import('../features/packing/palletLabelPdf');
const { default: PickingSlipManagementPage } = await import('../pages/PickingSlipManagementPage');

const slip = (over) => ({
  id: 1, ecd_name: 'Sunshine ECD', cohort: 'tuesday', status: 'pending', dispatch_status: null,
  dispatch_date_iso: '2026-09-29', confirmed_items: 0, total_items: 6, public_token: 'tok-1',
  packer_name: null, assigned_to: null, ...over,
});

const SLIPS = [
  slip({ id: 1, ecd_name: 'Sunshine ECD' }),
  slip({ id: 2, ecd_name: 'Little Stars', status: 'in_progress', packer_name: 'Thandi', assigned_to: 10, confirmed_items: 3 }),
  slip({ id: 3, ecd_name: 'Rainbow Kids', status: 'complete', confirmed_items: 6 }),
  slip({ id: 4, ecd_name: 'Hope House', status: 'dispatched', dispatch_status: 'not_collected', confirmed_items: 6 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  router.params = new URLSearchParams();
  api.fetchPickingSlips.mockResolvedValue(SLIPS);
  api.fetchAssignableWorkers.mockResolvedValue([{ id: 10, first_name: 'Thandi', last_name: 'M' }, { id: 11, first_name: 'Sipho', last_name: 'K' }]);
  api.fetchPickingSlip.mockImplementation(async (id) => ({ ...SLIPS.find((s) => s.id === Number(id)), items: [] }));
  api.assignSlip.mockResolvedValue({});
  api.releaseSlip.mockResolvedValue({});
});

describe('slipViews', () => {
  it('runs a week Monday to Sunday', () => {
    expect(weekOf('2026-10-02')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(weekOf('2026-09-28')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(weekOf('2026-10-04')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(shiftWeek(weekOf('2026-10-02'), -1)).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(weekLabel(weekOf('2026-10-02'))).toMatch(/28 Sept? – 0?4 Oct 2026/);
  });

  it('lets the gate outcome override the packing status', () => {
    expect(slipState(slip({ status: 'dispatched', dispatch_status: 'not_collected' }))).toBe('not_collected');
    expect(slipState(slip({ status: 'dispatched', dispatch_status: 'late_collected' }))).toBe('collected');
    expect(slipState(slip({ status: 'complete' }))).toBe('complete');
  });

  it('counts each tab', () => {
    expect(countViews(SLIPS)).toEqual({ all: 4, unassigned: 1, packing: 1, ready: 1, notcollected: 1 });
  });
});

describe('PickingSlipManagementPage', () => {
  it('shows a pallet a volunteer is packing in the Packer column, not as unassigned', async () => {
    api.fetchPickingSlips.mockResolvedValue([
      slip({ id: 7, ecd_name: 'Guest Pallet ECD', status: 'in_progress', assigned_volunteer_id: '7', volunteer_name: 'Thandi' }),
    ]);
    render(<PickingSlipManagementPage />);
    expect(await screen.findByText('Volunteer: Thandi')).toBeInTheDocument();
  });

  it('loads the whole week, not one day', async () => {
    render(<PickingSlipManagementPage />);
    await waitFor(() => expect(api.fetchPickingSlips).toHaveBeenCalled());
    const { from, to } = api.fetchPickingSlips.mock.calls[0][0];
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${from}T00:00:00Z`).getUTCDay()).toBe(1);   // Monday
  });

  it('opens on the tab the URL names — the dashboard links to ?status=notcollected', async () => {
    router.params = new URLSearchParams('status=notcollected');
    render(<PickingSlipManagementPage />);

    expect(await screen.findByRole('tab', { name: /Not collected/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: 'Hope House' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sunshine ECD' })).not.toBeInTheDocument();
  });

  it('opens a slip in the panel with the actions its state allows', async () => {
    const user = userEvent.setup();
    render(<PickingSlipManagementPage />);

    await user.click(await screen.findByRole('button', { name: 'Sunshine ECD' }));
    const panel = within(await screen.findByRole('dialog', { name: 'Sunshine ECD' }));
    expect(panel.getByText(/on the floor for anyone to claim/)).toBeInTheDocument();
    // A slip on the floor has no claim to release.
    expect(panel.queryByRole('button', { name: /Assign to floor/ })).not.toBeInTheDocument();
    expect(panel.getByRole('button', { name: /Edit slip/ })).toBeInTheDocument();
  });

  it('bulk "Assign to floor" releases only the claimed slips', async () => {
    const user = userEvent.setup();
    render(<PickingSlipManagementPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Select Sunshine ECD' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Little Stars' }));
    await user.click(screen.getByRole('button', { name: /Assign to floor \(1\)/ }));

    await waitFor(() => expect(api.releaseSlip).toHaveBeenCalledTimes(1));
    expect(api.releaseSlip).toHaveBeenCalledWith(2);
  });

  it('bulk "Assign to…" sends each slip still in play to the chosen worker', async () => {
    const user = userEvent.setup();
    render(<PickingSlipManagementPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Select Sunshine ECD' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Little Stars' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Rainbow Kids' }));
    await user.click(screen.getByRole('button', { name: /Assign to…/ }));

    // Rainbow Kids is packed already, and is left alone.
    expect(await screen.findByText(/1 ticked slip is already packed or closed/)).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Worker' }));
    await user.click(await screen.findByRole('option', { name: 'Sipho K' }));
    expect(screen.getByText(/1 of these is being packed by someone else/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => expect(api.assignSlip).toHaveBeenCalledTimes(2));
    expect(api.assignSlip).toHaveBeenCalledWith(1, 11);
    expect(api.assignSlip).toHaveBeenCalledWith(2, 11);
  });

  it('prints labels for the ticked slips', async () => {
    const user = userEvent.setup();
    render(<PickingSlipManagementPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Select Rainbow Kids' }));
    await user.click(screen.getByRole('button', { name: /Print pallet labels/ }));

    expect(openLabelPdf).toHaveBeenCalledTimes(1);
    expect(openLabelPdf.mock.calls[0][0].map((l) => l.ecd_name)).toEqual(['Rainbow Kids']);
  });
});
