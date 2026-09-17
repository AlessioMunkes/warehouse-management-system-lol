// ─────────────────────────────────────────────────────────────
// StaffWorkList.test.jsx
//
// The pieces the staff-flow rework turns on:
//   - a line list dense enough to see a whole job at once
//   - "everything as expected" filling only what is still blank
//   - drafts surviving a reload without ever submitting anything
//
// The flows themselves (ReceivingFlow, PalletCheck) are covered by
// DispatchWiring.test.jsx and by hand; these are the shared parts that
// both depend on and that have real invariants worth pinning.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { default: WorkList } = await import('../features/staff/components/WorkList');
const { readDraft, writeDraft, clearDraft } = await import('../features/staff/hooks/useDraft');

const LINES = [
  { id: 1, title: 'Butternut',   sku: 'VEG-BUTT',   expected: 1,  unit: 'crate', value: '1'  },
  { id: 2, title: 'Maize meal',  sku: 'MEAL-MAIZE', expected: 35, unit: 'kg',    value: '35' },
  { id: 3, title: 'Pilchards',   sku: 'FISH-400',   expected: 12, unit: 'tin',   value: ''   },
];

beforeEach(() => {
  try { localStorage.clear(); } catch { /* private window */ }
});

describe('WorkList', () => {
  it('shows every line at once rather than one at a time', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(screen.getByText('Butternut')).toBeInTheDocument();
    expect(screen.getByText('Maize meal')).toBeInTheDocument();
    expect(screen.getByText('Pilchards')).toBeInTheDocument();
  });

  it('reports progress across the whole job', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(screen.getByText(/2 of 3 checked/)).toBeInTheDocument();
  });

  it('counts how many lines differ from what was expected', () => {
    const varied = [{ ...LINES[0], value: '0' }, LINES[1], LINES[2]];
    render(<WorkList lines={varied} onChange={vi.fn()} />);
    expect(screen.getByText(/1 different/)).toBeInTheDocument();
  });

  it('offers accept-all only while something is unfilled', () => {
    const { rerender } = render(<WorkList lines={LINES} onChange={vi.fn()} onAcceptAll={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Everything as expected/ })).toBeInTheDocument();

    rerender(
      <WorkList
        lines={LINES.map((l) => ({ ...l, value: String(l.expected) }))}
        onChange={vi.fn()}
        onAcceptAll={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Everything as expected/ })).not.toBeInTheDocument();
  });

  it('steps a quantity by one without opening a keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkList lines={LINES} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'One more Maize meal' }));
    expect(onChange).toHaveBeenLastCalledWith(2, '36');

    await user.click(screen.getByRole('button', { name: 'One fewer Maize meal' }));
    expect(onChange).toHaveBeenLastCalledWith(2, '34');
  });

  it('never steps below zero', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkList lines={[{ ...LINES[0], value: '0' }]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'One fewer Butternut' }));
    expect(onChange).toHaveBeenLastCalledWith(1, '0');
  });

  it('opens the detail accordion only for the focused line', () => {
    render(
      <WorkList
        lines={LINES}
        focusId={2}
        onChange={vi.fn()}
        renderDetail={(line) => <p>detail for {line.title}</p>}
      />,
    );
    expect(screen.getByText('detail for Maize meal')).toBeInTheDocument();
    expect(screen.queryByText('detail for Butternut')).not.toBeInTheDocument();
  });

  it('normalises a comma to a full stop, since a ZA keyboard makes both', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkList lines={[{ ...LINES[0], value: '' }]} onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: /Butternut, quantity/ }), '1,5');
    expect(onChange).toHaveBeenLastCalledWith(1, '5');
  });
});

describe('drafts', () => {
  it('round-trips a draft', () => {
    writeDraft('receiving-9', { counted: { 4: '12' } });
    expect(readDraft('receiving-9')).toEqual({ counted: { 4: '12' } });
  });

  it('keeps two jobs apart', () => {
    writeDraft('receiving-9', { counted: { 4: '12' } });
    writeDraft('dispatch-31', { loaded: { 7: '3' } });
    expect(readDraft('receiving-9').counted).toEqual({ 4: '12' });
    expect(readDraft('dispatch-31').loaded).toEqual({ 7: '3' });
  });

  it('clears one without touching the other', () => {
    writeDraft('receiving-9', { counted: {} });
    writeDraft('dispatch-31', { loaded: {} });
    clearDraft('receiving-9');
    expect(readDraft('receiving-9')).toBeNull();
    expect(readDraft('dispatch-31')).not.toBeNull();
  });

  it('ignores a draft older than a day rather than refilling a stale count', () => {
    const twoDays = Date.now() - 2 * 24 * 60 * 60 * 1000;
    localStorage.setItem('stf_draft_receiving-9', JSON.stringify({ savedAt: twoDays, data: { counted: {} } }));
    expect(readDraft('receiving-9')).toBeNull();
  });

  it('survives unparseable storage instead of throwing into a render', () => {
    localStorage.setItem('stf_draft_receiving-9', 'not json');
    expect(readDraft('receiving-9')).toBeNull();
  });

  it('does nothing at all without a key', () => {
    expect(readDraft(null)).toBeNull();
    expect(() => writeDraft(null, { a: 1 })).not.toThrow();
    expect(() => clearDraft(null)).not.toThrow();
  });
});
