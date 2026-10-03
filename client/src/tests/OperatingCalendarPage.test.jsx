import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/calendarAPI', () => ({
  default: {
    getCalendar: vi.fn(), setCohortDays: vi.fn(), addClosure: vi.fn(),
    removeClosure: vi.fn(), addPublicHolidays: vi.fn(),
  },
}));

const { default: api } = await import('../services/calendarAPI');
const { default: OperatingCalendarPage } = await import('../pages/OperatingCalendarPage');

// Thursday 24 September 2099 — always upcoming.
const HERITAGE = { id: 7, date: '2099-09-24', kind: 'public_holiday', label: 'Heritage Day' };
const OLD = { id: 3, date: '2020-04-27', kind: 'public_holiday', label: 'Freedom Day' };

const renderPage = () => render(<MemoryRouter><OperatingCalendarPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getCalendar.mockResolvedValue({ cohorts: { tuesday: 2, thursday: 4 }, closures: [OLD, HERITAGE] });
  api.setCohortDays.mockResolvedValue({ tuesday: 3, thursday: 4 });
  api.addClosure.mockResolvedValue({ created: [{ id: 9 }], alreadyClosed: 0 });
  api.addPublicHolidays.mockResolvedValue({ created: new Array(13).fill({}), alreadyClosed: 0 });
  api.removeClosure.mockResolvedValue({});
});

describe('Operating calendar', () => {
  it('shows upcoming closed days, and which cohort misses its collection', async () => {
    renderPage();
    expect(await screen.findByText('Heritage Day')).toBeInTheDocument();
    expect(screen.queryByText('Freedom Day')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Upcoming 1' })).toBeInTheDocument();
    expect(screen.getByText('Thursday cohort misses its collection')).toBeInTheDocument();
  });

  it('saves a cohort’s new collection day', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Heritage Day');
    const save = screen.getByRole('button', { name: 'Save collection days' });
    expect(save).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tuesday cohort' }), 'Wednesday');
    await user.click(save);
    await waitFor(() => expect(api.setCohortDays).toHaveBeenCalledWith({ tuesday: 3, thursday: 4 }));
  });

  it('will not let both cohorts collect on the same day', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Heritage Day');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tuesday cohort' }), 'Thursday');
    expect(screen.getByText('The two cohorts need different days.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save collection days' })).toBeDisabled();
  });

  it('closes a range of days from the panel', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Heritage Day');
    await user.click(screen.getByRole('button', { name: 'Add closed day' }));
    const panel = await screen.findByRole('dialog');
    const [first, last] = within(panel).getAllByDisplayValue('');
    fireEvent.change(first, { target: { value: '2099-12-21' } });
    fireEvent.change(last, { target: { value: '2099-12-23' } });
    await user.type(within(panel).getByPlaceholderText('e.g. Year-end shutdown'), 'Year-end shutdown');
    await user.click(within(panel).getByRole('button', { name: 'Close the warehouse' }));
    await waitFor(() => expect(api.addClosure).toHaveBeenCalledWith({
      date: '2099-12-21', endDate: '2099-12-23', kind: 'closure', label: 'Year-end shutdown',
    }));
    expect(await screen.findByText('1 day closed.')).toBeInTheDocument();
  });

  it('adds the year’s public holidays', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Heritage Day');
    await user.click(screen.getByRole('button', { name: 'Add public holidays' }));
    const panel = await screen.findByRole('dialog');
    await user.click(within(panel).getByRole('button', { name: /public holidays$/ }));
    await waitFor(() => expect(api.addPublicHolidays).toHaveBeenCalled());
    expect(await screen.findByText('13 days closed.')).toBeInTheDocument();
  });

  it('opens the warehouse again on a closed day, after asking', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Remove Heritage Day/ }));
    await user.click(await screen.findByRole('button', { name: 'Remove closed day' }));
    await waitFor(() => expect(api.removeClosure).toHaveBeenCalledWith(7));
  });
});
