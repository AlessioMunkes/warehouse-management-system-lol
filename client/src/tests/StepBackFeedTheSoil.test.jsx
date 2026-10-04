// ─────────────────────────────────────────────────────────────
// client/src/tests/StepBackFeedTheSoil.test.jsx
//
// Feed the Soil's step back: every screen below the lists names its parent
// in the shell ("‹ Kits", "‹ Kit", "‹ Compost records", "‹ Record"), the
// same places the Cancel and Back buttons on those screens already go. A
// form's draft survives the trip. The arrow at the top left is not touched
// (the shell is stubbed here to expose only onBack/backLabel).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/collectionKitAPI', () => {
  const api = {
    listKits: vi.fn(), createKit: vi.fn(), getKit: vi.fn(),
    listRecords: vi.fn(), getRecord: vi.fn(), logCompost: vi.fn(), markDispatched: vi.fn(),
  };
  return { ...api, default: api };
});
vi.mock('../components/layout/StaffShell', () => ({
  default: ({ children, crumb, onBack, backLabel }) => (
    <div>
      <p data-testid="crumb">{crumb}</p>
      {onBack ? <button type="button" onClick={onBack}>{`‹ ${backLabel}`}</button> : null}
      {children}
    </div>
  ),
}));

const api = (await import('../services/collectionKitAPI')).default;
const { default: StaffFeedTheSoilPage } = await import('../pages/StaffFeedTheSoilPage');

const KIT = { id: 3, owner_name: 'Thandi M.', suburb: 'Delft', status: 'assigned', assigned_at: '2026-09-20', records: [] };
const RECORD = {
  id: 9, kit_id: 3, owner_name: 'Thandi M.', suburb: 'Delft', kg_compost: '12.000',
  logged_at: '2026-10-01', status: 'logged', notes: null, dispatched_to: null,
};
const KIT_WITH_RECORD = { ...KIT, records: [RECORD] };

const crumb = () => screen.getByTestId('crumb');
const backButton = (label) => screen.getByRole('button', { name: `‹ ${label}` });
const noBack = () => expect(screen.queryByRole('button', { name: /^‹ / })).not.toBeInTheDocument();

const openKitsTab = async (user) => {
  await user.click(await screen.findByRole('tab', { name: /Kits/ }));
  await screen.findByRole('button', { name: 'Assign a kit' });
};

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  api.listKits.mockResolvedValue([KIT]);
  api.listRecords.mockResolvedValue([RECORD]);
  api.getKit.mockResolvedValue(KIT);
  api.getRecord.mockResolvedValue(RECORD);
});

