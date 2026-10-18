// ─────────────────────────────────────────────────────────────
// src/tests/OverviewCards.test.jsx
//
// The customisable overview on Operations reports. A person's cards
// must survive a reload, belong to that person only, never break on a
// report that no longer exists, and be put back with one press.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cleanCards, cardsKey, cardId, DEFAULT_CARDS, MAX_CARDS } from '../features/reporting/overviewLayout';

vi.mock('../features/reporting/TrendCard', () => ({
  default: ({ label, caption, onExplore }) => (
    <div data-testid="card">
      <span>{label}</span> <span>{caption}</span>
      <button type="button" onClick={() => onExplore()}>Explore {label}</button>
    </div>
  ),
}));
const { default: OverviewCards } = await import('../features/reporting/OverviewCards');

const metric = (id, label, dims = ['month', 'product']) => ({ id, label, dimensions: dims.map((d) => ({ id: d, label: d[0].toUpperCase() + d.slice(1) })) });
const METRICS = [
  metric('dispatch_volume', 'Food dispatched'),
  metric('unit_price_trend', 'Unit price trend'),
  metric('collection_compliance', 'Collection compliance', ['month', 'cohort']),
  metric('low_stock_items', 'Items at or below reorder level', ['product']),
  metric('decanting_wastage', 'Decanting wastage', ['none', 'week']),
];
const USER = { id: 7, role: 'manager', warehouse: 'main' };
const labels = () => screen.getAllByTestId('card').map((c) => c.firstChild.textContent);
const show = (user = USER, onExplore = vi.fn()) => ({ onExplore, ...render(<OverviewCards user={user} metrics={METRICS} onExplore={onExplore} />) });

beforeEach(() => window.localStorage.clear());

describe('which cards can be drawn', () => {
  it('drops a report this build no longer has, and corrects a breakdown it no longer offers', () => {
    const out = cleanCards([
      { metric: 'gone_report', dimension: 'month', preset: 'last_3m' },
      { metric: 'low_stock_items', dimension: 'month', preset: 'last_3m' },
      { metric: 'dispatch_volume', dimension: 'month', preset: 'made_up' },
    ], METRICS);
    expect(out).toEqual([
      { metric: 'low_stock_items', dimension: 'product', preset: 'last_3m' },
      { metric: 'dispatch_volume', dimension: 'month', preset: 'last_3m' },
    ]);
  });

  it('keeps the same card once, and no more than the overview holds', () => {
    const same = { metric: 'dispatch_volume', dimension: 'month', preset: 'last_3m' };
    expect(cleanCards([same, same], METRICS)).toHaveLength(1);
    const many = Array.from({ length: 20 }, (_, i) => ({ metric: 'dispatch_volume', dimension: i % 2 ? 'month' : 'product', preset: ['last_7d', 'last_30d', 'this_month', 'last_3m', 'last_6m', 'this_year'][i % 6] }));
    expect(cleanCards(many, METRICS).length).toBeLessThanOrEqual(MAX_CARDS);
  });

  it('is kept per person, per role and per warehouse', () => {
    expect(cardsKey(USER)).not.toBe(cardsKey({ ...USER, id: 8 }));
    expect(cardsKey(USER)).not.toBe(cardsKey({ ...USER, warehouse: 'north' }));
    expect(cardsKey(USER)).not.toBe(cardsKey({ ...USER, role: 'admin' }));
    expect(cardsKey(null)).toBeNull();
  });
});

describe('the overview', () => {
  it('starts with the four default cards, each saying what it covers', () => {
    show();
    expect(labels()).toEqual(['Food dispatched', 'Unit price trend', 'Collection compliance', 'Items at or below reorder level']);
    expect(screen.getAllByTestId('card')[0]).toHaveTextContent('By month · Last 3 months');
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('opens a card as the same report, breakdown and period', async () => {
    const { onExplore } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Explore Unit price trend' }));
    expect(onExplore).toHaveBeenCalledWith({ metric: 'unit_price_trend', dimension: 'product', preset: 'last_3m' });
  });

  it('adds any report as a card, with a breakdown and a period', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Customise' }));
    await userEvent.selectOptions(screen.getByLabelText('Report'), 'decanting_wastage');
    await userEvent.selectOptions(screen.getByLabelText('Break down by'), 'week');
    await userEvent.selectOptions(screen.getByLabelText('Period'), 'last_30d');
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    expect(labels()).toHaveLength(5);
    expect(screen.getAllByTestId('card')[4]).toHaveTextContent('Decanting wastage By week · Last 30 days');
    expect(screen.getByRole('status')).toHaveTextContent('Decanting wastage added.');
  });

  it('will not add the same card twice', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Customise' }));
    await userEvent.selectOptions(screen.getByLabelText('Report'), 'dispatch_volume');
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    expect(labels()).toHaveLength(4);
    expect(screen.getByRole('status')).toHaveTextContent('That card is already on the overview.');
  });

  it('moves and removes cards', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Customise' }));
    expect(screen.getByRole('button', { name: 'Move Food dispatched earlier' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Food dispatched later' }));
    expect(labels().slice(0, 2)).toEqual(['Unit price trend', 'Food dispatched']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Collection compliance' }));
    expect(labels()).toEqual(['Unit price trend', 'Food dispatched', 'Items at or below reorder level']);
  });

  it('remembers the cards for that person, and nobody else', async () => {
    const first = show();
    await userEvent.click(screen.getByRole('button', { name: 'Customise' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Food dispatched' }));
    first.unmount();

    const again = show();
    expect(labels()).toEqual(['Unit price trend', 'Collection compliance', 'Items at or below reorder level']);
    again.unmount();

    show({ ...USER, id: 8 });
    expect(labels()).toHaveLength(4);
  });

  it('puts the default cards back', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Customise' }));
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Food dispatched' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(labels()).toEqual(DEFAULT_CARDS.map((c) => METRICS.find((m) => m.id === c.metric).label));
    expect(window.localStorage.getItem(cardsKey(USER))).toBeNull();
  });

  it('says so when every card has been removed', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Customise' }));
    for (const name of ['Food dispatched', 'Unit price trend', 'Collection compliance', 'Items at or below reorder level']) {
      await userEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    }
    expect(screen.getByText('No cards on the overview. Select Customise to add one.')).toBeInTheDocument();
  });

  it('gives each card a stable id from what it shows', () => {
    expect(cardId(DEFAULT_CARDS[0])).toBe('dispatch_volume|month|last_3m');
    expect(within(document.body).queryByText('undefined')).not.toBeInTheDocument();
  });
});
