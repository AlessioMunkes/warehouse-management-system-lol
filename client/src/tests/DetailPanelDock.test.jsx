// ─────────────────────────────────────────────────────────────
// src/tests/DetailPanelDock.test.jsx
//
// A record docked beside its list: no dialog, no overlay, the list
// still clickable, and the tables told how much room is left.
// ─────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DetailPanel from '@/components/ui/detail-panel';
import { DetailDockContext, setDockWidth, useDockWidth } from '@/components/layout/detailDock';
import useTableView from '../features/masterdata/useTableView';

const wideScreen = (matches) => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches, addEventListener: () => {}, removeEventListener: () => {},
  });
};

function Shell({ onClose, onRow }) {
  const [dock, setDock] = useState(null);
  return (
    <div>
      <DetailDockContext.Provider value={dock}>
        <button type="button" onClick={onRow}>Another row</button>
        <DetailPanel open onClose={onClose} eyebrow="PO-0007" title="Fresh Farms" actions={<button type="button">Approve</button>}>
          <p>Three lines</p>
        </DetailPanel>
      </DetailDockContext.Provider>
      <div ref={setDock} data-testid="dock" />
    </div>
  );
}

beforeEach(() => wideScreen(true));
afterEach(() => setDockWidth(0));

describe('DetailPanel, docked', () => {
  it('opens in the dock beside the list, not as a dialog over it', async () => {
    render(<Shell onClose={() => {}} onRow={() => {}} />);
    const panel = await screen.findByRole('region', { name: 'Fresh Farms' });
    expect(screen.getByTestId('dock')).toContainElement(panel);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('PO-0007')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('leaves the list clickable while a record is open', async () => {
    const user = userEvent.setup();
    const onRow = vi.fn();
    const onClose = vi.fn();
    render(<Shell onClose={onClose} onRow={onRow} />);
    await screen.findByRole('region', { name: 'Fresh Farms' });
    await user.click(screen.getByRole('button', { name: 'Another row' }));
    expect(onRow).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from the × and from Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Shell onClose={onClose} onRow={() => {}} />);
    await screen.findByRole('region', { name: 'Fresh Farms' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is still a dialog over the page on a narrow screen', async () => {
    wideScreen(false);
    render(<Shell onClose={() => {}} onRow={() => {}} />);
    expect(await screen.findByRole('dialog', { name: 'Fresh Farms' })).toBeInTheDocument();
  });
});

describe('useTableView beside a docked record', () => {
  const COLUMNS = [
    { key: 'name', label: 'Name', alwaysOn: true },
    { key: 'expected', label: 'Expected', minWidth: 'md' },
    { key: 'value', label: 'Value', minWidth: 'lg' },
  ];

  it('drops the columns that no longer fit, and brings them back', () => {
    window.innerWidth = 1440;
    const { result, rerender } = renderHook(() => { useDockWidth(); return useTableView('dock-test', COLUMNS); });
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['name', 'expected', 'value']);

    setDockWidth(480);
    rerender();
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['name', 'expected']);

    setDockWidth(0);
    rerender();
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(['name', 'expected', 'value']);
  });
});