describe('Feed the Soil: the step back', () => {
  it('has none on the lists', async () => {
    const user = userEvent.setup();
    render(<StaffFeedTheSoilPage />);
    await screen.findByRole('button', { name: 'Log a collection' });
    noBack();
    await openKitsTab(user);
    noBack();
  });

  it('assign a kit goes back to the kits list, and the draft is still there', async () => {
    const user = userEvent.setup();
    render(<StaffFeedTheSoilPage />);
    await openKitsTab(user);

    await user.click(screen.getByRole('button', { name: 'Assign a kit' }));
    expect(crumb()).toHaveTextContent('Assign a kit');
    await user.type(await screen.findByLabelText("Owner's name"), 'Lerato D.');

    await user.click(backButton('Kits'));
    await screen.findByRole('button', { name: 'Assign a kit' });
    expect(crumb()).toHaveTextContent('Kits');
    noBack();

    await user.click(screen.getByRole('button', { name: 'Assign a kit' }));
    expect(await screen.findByLabelText("Owner's name")).toHaveValue('Lerato D.');
  });

  it('a kit goes back to the kits list', async () => {
    const user = userEvent.setup();
    render(<StaffFeedTheSoilPage />);
    await openKitsTab(user);
    await user.click(await screen.findByRole('button', { name: /CK0003/ }));
    await screen.findByText('Collection kit details');

    await user.click(backButton('Kits'));
    expect(await screen.findByRole('button', { name: 'Assign a kit' })).toBeInTheDocument();
  });

  it('logging compost goes back to the kit, and the draft is still there', async () => {
    const user = userEvent.setup();
    render(<StaffFeedTheSoilPage />);
    await openKitsTab(user);
    await user.click(await screen.findByRole('button', { name: /CK0003/ }));
    await user.click(await screen.findByRole('button', { name: 'Log compost' }));
    expect(crumb()).toHaveTextContent('Log compost');
    await user.type(await screen.findByLabelText(/Kilograms/i), '12');

    await user.click(backButton('Kit'));
    await screen.findByText('Collection kit details');

    await user.click(screen.getByRole('button', { name: 'Log compost' }));
    expect(await screen.findByLabelText(/Kilograms/i)).toHaveValue('12');
  });

  it('picking a kit to log against goes back to the compost records', async () => {
    const user = userEvent.setup();
    render(<StaffFeedTheSoilPage />);
    await user.click(await screen.findByRole('button', { name: 'Log a collection' }));
    expect(crumb()).toHaveTextContent('Log a collection');

    await user.click(backButton('Compost records'));
    expect(await screen.findByRole('button', { name: 'Log a collection' })).toBeInTheDocument();
  });

  it('a record opened from the records list goes back to the records list', async () => {
    const user = userEvent.setup();
    render(<StaffFeedTheSoilPage />);
    await user.click(await screen.findByRole('button', { name: /CK0003/ }));
    await screen.findByRole('button', { name: 'Mark dispatched' });

    await user.click(backButton('Compost records'));
    expect(await screen.findByRole('button', { name: 'Log a collection' })).toBeInTheDocument();
  });

  it('a record opened from a kit goes back to that kit, and marking it dispatched goes back to the record', async () => {
    const user = userEvent.setup();
    api.getKit.mockResolvedValue(KIT_WITH_RECORD);
    render(<StaffFeedTheSoilPage />);
    await openKitsTab(user);
    await user.click(await screen.findByRole('button', { name: /CK0003/ }));
    await screen.findByText('Collection records');
    await user.click(await screen.findByRole('button', { name: /Oct/ }));
    await user.click(await screen.findByRole('button', { name: 'Mark dispatched' }));
    expect(crumb()).toHaveTextContent('Mark dispatched');

    await user.click(backButton('Record'));
    await screen.findByRole('button', { name: 'Mark dispatched' });
    expect(crumb()).toHaveTextContent('Record');

    await user.click(backButton('Kit'));
    expect(await screen.findByText('Collection kit details')).toBeInTheDocument();
  });

  it('is not offered while a kit is being assigned, and comes back if that fails', async () => {
    const user = userEvent.setup();
    let fail;
    api.createKit.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    render(<StaffFeedTheSoilPage />);
    await openKitsTab(user);
    await user.click(screen.getByRole('button', { name: 'Assign a kit' }));
    await user.type(await screen.findByLabelText("Owner's name"), 'Lerato D.');
    await user.click(screen.getByRole('button', { name: 'Assign kit' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '‹ Kits' })).not.toBeInTheDocument());

    fail(new Error('Network down'));
    expect(await screen.findByRole('button', { name: '‹ Kits' })).toBeInTheDocument();
  });

  it('is not offered while compost is being logged', async () => {
    const user = userEvent.setup();
    let fail;
    api.logCompost.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    render(<StaffFeedTheSoilPage />);
    await openKitsTab(user);
    await user.click(await screen.findByRole('button', { name: /CK0003/ }));
    await user.click(await screen.findByRole('button', { name: 'Log compost' }));
    await user.type(await screen.findByLabelText(/Kilograms/i), '12');
    await user.click(screen.getByRole('button', { name: 'Log compost' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '‹ Kit' })).not.toBeInTheDocument());

    fail(new Error('Network down'));
    expect(await screen.findByRole('button', { name: '‹ Kit' })).toBeInTheDocument();
  });
});
