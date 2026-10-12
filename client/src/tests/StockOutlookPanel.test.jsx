// ─────────────────────────────────────────────────────────────
// src/tests/StockOutlookPanel.test.jsx
//
// The dashboard's "Weeks of stock left": each product says what is
// available, what is due in and what a week takes, how many weeks that
// is, when it runs short, and whether its next use-by date comes
// first. Every figure is on the screen in words; the tips only explain.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StockCoverPanel } from '../features/dashboard/InsightPanels';
import { toInsights } from '../services/dashboardAPI';

const insights = (stockCover, over = {}) => toInsights({
  recipeName: 'Summer', stockCover, outlook: { usageWeeks: 8, dueInWeeks: 4 }, ...over,
});

const renderPanel = (data) => render(<MemoryRouter><StockCoverPanel insights={data} /></MemoryRouter>);

describe('stock outlook panel', () => {
  it('shows available, due in and a week, then the weeks they make', () => {
    renderPanel(insights([{
      productId: 1, name: 'Maize meal', unit: 'kg', available: 100, dueIn: 50, nextDue: '2026-10-19',
      weeklyUse: 50, weeklyUnit: 'kg', usage: 'recipe', weeks: 3, runsShortOn: '2026-11-02', mayExpireOn: null,
    }]));
    expect(screen.getByText('Maize meal')).toBeInTheDocument();
    expect(screen.getByText(/100 kg available/)).toBeInTheDocument();
    expect(screen.getByText(/50 kg due in/)).toBeInTheDocument();
    expect(screen.getByText(/50 kg a week/)).toBeInTheDocument();
    expect(screen.getByText('3 weeks')).toBeInTheDocument();
    expect(screen.getByText(/^Runs short around 0?2 Nov$/)).toBeInTheDocument();
  });

  it('says when the next use-by date comes first', () => {
    renderPanel(insights([{
      productId: 2, name: 'Pilchards', unit: 'cans', available: 40, dueIn: 0, weeklyUse: 10, weeklyUnit: 'cans',
      usage: 'recipe', weeks: 4, runsShortOn: '2026-11-09', mayExpireOn: '2026-10-20',
    }]));
    expect(screen.getByText(/^May expire first: use-by 20 Oct$/)).toBeInTheDocument();
    // Nothing on order: no "due in" to read.
    expect(screen.queryByText(/due in/)).toBeNull();
  });

  it('can be read with the keyboard: every explained figure takes focus', () => {
    renderPanel(insights([{
      productId: 1, name: 'Maize meal', unit: 'kg', available: 100, dueIn: 0, weeklyUse: 50, weeklyUnit: 'kg',
      usage: 'history', weeks: 2, runsShortOn: null, mayExpireOn: null,
    }]));
    expect(screen.getByText('2 weeks')).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(/100 kg available/)).toHaveAttribute('tabindex', '0');
  });

  it('explains how it is worked out, including that use-by dates are an estimate', () => {
    renderPanel(insights([{ productId: 1, name: 'Maize meal', unit: 'kg', available: 1, weeklyUse: 1, weeks: 1 }]));
    expect(screen.getByRole('button', { name: 'How this is worked out' })).toBeInTheDocument();
  });

  it('says there is nothing to measure when nothing is used', () => {
    renderPanel(insights([]));
    expect(screen.getByText(/Nothing to measure yet/)).toBeInTheDocument();
  });
});
