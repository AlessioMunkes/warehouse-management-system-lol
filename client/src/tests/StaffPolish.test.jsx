// ─────────────────────────────────────────────────────────────
// StaffPolish.test.jsx
//
// The three things script 21 changed that have real invariants:
//
//   1  Guided has to be visibly a different mode from Form. That was
//      the actual complaint — both rendered the same list — so it is
//      worth a test that fails if the distinction is ever dropped.
//   2  The pager must never strand a viewer on a page that no longer
//      exists, and must disappear entirely on a short list.
//   3  Decanting must not be a dialog again. It was converted twice
//      (once in spirit in script 20, missed; once here), which is
//      exactly the kind of thing that comes back in a merge.
//
// DecantingSheetPDF and the decanting API are mocked; everything else
// is the real component.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/decantingAPI', () => ({
  calculateDecantingPlan: vi.fn(),
  recordDecanting: vi.fn(),
  getDecantingRecords: vi.fn(),
  getDecantingById: vi.fn(),
}));
vi.mock('../features/decanting/components/DecantingSheetPDF', () => ({
  default: () => null,
}));

const { default: WorkList } = await import('../features/staff/components/WorkList');
const { default: Paged } = await import('../features/staff/components/Paged');
const { default: usePaged } = await import('../features/staff/hooks/usePaged');
const { default: DecantingFlow } = await import('../features/decanting/components/DecantingFlow');
const decantingAPI = await import('../services/decantingAPI');

const LINES = [
  { id: 1, title: 'Butternut',  sku: 'VEG-BUTT',   expected: 1,  unit: 'crate', value: '1'  },
  { id: 2, title: 'Maize meal', sku: 'MEAL-MAIZE', expected: 35, unit: 'kg',    value: '35' },
  { id: 3, title: 'Pilchards',  sku: 'FISH-400',   expected: 12, unit: 'tin',   value: ''   },
];

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* private window */ }
});

// ── 1 · Guided is a mode you can see ──────────────────────────
describe('WorkList guided mode', () => {
  it('is not marked as guided by default', () => {
    const { container } = render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(container.querySelector('.stf-wl.is-guided')).toBeNull();
  });

  it('marks the list and says which item you are on', () => {
    const { container } = render(
      <WorkList lines={LINES} guided focusId={2} onChange={vi.fn()} onFocus={vi.fn()} />,
    );
    expect(container.querySelector('.stf-wl.is-guided')).not.toBeNull();
    expect(screen.getByText('Item 2 of 3')).toBeInTheDocument();
  });

  it('puts the position on the focused line only', () => {
    render(<WorkList lines={LINES} guided focusId={2} onChange={vi.fn()} onFocus={vi.fn()} />);
    expect(screen.queryByText('Item 1 of 3')).not.toBeInTheDocument();
    expect(screen.queryByText('Item 3 of 3')).not.toBeInTheDocument();
  });

  it('says nothing about position in Form mode, even with a focused row', () => {
    render(<WorkList lines={LINES} focusId={2} onChange={vi.fn()} onFocus={vi.fn()} />);
    expect(screen.queryByText(/Item \d of \d/)).not.toBeInTheDocument();
  });

  it('shows one line at a time', () => {
    render(<WorkList lines={LINES} guided focusId={2} onChange={vi.fn()} onFocus={vi.fn()} />);
    expect(screen.getByText('Maize meal')).toBeInTheDocument();
    expect(screen.queryByText('Butternut')).not.toBeInTheDocument();
    expect(screen.queryByText('Pilchards')).not.toBeInTheDocument();
  });

  it('shows every line in Form mode', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(screen.getByText('Butternut')).toBeInTheDocument();
    expect(screen.getByText('Maize meal')).toBeInTheDocument();
    expect(screen.getByText('Pilchards')).toBeInTheDocument();
  });

  it('pages backwards as well as forwards — the old Guided could not', async () => {
    const onFocus = vi.fn();
    const user = userEvent.setup();
    render(<WorkList lines={LINES} guided focusId={2} onChange={vi.fn()} onFocus={onFocus} />);

    await user.click(screen.getByRole('button', { name: 'Previous item' }));
    expect(onFocus).toHaveBeenLastCalledWith(1);

    await user.click(screen.getByRole('button', { name: 'Next item' }));
    expect(onFocus).toHaveBeenLastCalledWith(3);
  });

  it('stops at both ends', () => {
    const { rerender } = render(
      <WorkList lines={LINES} guided focusId={1} onChange={vi.fn()} onFocus={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Previous item' })).toBeDisabled();

    rerender(<WorkList lines={LINES} guided focusId={3} onChange={vi.fn()} onFocus={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next item' })).toBeDisabled();
  });

  it('falls back to the first line when the focus does not match anything', () => {
    const onFocus = vi.fn();
    render(<WorkList lines={LINES} guided focusId={null} onChange={vi.fn()} onFocus={onFocus} />);
    expect(onFocus).toHaveBeenCalledWith(1);
  });

  it('no pager on a one-line job', () => {
    render(<WorkList lines={[LINES[0]]} guided focusId={1} onChange={vi.fn()} onFocus={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Next item' })).not.toBeInTheDocument();
  });
});

// ── The confirm tick ──────────────────────────────────────────
describe('WorkList confirm', () => {
  it('draws no tick unless a handler is given', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Confirm Butternut/ })).not.toBeInTheDocument();
  });

  it('counts filled lines when there is nothing to confirm', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(screen.getByText(/2 of 3 checked/)).toBeInTheDocument();
  });

  it('counts confirmations instead once the tick is on', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} confirmed={[1]} onConfirm={vi.fn()} />);
    // Two lines are filled, one is confirmed. Confirmed is the honest
    // number: a pre-filled quantity nobody looked at is not a check.
    expect(screen.getByText(/1 of 3 confirmed/)).toBeInTheDocument();
  });

  it('toggles the line it was pressed on', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<WorkList lines={LINES} onChange={vi.fn()} confirmed={[]} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Confirm Maize meal' }));
    expect(onConfirm).toHaveBeenCalledWith(2);
  });

  it('confirming in Guided moves to the next item, because it is one decision', async () => {
    const onConfirm = vi.fn();
    const onFocus = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkList
        lines={LINES}
        guided
        focusId={1}
        onChange={vi.fn()}
        onFocus={onFocus}
        confirmed={[]}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Confirm Butternut' }));
    expect(onConfirm).toHaveBeenCalledWith(1);
    expect(onFocus).toHaveBeenLastCalledWith(2);
  });

  it('un-confirming does not move you on', async () => {
    const onConfirm = vi.fn();
    const onFocus = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkList
        lines={LINES}
        guided
        focusId={1}
        onChange={vi.fn()}
        onFocus={onFocus}
        confirmed={[1]}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Butternut confirmed' }));
    expect(onConfirm).toHaveBeenCalledWith(1);
    expect(onFocus).not.toHaveBeenCalled();
  });
});

