// ─────────────────────────────────────────────────────────────
// src/tests/ListPattern.test.jsx
//
// The shared manager-list pieces in components/ui: view tabs, the list
// toolbar, the bulk-action bar and the detail panel. Inventory is the
// first screen built from them; the rest follow, so their behaviour is
// pinned here rather than through one page.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewTabs from '@/components/ui/view-tabs';
import ListToolbar from '@/components/ui/list-toolbar';
import BulkActionBar from '@/components/ui/bulk-action-bar';
import DetailPanel from '@/components/ui/detail-panel';

const TABS = [
  { id: 'all', label: 'All', count: 12 },
  { id: 'low', label: 'Low stock', count: 3 },
  { id: 'short', label: 'Shortfall', count: 2, alert: true },
];

describe('ViewTabs', () => {
  it('marks the current tab and shows each count', () => {
    render(<ViewTabs tabs={TABS} value="low" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Low stock 3' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'All 12' })).toHaveAttribute('aria-selected', 'false');
  });

  it('puts only the current tab in the Tab order', () => {
    render(<ViewTabs tabs={TABS} value="all" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /Low stock/ })).toHaveAttribute('tabindex', '-1');
  });

  it('moves with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ViewTabs tabs={TABS} value="all" onChange={onChange} />);

    screen.getByRole('tab', { name: /All/ }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('short');
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('all');
  });
});

describe('ListToolbar', () => {
  const filters = (active, onToggle = vi.fn()) => [
    { key: 'a', label: 'Has committed stock', active: active.includes('a'), onToggle },
    { key: 'b', label: 'At or below reorder level', active: active.includes('b'), onToggle },
  ];

  it('shows an active filter as a chip that removes it', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ListToolbar filters={filters(['a'], onToggle)} />);

    await user.click(screen.getByRole('button', { name: 'Remove filter: Has committed stock' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Remove filter: At or below/ })).not.toBeInTheDocument();
  });

  it('offers Clear all only when more than one thing is narrowing the list', () => {
    const { rerender } = render(<ListToolbar filters={filters(['a'])} onClearAll={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();

    rerender(<ListToolbar filters={filters(['a', 'b'])} onClearAll={() => {}} />);
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
  });

  it('hides Export when there is nothing to export', () => {
    const { rerender } = render(<ListToolbar />);
    expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
    rerender(<ListToolbar onExport={() => {}} />);
    expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument();
  });

  it('labels the search box by its placeholder', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ListToolbar search={{ value: '', onChange, placeholder: 'Search by product' }} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search by product' }), 'r');
    expect(onChange).toHaveBeenCalledWith('r');
  });
});

describe('BulkActionBar', () => {
  it('renders nothing with nothing selected', () => {
    const { container } = render(<BulkActionBar count={0} onClear={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says how many, in the singular when it is one', () => {
    const { rerender } = render(<BulkActionBar count={1} noun="products" onClear={() => {}} />);
    expect(screen.getByText('1 product selected')).toBeInTheDocument();
    rerender(<BulkActionBar count={4} noun="products" onClear={() => {}} />);
    expect(screen.getByText('4 products selected')).toBeInTheDocument();
  });

  it('clears the selection', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<BulkActionBar count={2} onClear={onClear}><button type="button">Go</button></BulkActionBar>);

    await user.click(screen.getByRole('button', { name: /Clear selection/ }));
    expect(onClear).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });
});

describe('DetailPanel', () => {
  it('shows the record as a dialog with its title, eyebrow and actions', () => {
    render(
      <DetailPanel open onClose={() => {}} eyebrow="RICE-10" title="Rice" actions={<button type="button">Adjust</button>}>
        <p>Body</p>
      </DetailPanel>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Rice' });
    expect(dialog).toHaveTextContent('RICE-10');
    expect(dialog).toHaveTextContent('Body');
    expect(screen.getByRole('button', { name: 'Adjust' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DetailPanel open onClose={onClose} title="Rice"><p>Body</p></DetailPanel>);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
