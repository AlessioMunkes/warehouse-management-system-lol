// ─────────────────────────────────────────────────────────────
// src/tests/StockOutlookPanel.test.jsx
//
// The dashboard's "Weeks of stock left": each product says what is
// available, what is due in and what a week takes, how many weeks that
// is, when it runs short, whether its next use-by date comes first,
// an overdue order to chase, and any missing data behind the figures.
// Every figure is on the screen in words; the tips only explain.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StockCoverPanel } from '../features/dashboard/InsightPanels';
import { toInsights } from '../services/dashboardAPI';

const insights = (stockCover, over = {}) => toInsights({
  recipeName: 'Summer', stockCover, outlook: { usageWeeks: 8, unmeasured: 0 }, ...over,
});
const product = (over = {}) => ({
  productId: 1, name: 'Maize meal', unit: 'kg', available: 100, dueIn: 50, nextDue: '2026-10-19',
  overdue: 0, ifOverdueArrived: null, weeklyUse: 50, demandLabel: 'Summer recipe', leadLabel: 'Assumed 7 days',
  orderBy: '2026-10-26', limits: [], weeks: 3, days: 21, runsShortOn: '2026-11-02', mayExpireOn: null,
  ...over,
});

const renderPanel = (data) => render(<MemoryRouter><StockCoverPanel insights={data} /></MemoryRouter>);