// ── 2 · The pager ─────────────────────────────────────────────
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

function Harness({ items, size }) {
  const paged = usePaged(items, size);
  return (
    <div>
      <ul>{paged.slice.map((r) => <li key={r.id}>row {r.id}</li>)}</ul>
      <Paged {...paged} noun="pallets" />
    </div>
  );
}

describe('pagination', () => {
  it('shows nothing at all when everything fits on one page', () => {
    render(<Harness items={rows(5)} size={8} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('slices the list and says where you are', () => {
    render(<Harness items={rows(23)} size={8} />);
    expect(screen.getByText('row 1')).toBeInTheDocument();
    expect(screen.queryByText('row 9')).not.toBeInTheDocument();
    expect(screen.getByText(/1.*8 of 23 pallets/)).toBeInTheDocument();
  });

  it('moves a page at a time and stops at both ends', async () => {
    const user = userEvent.setup();
    render(<Harness items={rows(23)} size={8} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('row 9')).toBeInTheDocument();
    expect(screen.queryByText('row 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('row 23')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('does not strand you on a page that no longer exists', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness items={rows(23)} size={8} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('row 23')).toBeInTheDocument();

    // A filter shortens the list under the viewer. Without the clamp
    // this renders an empty list with no explanation.
    rerender(<Harness items={rows(4)} size={8} />);
    await waitFor(() => expect(screen.getByText('row 1')).toBeInTheDocument());
  });
});

// ── 3 · Decanting is a page, not a pop-up ─────────────────────
const PRODUCTS = [
  { id: 7, name: 'Maize Meal', weight_kg: 50 },
  { id: 8, name: 'Sugar Beans', weight_kg: 25 },
];

const PLAN = {
  plans: [{
    productId: 7,
    bags: { '2kg': 11, '500g': 6 },
    surplusKg: 0.4,
    isBulkLimited: false,
  }],
};

const startASack = async (user) => {
  render(<DecantingFlow products={PRODUCTS} />);
  await user.click(screen.getByRole('radio', { name: /Maize Meal/ }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
};

describe('DecantingFlow', () => {
  it('opens on picking the sack', () => {
    render(<DecantingFlow products={PRODUCTS} />);
    expect(screen.getByText('What are you decanting?')).toBeInTheDocument();
  });

  it('narrows the sack list as you type', async () => {
    const user = userEvent.setup();
    render(<DecantingFlow products={PRODUCTS} />);

    await user.type(screen.getByLabelText('Search products'), 'sugar');
    expect(screen.getByRole('radio', { name: /Sugar Beans/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Maize Meal/ })).not.toBeInTheDocument();
  });

  it('says so when nothing matches, and offers a way back', async () => {
    const user = userEvent.setup();
    render(<DecantingFlow products={PRODUCTS} />);

    await user.type(screen.getByLabelText('Search products'), 'zzz');
    expect(screen.getByText(/No products match/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show everything again' }));
    expect(screen.getByRole('radio', { name: /Maize Meal/ })).toBeInTheDocument();
  });

  it('takes a double-click straight to the work page', async () => {
    const user = userEvent.setup();
    render(<DecantingFlow products={PRODUCTS} />);

    await user.dblClick(screen.getByRole('radio', { name: /Maize Meal/ }));
    expect(screen.getByRole('heading', { name: 'Maize Meal' })).toBeInTheDocument();
  });

  // The shortcut stays; the label telling everyone about it does not.
  it('does not advertise the double-click on the screen', async () => {
    const user = userEvent.setup();
    render(<DecantingFlow products={PRODUCTS} />);

    await user.click(screen.getByRole('radio', { name: /Maize Meal/ }));
    expect(screen.queryByText(/double-click/i)).not.toBeInTheDocument();
  });

  it('works on a page, never in a dialog', async () => {
    const user = userEvent.setup();
    await startASack(user);

    // The whole point of the rework. A dialog here is the regression.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // The sack's name is the page heading now, not a dialog title.
    expect(screen.getByRole('heading', { name: 'Maize Meal' })).toBeInTheDocument();
  });

  it('shows the three parts of the job as panels', async () => {
    const user = userEvent.setup();
    await startASack(user);

    expect(screen.getByText('On the scale')).toBeInTheDocument();
    expect(screen.getByText('Bag this many')).toBeInTheDocument();
    expect(screen.getByText('What you actually got')).toBeInTheDocument();
  });

  it('will not let you save before the bags have been worked out', async () => {
    const user = userEvent.setup();
    await startASack(user);

    expect(screen.getByRole('button', { name: 'Save this sack' })).toBeDisabled();
    // And says why, rather than leaving a dead button.
    expect(screen.getByText(/Still needed/)).toBeInTheDocument();
  });

  it('asks the server for the split and counts back against it', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockResolvedValue(PLAN);
    await startASack(user);

    await user.type(screen.getByLabelText('Kilograms on the scale'), '48');
    await user.type(screen.getByLabelText(/Kilograms the centres need/), '30');
    await user.click(screen.getByRole('button', { name: 'Work out the bags' }));

    await waitFor(() =>
      expect(decantingAPI.calculateDecantingPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ productId: 7, actualBulkKg: 48, requiredKg: 30 })],
        }),
      ),
    );

    // Guided lands on the bag instruction, and it is a read, not a form.
    expect(await screen.findByText('bags of 2kg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'I have filled them' }));
    expect(await screen.findByText('2kg bags')).toBeInTheDocument();
    // Seeded from the plan: a run that went as instructed needs no typing.
    expect(screen.getByLabelText('2kg bags, quantity')).toHaveValue('11');
  });

  it('sends the payload the service expects, unchanged', async () => {
    const user = userEvent.setup();
    decantingAPI.calculateDecantingPlan.mockResolvedValue(PLAN);
    decantingAPI.recordDecanting.mockResolvedValue({ id: 1 });
    await startASack(user);

    await user.type(screen.getByLabelText('Kilograms on the scale'), '48');
    await user.type(screen.getByLabelText(/Kilograms the centres need/), '30');
    await user.click(screen.getByRole('button', { name: 'Work out the bags' }));
    await screen.findByText('bags of 2kg');

    await user.click(screen.getByRole('button', { name: 'Save this sack' }));

    await waitFor(() =>
      expect(decantingAPI.recordDecanting).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ productId: 7, requiredKg: 30, actualBulkKg: 48, wastageKg: 0 }],
        }),
      ),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});
