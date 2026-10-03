// ─────────────────────────────────────────────────────────────
// client/src/tests/QuickbooksImportDialog.test.jsx
//
// Import QuickBooks links, end to end in the browser with the API
// mocked: upload, pick the column, preview every status, tick
// conflicts, confirm with totals, see the result. Also that the button
// is on the Purchase orders header for managers only.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/purchaseOrderAPI', async () => {
  const actual = await vi.importActual('../services/purchaseOrderAPI');
  const api = {
    getPurchaseOrders: vi.fn(async () => []),
    getPurchaseOrder: vi.fn(),
    previewQuickbooksImport: vi.fn(),
    applyQuickbooksImport: vi.fn(),
  };
  return { ...actual, ...api, default: api };
});
vi.mock('../services/supplierAPI', () => ({ default: { getSuppliers: vi.fn(async () => []) } }));
vi.mock('../services/stockAPI', () => ({ default: { getManifest: vi.fn(async () => []) } }));
vi.mock('@/components/ui/toastContext', () => ({ useToast: () => vi.fn() }));
const auth = { role: 'manager' };
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: auth.role } }) }));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

const { default: api } = await import('../services/purchaseOrderAPI');
const { default: QuickbooksImportDialog } = await import('../features/purchaseOrders/components/QuickbooksImportDialog');
const { default: PurchaseOrdersPage } = await import('../pages/PurchaseOrdersPage');

// Every case in one export: will link (101), unchanged (102), PO already
// linked elsewhere (103), number held by another PO (104), not found
// (999), two PO numbers in a row (105 + 106), PO repeated (107 twice),
// QuickBooks number repeated (108/109 both 7000), no PO number.
const EXPORT = [
  'Purchase Orders,,,,,',
  '',
  'Date,Num,Vendor,Memo,Amount,Status',
  '2026-10-01,1001,Acme,PO-2026-0101,1,Open',
  '2026-10-01,1002,Acme,wms po-2026-0102,1,Open',
  '2026-10-01,1003,Acme,Ref PO-2026-0103 rice,1,Open',
  '2026-10-01,1004,Acme,PO-2026-0104,1,Open',
  '2026-10-01,1005,Acme,PO-2026-0999,1,Open',
  '2026-10-01,1006,Acme,PO-2026-0105 and PO-2026-0106,1,Open',
  '2026-10-01,1007,Acme,PO-2026-0107,1,Open',
  '2026-10-01,1008,Acme,PO-2026-0107 again,1,Open',
  '2026-10-01,7000,Acme,PO-2026-0108,1,Open',
  '2026-10-01,7000,Acme,PO-2026-0109,1,Open',
  '2026-10-01,1010,Office Co,Printer paper,1,Open',
].join('\n');

const previewFor = (pairs) => ({
  rows: pairs.map((p) => {
    switch (p.poNumber) {
      case 'PO-2026-0101': return { ...p, status: 'will_link' };
      case 'PO-2026-0102': return { ...p, status: 'unchanged' };
      case 'PO-2026-0103': return { ...p, status: 'conflict', linkedQuickbooksNumber: 'OLD-3', linkedToPoNumber: null };
      case 'PO-2026-0104': return { ...p, status: 'conflict', linkedQuickbooksNumber: null, linkedToPoNumber: 'PO-2026-0090' };
      default: return { ...p, status: 'not_found' };
    }
  }),
  counts: {},
});

const upload = async (user, text = EXPORT, name = 'qb.csv') => {
  const file = new File([text], name, { type: 'text/csv' });
  await user.upload(screen.getByLabelText('QuickBooks PO export file'), file);
};

const openDialog = () => render(<QuickbooksImportDialog open onOpenChange={vi.fn()} onDone={vi.fn()} />);

beforeEach(() => {
  vi.clearAllMocks();
  auth.role = 'manager';
  api.previewQuickbooksImport.mockImplementation(async (pairs) => previewFor(pairs));
  api.applyQuickbooksImport.mockImplementation(async (pairs) => ({
    rows: pairs.map((p) => ({ ...p, status: p.overwrite ? 'overwritten' : 'linked' })),
    counts: { linked: pairs.filter((p) => !p.overwrite).length, overwritten: pairs.filter((p) => p.overwrite).length },
  }));
});

