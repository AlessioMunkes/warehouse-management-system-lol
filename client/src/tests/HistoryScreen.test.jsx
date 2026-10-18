// ─────────────────────────────────────────────────────────────
// src/tests/HistoryScreen.test.jsx
//
// The one shape every worker history takes now (HistoryScreen), and
// Feed the Soil's history and kit screens drawn on it. Asked for from
// the floor: the histories looked different from each other, could
// only be narrowed by date, and a kit's owner read as an afterthought.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import HistoryScreen, { HistoryRow } from '../features/staff/HistoryScreen';
import { withinRange, byNewest, byOldest } from '../features/staff/historyView';

vi.mock('../services/collectionKitAPI', () => ({
  default: {
    listKits: vi.fn(async () => []),
    listRecords: vi.fn(async () => []),
    getKit: vi.fn(),
    getRecord: vi.fn(),
  },
}));
const { default: kitAPI } = await import('../services/collectionKitAPI');
const { default: FeedTheSoilFlow } = await import('../features/feedTheSoil/FeedTheSoilFlow');

const ROWS = [
  { id: 1, name: 'Alliance Foods', status: 'completed', at: '2026-10-01' },
  { id: 2, name: 'Masons', status: 'partial', at: '2026-10-11' },
  { id: 3, name: 'Pelican Beverages', status: 'completed', at: '2026-10-05' },
];
const SORTS = [
  { key: 'newest', label: 'Newest first', compare: byNewest((r) => r.at) },
  { key: 'oldest', label: 'Oldest first', compare: byOldest((r) => r.at) },
];
const FILTERS = [
  { key: 'status', label: 'Status', valueOf: (r) => r.status, labelOf: (v) => (v === 'partial' ? 'Partially delivered' : 'Completed') },
  // Every row has the same value: nothing to choose between.
  { key: 'site', label: 'Site', valueOf: () => 'Main' },
];

const show = (props = {}) => render(
  <HistoryScreen
    title="Past deliveries" range="all" onRangeChange={() => {}} loading={false}
    rows={ROWS} search={(r) => r.name} sorts={SORTS} filters={FILTERS}
    empty="Nothing yet." noun="deliveries"
    renderRow={(r) => <HistoryRow title={r.name} meta={r.at} action={{ label: 'View note', onClick: () => {} }} />}
    {...props}
  />,
);
const titles = () => [...document.querySelectorAll('.stf-row-title')].map((n) => n.textContent);

describe('HistoryScreen', () => {
  it('has the date range, a search, Sort and the filters worth having', () => {
    show();
    expect(screen.getByRole('tab', { name: 'This week' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    // One value across every row narrows nothing, so it is not offered.
    expect(screen.queryByLabelText('Site')).toBeNull();
  });

  it('sorts newest first by default, and oldest first when asked', () => {
    show();
    expect(titles()).toEqual(['Masons', 'Pelican Beverages', 'Alliance Foods']);
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'oldest' } });
    expect(titles()).toEqual(['Alliance Foods', 'Pelican Beverages', 'Masons']);
  });

  it('filters, says how many are showing, and clears', () => {
    show();
    const status = screen.getByLabelText('Status');
    expect(within(status).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['All', 'Completed', 'Partially delivered']);
    fireEvent.change(status, { target: { value: 'completed' } });
    expect(titles()).toEqual(['Pelican Beverages', 'Alliance Foods']);
    expect(screen.getByText('Showing 2 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(titles()).toHaveLength(3);
  });

  it('says when nothing matches a search, and offers the way back', () => {
    show();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No deliveries match/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show everything again' }));
    expect(titles()).toHaveLength(3);
  });

  it('shows the empty line when there is nothing at all', () => {
    show({ rows: [] });
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
  });
});

describe('withinRange', () => {
  const now = new Date('2026-10-14T10:00:00');
  it('matches the server: today, the last 7 days, the last 30 days', () => {
    expect(withinRange('2026-10-14T08:00:00', 'today', now)).toBe(true);
    expect(withinRange('2026-10-13T08:00:00', 'today', now)).toBe(false);
    expect(withinRange('2026-10-08T08:00:00', 'week', now)).toBe(true);
    expect(withinRange('2026-10-06T08:00:00', 'week', now)).toBe(false);
    expect(withinRange('2026-09-20T08:00:00', 'month', now)).toBe(true);
    expect(withinRange('2026-08-01T08:00:00', 'month', now)).toBe(false);
    expect(withinRange(null, 'all', now)).toBe(true);
  });
});

// ── Feed the Soil on HistoryScreen ────────────────────────────
const RECORD = {
  id: 40, kit_id: 19, owner_name: 'Carol P.', suburb: 'Woodstock', status: 'dispatched',
  kg_compost: 7.1, logged_at: '2026-09-18', dispatched_at: '2026-09-24T11:00:00', dispatched_to: 'Abalimi Bezekhaya',
};
const KIT = {
  id: 19, owner_name: 'Carol P.', suburb: 'Woodstock', status: 'logged', assigned_at: '2026-08-14',
  records: [{ id: 40, kg_compost: 7.1, logged_at: '2026-09-18', status: 'dispatched' }],
};

describe('Feed the Soil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kitAPI.listKits.mockResolvedValue([]);
    kitAPI.listRecords.mockResolvedValue([RECORD]);
    kitAPI.getRecord.mockResolvedValue(RECORD);
    kitAPI.getKit.mockResolvedValue(KIT);
  });

  it('names the kit and its owner on every history row, with filters for where it went', async () => {
    render(<FeedTheSoilFlow history />);
    expect(await screen.findByText('CK0019 · Carol P.')).toBeInTheDocument();
    expect(screen.getByText(/7,1 kg|7.1 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Sent to Abalimi Bezekhaya/)).toBeInTheDocument();
    expect(screen.getByLabelText('Sort')).toBeInTheDocument();
  });

  it('opens a record with the owner first, and "View kit logs" goes to the kit', async () => {
    render(<FeedTheSoilFlow history />);
    fireEvent.click(await screen.findByRole('button', { name: 'View record' }));
    expect(await screen.findByRole('heading', { name: 'CK0019 · Carol P.' })).toBeInTheDocument();
    expect(screen.queryByText('View kit details')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'View kit logs' }));
    expect(await screen.findByText('Compost logs')).toBeInTheDocument();
    expect(kitAPI.getKit).toHaveBeenCalledWith(19);
    // The owner card comes before the logs, not after them.
    const owner = document.querySelector('.stf-fts-owner');
    const logs = screen.getByText('Compost logs');
    expect(owner.compareDocumentPosition(logs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'CK0019 · Carol P.' })).toBeInTheDocument();
  });
});
