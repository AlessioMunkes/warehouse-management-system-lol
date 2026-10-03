// ─────────────────────────────────────────────────────────────
// client/src/tests/DashboardWidgets.test.jsx
//
// The customisable manager/admin dashboard: what each role may add,
// that a saved layout is cleaned on the way in, that the board can
// be customised and remembers it, and that a chart reads the report
// field the server actually sends (`series` — reading `data` is the
// bug that showed "nothing dispatched" with 43 kg dispatched).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WIDGETS, DEFAULT_LAYOUT, widgetsForRole, sizeOf } from '../features/dashboard/widgetCatalog';
import useDashboardLayout, { cleanLayout, layoutKey, panelSlots } from '../features/dashboard/useDashboardLayout';
import { unwrapReport, ragAgainst, byLabel, RAG } from '../features/dashboard/chartTheme';

vi.mock('../services/dashboardAPI', () => ({
  default: {
    getDashboardSummary: vi.fn().mockResolvedValue({
      lowStockCount: 34, belowReorderCount: 0, outOfStockCount: 34, healthyStockCount: 26,
      activeProductCount: 60, openPurchaseOrders: 27, deliveriesExpectedToday: 0,
      pendingDispatchesToday: 0, pendingCommunityRequests: 2,
    }),
    getMyWork: vi.fn().mockResolvedValue({ slipsToPack: 134, deliveriesExpected: 0, palletsAtGate: 15 }),
  },
}));
const runReportMock = vi.fn();
vi.mock('../services/reportingAPI', () => ({
  runReport: (...args) => runReportMock(...args),
  getTargets: () => Promise.resolve({ data: { collection_compliance: { value: 90, better: 'up', label: 'Target 90%' } } }),
}));
const REPORT = {
    series: [{ label: 'soup_kitchen', value: 20 }, { label: 'dignity_kitchen', value: 15 }],
    total: 35, meta: { unit: 'kg' }, chartType: 'bar', description: 'Food dispatched',
};
vi.mock('../services/userAPI', () => ({ getUsers: vi.fn().mockResolvedValue([]) }));
vi.mock('../services/donationManagementAPI', () => ({
  default: { getAttentionCounts: vi.fn().mockResolvedValue({ total: 0 }) },
}));

import CustomisableDashboard from '../features/dashboard/components/CustomisableDashboard';

const manager = { id: 2, role: 'manager', firstName: 'Grizel' };

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* none */ }
  runReportMock.mockReset();
  runReportMock.mockResolvedValue(REPORT);
});

describe('the widget catalogue', () => {
  it('has no duplicate ids, and every widget says what it is', () => {
    const ids = WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WIDGETS) {
      expect(w.title, w.id).toBeTruthy();
      expect(w.description, w.id).toBeTruthy();
      expect(['tile', 'panel'], w.id).toContain(w.kind);
    }
  });

  it('never offers the worker a widget — their dashboard is separate', () => {
    expect(widgetsForRole('warehouse_worker')).toEqual([]);
  });

  it('keeps the admin-only widgets off the manager board', () => {
    const ids = widgetsForRole('manager').map((w) => w.id);
    expect(ids).not.toContain('users');
    expect(ids).not.toContain('donation-queue');
    expect(ids).not.toContain('admin-shortcuts');
  });

  // Two jobs, two boards: a manager runs the floor, an admin looks
  // after what it is built on. No widget is offered to both.
  it('gives the manager and the admin different widgets, apart from notifications', () => {
    const manager = new Set(widgetsForRole('manager').map((w) => w.id));
    const shared = widgetsForRole('admin').filter((w) => manager.has(w.id)).map((w) => w.id);
    // Everyone has notifications; everything else is role-specific.
    expect(shared).toEqual(['notifications']);
  });

  it('offers the admin their own work: accounts, donations, 18A, email, catalogue', () => {
    const ids = widgetsForRole('admin').map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining([
      'users', 'donation-queue', 'certificates-to-issue', 'email-status', 'catalogue-gaps',
    ]));
    expect(ids).not.toContain('low-stock');
  });

  it('starts each role on widgets it is allowed', () => {
    for (const role of ['manager', 'admin']) {
      expect(cleanLayout(DEFAULT_LAYOUT[role], role)).toEqual(DEFAULT_LAYOUT[role]);
    }
  });
});