describe('choosing the file and the column', () => {
  it('pre-selects the Num column from the real header row and offers every header', async () => {
    const user = userEvent.setup();
    openDialog();
    await upload(user);

    const select = await screen.findByLabelText('Column with the QuickBooks PO number');
    expect(select).toHaveValue('Num');
    expect(within(select).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Choose a column', 'Date', 'Num', 'Vendor', 'Memo', 'Amount', 'Status']);
  });

  it('keeps "Check the file" off until a column is chosen', async () => {
    const user = userEvent.setup();
    openDialog();
    expect(screen.getByRole('button', { name: 'Check the file' })).toBeDisabled();
    await upload(user, 'Date,Vendor,Memo\n2026-10-01,Acme,PO-2026-0101');
    const select = await screen.findByLabelText('Column with the QuickBooks PO number');
    expect(select).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Check the file' })).toBeDisabled();
    await user.selectOptions(select, 'Memo');
    expect(screen.getByRole('button', { name: 'Check the file' })).toBeEnabled();
  });

  it('says so when the file cannot be read', async () => {
    const user = userEvent.setup({ applyAccept: false });
    openDialog();
    await upload(user, 'x', 'notes.pdf');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot read \.pdf files/);
  });
});

describe('the preview', () => {
  const toPreview = async (user) => {
    openDialog();
    await upload(user);
    await user.click(await screen.findByRole('button', { name: 'Check the file' }));
    await screen.findByRole('button', { name: 'Continue to confirm' });
  };

  it('sends only the safe rows to the server, once', async () => {
    const user = userEvent.setup();
    await toPreview(user);
    expect(api.previewQuickbooksImport).toHaveBeenCalledTimes(1);
    expect(api.previewQuickbooksImport).toHaveBeenCalledWith([
      { poNumber: 'PO-2026-0101', quickbooksNumber: '1001' },
      { poNumber: 'PO-2026-0102', quickbooksNumber: '1002' },
      { poNumber: 'PO-2026-0103', quickbooksNumber: '1003' },
      { poNumber: 'PO-2026-0104', quickbooksNumber: '1004' },
      { poNumber: 'PO-2026-0999', quickbooksNumber: '1005' },
    ]);
  });

  it('counts every status', async () => {
    const user = userEvent.setup();
    await toPreview(user);
    // 2 rows share 7000 + 2 rows share 0107 + 1 row with two POs = 5 to review
    const line = screen.getByText((_, el) => el.tagName === 'P' && /will link ·/.test(el.textContent)).textContent;
    expect(line).toMatch(/1 will link/);
    expect(line).toMatch(/1 already linked/);
    expect(line).toMatch(/2 conflicts/);
    expect(line).toMatch(/5 need review/);
    expect(line).toMatch(/1 not found/);
    expect(line).toMatch(/1 without a PO number/);
  });

  it('keeps conflicts collapsed, with a count, until opened', async () => {
    const user = userEvent.setup();
    await toPreview(user);
    const header = screen.getByRole('button', { name: /2 conflicts: not applied unless you tick them/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Moves from PO-2026-0090')).not.toBeInTheDocument();

    await user.click(header);
    expect(screen.getByText(/Moves from PO-2026-0090/)).toBeInTheDocument();
    expect(screen.getByText('Replaces OLD-3')).toBeInTheDocument();
  });

  it('shows the full detail of a conflict on request', async () => {
    const user = userEvent.setup();
    await toPreview(user);
    await user.click(screen.getByRole('button', { name: /2 conflicts/ }));
    expect(screen.queryByText(/becomes unlinked/)).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Details' })[1]);
    expect(screen.getByText(/PO-2026-0090 becomes unlinked/)).toBeInTheDocument();
  });

  it('lists why each needs-review row cannot be applied, with no tickbox', async () => {
    const user = userEvent.setup();
    await toPreview(user);
    await user.click(screen.getByRole('button', { name: /5 need review/ }));
    expect(screen.getByText('This row has more than one PO number.')).toBeInTheDocument();
    expect(screen.getAllByText('This PO number is in more than one row.')).toHaveLength(2);
    expect(screen.getAllByText('This QuickBooks number is in more than one row with different PO numbers.')).toHaveLength(2);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('collapses rows with no PO number, and lists PO numbers that were not found', async () => {
    const user = userEvent.setup();
    await toPreview(user);
    const noPo = screen.getByRole('button', { name: /1 row has no PO number/ });
    expect(noPo).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: /1 PO number not found/ }));
    expect(screen.getByText('PO-2026-0999')).toBeInTheDocument();
  });
});

describe('ticking conflicts and confirming', () => {
  const toConfirmStep = async (user, { tick = [] } = {}) => {
    openDialog();
    await upload(user);
    await user.click(await screen.findByRole('button', { name: 'Check the file' }));
    await screen.findByRole('button', { name: 'Continue to confirm' });
    if (tick.length) {
      await user.click(screen.getByRole('button', { name: /2 conflicts/ }));
      for (const po of tick) await user.click(screen.getByRole('checkbox', { name: new RegExp(po) }));
    }
    await user.click(screen.getByRole('button', { name: 'Continue to confirm' }));
  };

  it('applies conflicts only when ticked, and sends overwrite only for those', async () => {
    const user = userEvent.setup();
    await toConfirmStep(user, { tick: ['PO-2026-0104'] });

    expect(screen.getByText('1 will link.')).toBeInTheDocument();
    expect(screen.getByText('1 link will move to a different PO, which becomes unlinked.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Link 2 QuickBooks numbers' }));
    await waitFor(() => expect(api.applyQuickbooksImport).toHaveBeenCalledTimes(1));
    expect(api.applyQuickbooksImport).toHaveBeenCalledWith([
      { poNumber: 'PO-2026-0101', quickbooksNumber: '1001', overwrite: false },
      { poNumber: 'PO-2026-0104', quickbooksNumber: '1004', overwrite: true },
    ]);
  });

  it('applies no conflict when none is ticked', async () => {
    const user = userEvent.setup();
    await toConfirmStep(user);
    expect(screen.getByText('1 will link.')).toBeInTheDocument();
    expect(screen.queryByText(/will move/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Link 1 QuickBooks number' }));
    await waitFor(() => expect(api.applyQuickbooksImport).toHaveBeenCalled());
    expect(api.applyQuickbooksImport.mock.calls[0][0]).toEqual([
      { poNumber: 'PO-2026-0101', quickbooksNumber: '1001', overwrite: false },
    ]);
  });

  it('shows totals, then names the affected POs only after "Show which"', async () => {
    const user = userEvent.setup();
    await toConfirmStep(user, { tick: ['PO-2026-0103', 'PO-2026-0104'] });

    expect(screen.getByText('1 link will move to a different PO, which becomes unlinked.')).toBeInTheDocument();
    expect(screen.getByText('1 PO will switch to a different QuickBooks PO number.')).toBeInTheDocument();
    expect(screen.queryByText(/PO-2026-0090 becomes unlinked/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show which' }));
    expect(screen.getByText(/1004 moves from PO-2026-0090 to PO-2026-0104/)).toBeInTheDocument();
    expect(screen.getByText('PO-2026-0103 changes from OLD-3 to 1003.')).toBeInTheDocument();
  });

  it('goes back to the preview with the ticks kept', async () => {
    const user = userEvent.setup();
    await toConfirmStep(user, { tick: ['PO-2026-0104'] });
    await user.click(screen.getByRole('button', { name: 'Back to the preview' }));
    await user.click(screen.getByRole('button', { name: /2 conflicts/ }));
    expect(screen.getByRole('checkbox', { name: /PO-2026-0104/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /PO-2026-0103/ })).not.toBeChecked();
  });

  it('summarises the result and tells the page to reload', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onOpenChange = vi.fn();
    render(<QuickbooksImportDialog open onOpenChange={onOpenChange} onDone={onDone} />);
    await upload(user);
    await user.click(await screen.findByRole('button', { name: 'Check the file' }));
    await user.click(await screen.findByRole('button', { name: 'Continue to confirm' }));
    await user.click(screen.getByRole('button', { name: 'Link 1 QuickBooks number' }));

    expect(await screen.findByText('1 link saved.')).toBeInTheDocument();
    expect(screen.getByText('1 linked')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(onDone).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the user on the confirm step with the error when applying fails', async () => {
    api.applyQuickbooksImport.mockRejectedValue(new Error('A QuickBooks number was linked by someone else while this ran. Nothing was changed. Preview the file again.'));
    const user = userEvent.setup();
    await toConfirmStep(user);
    await user.click(screen.getByRole('button', { name: 'Link 1 QuickBooks number' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Nothing was changed/);
    expect(screen.getByRole('button', { name: 'Link 1 QuickBooks number' })).toBeEnabled();
  });
});

describe('a file with nothing to link', () => {
  it('skips the server and offers no way to continue', async () => {
    const user = userEvent.setup();
    openDialog();
    await upload(user, 'Date,Num,Memo\n2026-10-01,1,Printer paper');
    await user.click(await screen.findByRole('button', { name: 'Check the file' }));
    expect(await screen.findByText(/0 will link/)).toBeInTheDocument();
    expect(api.previewQuickbooksImport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue to confirm' })).toBeDisabled();
  });
});

describe('the Purchase orders header', () => {
  it('offers the import to a manager', async () => {
    render(<PurchaseOrdersPage />);
    expect(await screen.findByRole('button', { name: 'Import QuickBooks links' })).toBeInTheDocument();
  });

  it('does not offer it to anyone else', async () => {
    auth.role = 'warehouse_worker';
    render(<PurchaseOrdersPage />);
    await screen.findByRole('heading', { name: 'Purchase orders' });
    expect(screen.queryByRole('button', { name: 'Import QuickBooks links' })).not.toBeInTheDocument();
  });
});
