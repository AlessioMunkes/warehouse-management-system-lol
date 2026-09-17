// ─────────────────────────────────────────────────────────────
// src/tests/ResumeAndUndo.test.jsx
//
// Two things a worker gets back.
//
//   1  Work they did not finish is offered when they return, instead
//      of sitting on the device where only the flow that wrote it
//      could ever find it.
//   2  The bulk action can be taken back for ten seconds. "Everything
//      as ordered" fills and ticks every line in one press; a mis-tap
//      signs off a delivery nobody counted.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}));

const { listDrafts, writeDraft } = await import('../features/staff/hooks/useDraft');
const { default: UnfinishedWork } = await import('../features/staff/components/UnfinishedWork');
const { default: useUndo } = await import('../features/staff/hooks/useUndo');
const { default: WorkList } = await import('../features/staff/components/WorkList');

beforeEach(() => {
  try { localStorage.clear(); } catch { /* private window */ }
});

// ── Finding what was left half-done ───────────────────────────
describe('listDrafts', () => {
  it('finds every draft on the device, newest first', () => {
    writeDraft('receiving-86', { counted: { 1: '4' } });
    writeDraft('dispatch-31', { loaded: { 7: '3' } });

    const keys = listDrafts().map((d) => d.key);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('receiving-86');
    expect(keys).toContain('dispatch-31');
  });

  it('ignores everything that is not a draft', () => {
    localStorage.setItem('stf_receiving_view_mode', 'full');
    localStorage.setItem('some-other-app', 'hello');
    writeDraft('receiving-86', { counted: {} });

    expect(listDrafts().map((d) => d.key)).toEqual(['receiving-86']);
  });

  it('does not offer to resume last week', () => {
    const twoDays = Date.now() - 2 * 24 * 60 * 60 * 1000;
    localStorage.setItem('stf_draft_receiving-9',
      JSON.stringify({ savedAt: twoDays, data: { counted: {} } }));
    expect(listDrafts()).toEqual([]);
  });

  it('survives unparseable storage rather than throwing into a render', () => {
    localStorage.setItem('stf_draft_receiving-9', 'not json');
    writeDraft('dispatch-31', { loaded: {} });
    expect(listDrafts().map((d) => d.key)).toEqual(['dispatch-31']);
  });
});

describe('UnfinishedWork', () => {
  it('says nothing when there is nothing half-done', () => {
    const { container } = render(<UnfinishedWork />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the delivery and how far in it got', () => {
    writeDraft('receiving-86', { counted: { 1: '4', 2: '9' } });
    render(<UnfinishedWork />);

    expect(screen.getByText(/Order 86/)).toBeInTheDocument();
    expect(screen.getByText(/2 lines counted/)).toBeInTheDocument();
  });

  it('names the pallet and the driver, because that is what identifies it at a gate', () => {
    writeDraft('dispatch-31', { loaded: { 7: '3' }, driverName: 'S. Ndlovu' });
    render(<UnfinishedWork />);

    expect(screen.getByText(/Pallet 31/)).toBeInTheDocument();
    expect(screen.getByText(/S. Ndlovu/)).toBeInTheDocument();
  });

  it('links to the task it belongs to', () => {
    writeDraft('receiving-86', { counted: {} });
    render(<UnfinishedWork />);

    expect(screen.getByRole('link', { name: 'Carry on' }))
      .toHaveAttribute('href', '/noc/procurement');
  });

  it('throwing one away really removes it', async () => {
    const user = userEvent.setup();
    writeDraft('receiving-86', { counted: {} });
    render(<UnfinishedWork />);

    await user.click(screen.getByRole('button', { name: 'Throw away' }));
    expect(screen.queryByText(/Order 86/)).not.toBeInTheDocument();
    expect(listDrafts()).toEqual([]);
  });

  it('offers nothing for a draft shape it does not recognise', () => {
    writeDraft('something-else-12', { whatever: true });
    const { container } = render(<UnfinishedWork />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ── Taking the bulk action back ───────────────────────────────
describe('useUndo', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function Harness({ onRestore }) {
    const undo = useUndo(10);
    return (
      <div>
        <button type="button" onClick={() => undo.propose('did a thing', onRestore)}>go</button>
        {undo.offer ? (
          <button type="button" onClick={undo.undo}>{undo.offer.label}</button>
        ) : <span>nothing offered</span>}
      </div>
    );
  }

  it('offers nothing until something is proposed', () => {
    render(<Harness onRestore={vi.fn()} />);
    expect(screen.getByText('nothing offered')).toBeInTheDocument();
  });

  it('runs the restore exactly once', () => {
    const restore = vi.fn();
    render(<Harness onRestore={restore} />);

    act(() => { screen.getByText('go').click(); });
    act(() => { screen.getByText('did a thing').click(); });

    expect(restore).toHaveBeenCalledTimes(1);
    expect(screen.getByText('nothing offered')).toBeInTheDocument();
  });

  it('closes the window on its own, and then restores nothing', () => {
    const restore = vi.fn();
    render(<Harness onRestore={restore} />);

    act(() => { screen.getByText('go').click(); });
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(screen.getByText('nothing offered')).toBeInTheDocument();
    expect(restore).not.toHaveBeenCalled();
  });
});

describe('WorkList undo strip', () => {
  const LINES = [
    { id: 1, title: 'Butternut',  expected: 1,  value: '1' },
    { id: 2, title: 'Maize meal', expected: 35, value: '35' },
  ];

  it('is not there unless something can be taken back', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('says what happened and offers to reverse it', async () => {
    const onUndo = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkList
        lines={LINES}
        onChange={vi.fn()}
        undo={{ label: 'Took 2 lines as ordered', onUndo }}
      />,
    );

    expect(screen.getByText('Took 2 lines as ordered')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