describe('a saved layout', () => {
  it('drops unknown, duplicate and not-allowed ids', () => {
    expect(cleanLayout(['low-stock', 'gone', 'users', 'low-stock', 'open-pos'], 'manager'))
      .toEqual(['low-stock', 'open-pos']);
  });

  it('is kept per person and per warehouse', () => {
    expect(layoutKey({ id: 2, role: 'manager' })).not.toBe(layoutKey({ id: 3, role: 'manager' }));
    expect(layoutKey({ id: 2, role: 'manager', warehouse: 'EPP' }))
      .not.toBe(layoutKey({ id: 2, role: 'manager', warehouse: 'KHY' }));
  });
});

describe('reading a report', () => {
  it('reads `series`, whether or not it arrives wrapped', () => {
    const rows = [{ label: 'x', value: 1 }];
    expect(unwrapReport({ series: rows }).series).toEqual(rows);
    expect(unwrapReport({ data: { series: rows } }).series).toEqual(rows);
    expect(unwrapReport({ data: [] }).series).toEqual([]);
  });
});

describe('customising the board', () => {
  const renderBoard = () => render(
    <MemoryRouter><CustomisableDashboard user={manager} /></MemoryRouter>,
  );

  it('shows the real figures, including this month’s dispatches', async () => {
    renderBoard();
    expect(await screen.findByText('Low or out of stock')).toBeInTheDocument();
    await waitFor(() => expect(runReportMock).toHaveBeenCalled());
    // The report had rows: it must not be read as empty.
    await waitFor(() => expect(screen.queryByText(/Nothing dispatched/)).not.toBeInTheDocument());
  });

  it('asks for the chosen period, and weeks for a one-month trend', async () => {
    window.localStorage.setItem(layoutKey(manager), JSON.stringify({ ids: ['dispatch-trend'], periods: { 'dispatch-trend': 'month' } }));
    renderBoard();
    await waitFor(() => expect(runReportMock).toHaveBeenCalled());
    const spec = runReportMock.mock.calls[0][0];
    expect(spec.dimension).toBe('week');
    expect(spec.dateRange.from.slice(8)).toBe('01');
  });

  it('removes and adds a widget, and remembers it', async () => {
    const { unmount } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Customise dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pending benevolent requests' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a widget' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Slips still to pack' }));
    unmount();

    renderBoard();
    expect(await screen.findByText('Slips still to pack')).toBeInTheDocument();
    expect(screen.queryByText('Pending benevolent requests')).not.toBeInTheDocument();
  });

  it('goes back to the default on reset', async () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Customise dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pending benevolent requests' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(await screen.findByText('Pending benevolent requests')).toBeInTheDocument();
  });

  it('replaces a widget with one of the same size, in the same place', async () => {
    window.localStorage.setItem(layoutKey(manager), JSON.stringify(['top-products', 'product-health', 'dispatch-trend']));
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Customise dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace Product health' }));
    expect(await screen.findByText('Replace Product health')).toBeInTheDocument();
    // Only medium widgets: a large chart would change the board's shape.
    expect(screen.queryByRole('button', { name: 'Use Food dispatched' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use Collection compliance' }));
    const saved = JSON.parse(window.localStorage.getItem(layoutKey(manager)));
    expect(saved.ids).toEqual(['top-products', 'compliance-trend', 'dispatch-trend']);
  });
});

describe('dragging widgets around', () => {
  it('shows a drag handle on each widget while customising, and none otherwise', async () => {
    window.localStorage.setItem(layoutKey(manager), JSON.stringify(['top-products', 'product-health']));
    render(<MemoryRouter><CustomisableDashboard user={manager} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Customise dashboard' }));
    expect(screen.getByRole('button', { name: 'Drag Product health to move it' })).toBeInTheDocument();
  });

  it('reorders among widgets of the same kind, and remembers it', () => {
    const { result } = renderHook(() => useDashboardLayout(manager));
    act(() => result.current.reset());
    const before = result.current.ids;
    const panels = before.filter((id) => WIDGETS.find((w) => w.id === id)?.kind === 'panel');
    act(() => result.current.reorder(panels[panels.length - 1], panels[0]));
    const after = result.current.ids.filter((id) => WIDGETS.find((w) => w.id === id)?.kind === 'panel');
    expect(after[0]).toBe(panels[panels.length - 1]);
    expect(JSON.parse(window.localStorage.getItem(layoutKey(manager))).ids).toEqual(result.current.ids);
  });

  it('never drops a number among the charts', () => {
    const { result } = renderHook(() => useDashboardLayout(manager));
    act(() => result.current.reset());
    const before = result.current.ids;
    const tile = before.find((id) => WIDGETS.find((w) => w.id === id)?.kind === 'tile');
    const panel = before.find((id) => WIDGETS.find((w) => w.id === id)?.kind === 'panel');
    act(() => result.current.reorder(tile, panel));
    expect(result.current.ids).toEqual(before);
  });
});

describe('sizes and gaps', () => {
  const w = (id, wide = false) => ({ id, kind: 'panel', wide });

  it('calls a tile small, a half chart medium and a full chart large', () => {
    expect(sizeOf({ kind: 'tile' })).toBe('small');
    expect(sizeOf(w('a'))).toBe('medium');
    expect(sizeOf(w('a', true))).toBe('large');
  });

  it('finds the medium hole beside a lone half-width chart', () => {
    // wide, medium (alone: next is wide), wide
    const slots = panelSlots([w('a', true), w('b'), w('c', true)]);
    expect(slots.filter((x) => x.gap)).toEqual([
      { gap: 'medium', after: 'b' },
      { gap: 'panel', after: 'c' },
    ]);
  });

  it('leaves no hole between two half-width charts', () => {
    const slots = panelSlots([w('a'), w('b')]);
    expect(slots.filter((x) => x.gap)).toEqual([{ gap: 'panel', after: 'b' }]);
  });

  it('fills the gap it was opened from, with only what fits', async () => {
    window.localStorage.setItem(layoutKey(manager), JSON.stringify(['top-products', 'product-health', 'dispatch-trend']));
    render(<MemoryRouter><CustomisableDashboard user={manager} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Customise dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a medium widget here' }));
    expect(await screen.findByText('Add a medium widget')).toBeInTheDocument();
    // A large chart does not fit a medium hole.
    expect(screen.queryByRole('button', { name: 'Add Food dispatched' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Collection compliance' }));
    const saved = JSON.parse(window.localStorage.getItem(layoutKey(manager)));
    expect(saved.ids).toEqual(['top-products', 'product-health', 'compliance-trend', 'dispatch-trend']);
  });
});

describe('red, amber and green', () => {
  it('colours a figure against a target to reach', () => {
    const rag = ragAgainst({ value: 90, better: 'up' });
    expect(rag('Aug', 95)).toBe(RAG.good);
    expect(rag('Aug', 90)).toBe(RAG.good);
    expect(rag('Aug', 82)).toBe(RAG.warn);   // within 10% short
    expect(rag('Aug', 37.5)).toBe(RAG.bad);
  });

  it('colours a figure against a limit to stay under', () => {
    const rag = ragAgainst({ value: 2, better: 'down' });
    expect(rag('Aug', 1.2)).toBe(RAG.good);
    expect(rag('Aug', 2.8)).toBe(RAG.warn);  // up to half again over
    expect(rag('Aug', 4)).toBe(RAG.bad);
  });

  it('leaves the palette alone when there is no target', () => {
    expect(ragAgainst(null)('Aug', 5)).toBeNull();
    expect(ragAgainst({ value: 5, better: null })('Aug', 5)).toBeNull();
  });

  it('paints product health by status, not by size', () => {
    const w = WIDGETS.find((x) => x.id === 'product-health');
    const el = w.render({ summary: { healthyStockCount: 26, belowReorderCount: 0, outOfStockCount: 34 } });
    const colorFor = el.props.colorFor;
    expect(colorFor('Out of stock')).toBe(RAG.bad);
    expect(colorFor('Low stock')).toBe(RAG.warn);
    expect(colorFor('Healthy stock')).toBe(RAG.good);
    expect(byLabel({})('anything')).toBeNull();
  });
});