describe('stock outlook panel', () => {
  it('shows available, due in and a week, then the weeks they make', () => {
    renderPanel(insights([product()]));
    expect(screen.getByText('Maize meal')).toBeInTheDocument();
    expect(screen.getByText(/100 kg available/)).toBeInTheDocument();
    expect(screen.getByText(/50 kg due in/)).toBeInTheDocument();
    expect(screen.getByText(/50 kg a week/)).toBeInTheDocument();
    expect(screen.getByText('3 weeks')).toBeInTheDocument();
    expect(screen.getByText(/^Runs short around 0?2 Nov$/)).toBeInTheDocument();
  });

  it('says where a week came from and when to order, on focus', async () => {
    renderPanel(insights([product({ limits: ['No agreed lead time or delivery history for Cape Mills'] })]));
    fireEvent.focus(screen.getByText(/50 kg a week/));
    expect(await screen.findByText('Worked out from: Summer recipe.')).toBeInTheDocument();
    fireEvent.focus(screen.getByText(/Runs short around/).closest('[tabindex]'));
    expect(await screen.findByText(/Order by 26 Oct, lead time: Assumed 7 days\. No agreed lead time or delivery history for Cape Mills\./)).toBeInTheDocument();
    // A lead-time gap only moves the order-by date: it is in the tip, not on the row.
    expect(screen.queryByText('No agreed lead time or delivery history for Cape Mills')).toBeNull();
  });

  it('flags missing data that changed the figures', () => {
    renderPanel(insights([product({
      demandLabel: 'Sent out, last 8 weeks', limits: ['Planned demand not used: 3 lines in kg, no crate weight set'],
    })]));
    expect(screen.getByText('Planned demand not used: 3 lines in kg, no crate weight set')).toBeInTheDocument();
  });

  it('asks for an overdue order to be chased, not counted', () => {
    renderPanel(insights([product({ overdue: 30, ifOverdueArrived: { weeksOfCover: 3.6, runsOutOn: '2026-11-06' } })]));
    expect(screen.getByText('30 kg overdue, chase supplier')).toBeInTheDocument();
  });

  it('says none is available, not a date, when nothing is left', () => {
    renderPanel(insights([product({ name: 'Onions', available: 0, dueIn: 0, weeks: 0, days: 0, runsShortOn: '2026-10-12' })]));
    // Said once, where the cover time would be; no "0 weeks", no second badge.
    expect(screen.getByText('None available')).toBeInTheDocument();
    expect(screen.queryByText(/Runs short around/)).toBeNull();
    expect(screen.queryByText(/0 weeks|0 days/)).toBeNull();
  });

  it('says how long stock lasts in days, then weeks and days, then weeks, always rounded down', () => {
    renderPanel(insights([
      product({ productId: 1, name: 'A', days: 10, weeks: 1.4, runsShortOn: null }),
      product({ productId: 2, name: 'B', days: 13, weeks: 1.9, runsShortOn: null }),
      product({ productId: 3, name: 'C', days: 14, weeks: 2, runsShortOn: null }),
      product({ productId: 4, name: 'D', days: 24, weeks: 3.4, runsShortOn: null }),
      product({ productId: 5, name: 'E', days: 28, weeks: 4, runsShortOn: null }),
      product({ productId: 6, name: 'F', days: 34, weeks: 4.9, runsShortOn: null }),
      product({ productId: 7, name: 'G', days: 50, weeks: 7.1, runsShortOn: null }),
      product({ productId: 8, name: 'H', days: 174, weeks: 24.9, runsShortOn: null }),
      product({ productId: 9, name: 'I', days: 1, weeks: 0.1, runsShortOn: null }),
    ]));
    // 10 days; 13 days (just under two weeks, days only); 14 days is 2 weeks exactly; 24 days is
    // 3 weeks 3 days; 28 is 4 weeks; 34 days is 4 weeks 6 days, not 5; 50 days is 7 weeks, not 7.1;
    // 174 days is 24 weeks 6 days, so 24, not 25.
    for (const text of ['10 days', '13 days', '2 weeks', '3 weeks, 3 days', '4 weeks', '7 weeks', '24 weeks', '1 day']) {
      expect(screen.getAllByText(text).length, text).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('4 weeks')).toHaveLength(2);        // 28 and 34 days
    expect(screen.queryByText(/\d\.\d weeks?/)).toBeNull();
  });

  it('says less than a day, not a day, when there is stock but not a whole day of it', () => {
    renderPanel(insights([product({ available: 3, days: 0, weeks: 0, runsShortOn: null })]));
    expect(screen.getByText('Less than 1 day')).toBeInTheDocument();
  });

  it('puts units in the plural where they need to be', () => {
    renderPanel(insights([
      product({ productId: 1, name: 'Carrots', unit: 'crate', available: 15, dueIn: 1, weeklyUse: 5, runsShortOn: null }),
      product({ productId: 2, name: 'Onions', unit: 'bag', available: 1, dueIn: 0, weeklyUse: 1, runsShortOn: null }),
    ]));
    expect(screen.getByText('15 crates available')).toBeInTheDocument();
    expect(screen.getByText('1 crate due in')).toBeInTheDocument();
    expect(screen.getByText('5 crates a week')).toBeInTheDocument();
    expect(screen.getByText('1 bag available')).toBeInTheDocument();
    expect(screen.getByText('1 bag a week')).toBeInTheDocument();
  });

  it('shows a use under one a week as about so many a month', () => {
    renderPanel(insights([
      product({ productId: 1, name: 'Carrots', unit: 'crate', weeklyUse: 0.63, runsShortOn: null }),
      product({ productId: 2, name: 'Salt', unit: 'kg', weeklyUse: 0.5, runsShortOn: null }),
      product({ productId: 3, name: 'Saffron', unit: 'each', weeklyUse: 0.1, runsShortOn: null }),
    ]));
    // 0.63 a week is 2.7 a month: about 3. Not "0.63 crate a week".
    expect(screen.getByText('about 3 crates a month')).toBeInTheDocument();
    expect(screen.getByText('about 2 kg a month')).toBeInTheDocument();
    expect(screen.getByText('less than 1 each a month')).toBeInTheDocument();
    expect(screen.queryByText(/0\.63/)).toBeNull();
  });

  it('says when the next use-by date comes first', () => {
    renderPanel(insights([product({
      name: 'Pilchards', unit: 'cans', available: 40, dueIn: 0, weeklyUse: 10, weeks: 4,
      runsShortOn: '2026-11-09', mayExpireOn: '2026-10-20',
    })]));
    expect(screen.getByText(/^May expire first: use-by 20 Oct$/)).toBeInTheDocument();
    // Nothing on order: no "due in" to read.
    expect(screen.queryByText(/due in/)).toBeNull();
  });

  it('says how much would be left on the day, and that it is an estimate, on focus', async () => {
    renderPanel(insights([product({
      name: 'Pilchards', unit: 'cans', runsShortOn: null, mayExpireOn: '2026-10-20', mayExpireQuantity: 12,
    })]));
    fireEvent.focus(screen.getByText(/^May expire first/).closest('[tabindex]'));
    expect(await screen.findByText(/About 12 cans would still be on the shelf at its use-by date at this rate\. Estimated: assumes oldest stock goes out first\./)).toBeInTheDocument();
  });

  it('can be read with the keyboard: every explained figure takes focus', () => {
    renderPanel(insights([product({ dueIn: 0, weeks: 2, days: 14, runsShortOn: null })]));
    expect(screen.getByText('2 weeks')).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(/100 kg available/)).toHaveAttribute('tabindex', '0');
  });

  it('explains how it is worked out, including that use-by dates are an estimate', () => {
    renderPanel(insights([product({ weeks: 1 })]));
    expect(screen.getByRole('button', { name: 'How this is worked out' })).toBeInTheDocument();
  });

  it('says there is nothing to measure when nothing is used, and what was left out for want of data', () => {
    renderPanel(insights([], { outlook: { usageWeeks: 8, unmeasured: 2 } }));
    expect(screen.getByText(/Nothing to measure yet/)).toBeInTheDocument();
    expect(screen.getByText('2 products are left out: demand could not be worked out because a unit weight is not set.')).toBeInTheDocument();
  });
});
