import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../features/taskdashboard/components/TopNavBar', () => ({
  TopNavbar: () => <div>Navigation</div>,
}));

vi.mock('../services/volunteerManagementAPI', () => ({
  default: {
    getEvents: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    cancelEvent: vi.fn(),
    completeEvent: vi.fn(),
  },
}));

const { default: api } = await import('../services/volunteerManagementAPI');
const { default: VolunteerEventsPage } = await import('../pages/VolunteerEventsPage');

const EVENT = {
  id: 'event-1', name: 'Mandela Day', description: 'Pack food parcels',
  eventDate: '2026-10-10', venueName: 'Warehouse', address: 'Cape Town', status: 'SCHEDULED', statusLabel: 'Scheduled',
};

const renderPage = () => render(<MemoryRouter><VolunteerEventsPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getEvents.mockResolvedValue([EVENT]);
  api.createEvent.mockResolvedValue(EVENT);
  api.updateEvent.mockResolvedValue(EVENT);
  api.cancelEvent.mockResolvedValue({ ...EVENT, status: 'CANCELLED' });
  api.completeEvent.mockResolvedValue({ ...EVENT, status: 'COMPLETED' });
});

describe('VolunteerEventsPage', () => {
  it('loads and lists events', async () => {
    renderPage();
    expect(screen.getByRole('status', { name: /loading volunteer events/i })).toBeInTheDocument();
    expect(await screen.findByText('Mandela Day')).toBeInTheDocument();
    expect(api.getEvents).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/volunteers/events/event-1');
    expect(screen.getByText('Warehouse — Cape Town')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    api.getEvents.mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText('No volunteer events yet')).toBeInTheDocument();
  });

  it('shows a load error and retries', async () => {
    const user = userEvent.setup();
    api.getEvents.mockRejectedValueOnce(new Error('Could not reach the server.')).mockResolvedValueOnce([EVENT]);
    renderPage();
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Mandela Day')).toBeInTheDocument();
    expect(api.getEvents).toHaveBeenCalledTimes(2);
  });

  it('creates an event and refreshes the list', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.type(screen.getByLabelText('Event name'), 'Spring Drive');
    await user.type(screen.getByLabelText('Event date'), '2026-11-12');
    await user.type(screen.getByLabelText('Venue name'), 'Community Hall');
    await user.type(screen.getByLabelText('Address'), 'Cape Town');
    await user.type(screen.getByLabelText('Description'), 'Community packing day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() => expect(api.createEvent).toHaveBeenCalledWith({
      eventName: 'Spring Drive', eventDate: '2026-11-12', venueName: 'Community Hall', address: 'Cape Town', description: 'Community packing day',
    }));
    await waitFor(() => expect(api.getEvents).toHaveBeenCalledTimes(2));
  });

  it('edits an event and refreshes the list', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit Mandela Day' }));
    const name = screen.getByLabelText('Event name');
    await user.clear(name);
    await user.type(name, 'Mandela Day Updated');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledWith('event-1', expect.objectContaining({ eventName: 'Mandela Day Updated' })));
    await waitFor(() => expect(api.getEvents).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['Cancel Mandela Day', 'Cancel event', 'cancelEvent'],
    ['Complete Mandela Day', 'Complete event', 'completeEvent'],
  ])('%s updates the lifecycle and refreshes', async (buttonName, confirmationName, method) => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: buttonName }));
    const buttons = screen.getAllByRole('button', { name: confirmationName });
    await user.click(buttons.at(-1));
    await waitFor(() => expect(api[method]).toHaveBeenCalledWith('event-1'));
    await waitFor(() => expect(api.getEvents).toHaveBeenCalledTimes(2));
  });
});
