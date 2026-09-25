import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../features/taskdashboard/components/TopNavBar', () => ({
  TopNavbar: () => <div>Navigation</div>,
}));

vi.mock('../services/volunteerManagementAPI', () => ({
  default: {
    getEvents: vi.fn(),
    createEvent: vi.fn(),
    createEventWithInitialTimeslot: vi.fn(),
    updateEvent: vi.fn(),
    cancelEvent: vi.fn(),
    completeEvent: vi.fn(),
    getSpaces: vi.fn(),
    validateTimeslot: vi.fn(),
  },
}));

const { default: api } = await import('../services/volunteerManagementAPI');
const { default: VolunteerEventsPage } = await import('../pages/VolunteerEventsPage');

const EVENT = {
  id: 'event-1', name: 'Mandela Day', description: 'Pack food parcels',
  eventDate: '2026-10-10', venueName: 'Warehouse', address: 'Cape Town', status: 'SCHEDULED', statusLabel: 'Scheduled',
};
const FILTER_EVENTS = [
  {
    id: 'draft-1', name: 'Spring Packing', description: 'Fresh produce boxes',
    eventDate: '2026-09-01', venueName: 'Main Warehouse', address: 'Cape Town', status: 'DRAFT', statusLabel: 'Draft',
  },
  {
    id: 'published-1', name: 'Winter Drive', description: 'Blanket sorting',
    eventDate: '2026-11-20', venueName: 'Community Hall', address: 'Durban', status: 'PUBLISHED', statusLabel: 'Published',
  },
  {
    id: 'cancelled-1', name: 'Cancelled Kitchen Prep', description: 'Meal prep',
    eventDate: '2026-10-05', venueName: 'Kitchen', address: 'Johannesburg', status: 'CANCELLED', statusLabel: 'Cancelled',
  },
  {
    id: 'completed-1', name: 'Completed Garden Day', description: 'Soil packing',
    eventDate: '2026-08-15', venueName: 'Garden Shed', address: 'Pretoria', status: 'COMPLETED', statusLabel: 'Completed',
  },
];
const SPACE = { id: 'space-1', name: 'Packing Floor', location: 'Warehouse', isActive: true };

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderPage = () => render(<MemoryRouter><VolunteerEventsPage /><LocationProbe /></MemoryRouter>);
const visibleRowText = () => screen.getAllByRole('row').slice(1).map((row) => row.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  api.getEvents.mockResolvedValue([EVENT]);
  api.createEvent.mockResolvedValue(EVENT);
  api.createEventWithInitialTimeslot.mockResolvedValue({ event: EVENT, timeslots: [] });
  api.updateEvent.mockResolvedValue(EVENT);
  api.cancelEvent.mockResolvedValue({ ...EVENT, status: 'CANCELLED' });
  api.completeEvent.mockResolvedValue({ ...EVENT, status: 'COMPLETED' });
  api.getSpaces.mockResolvedValue([SPACE]);
  api.validateTimeslot.mockResolvedValue({ available: true, conflicts: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('VolunteerEventsPage', () => {
  it('loads and lists events', async () => {
    renderPage();
    expect(screen.getByRole('status', { name: /loading volunteer events/i })).toBeInTheDocument();
    expect(await screen.findByText('Mandela Day')).toBeInTheDocument();
    expect(api.getEvents).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/volunteers/events/event-1');
    expect(screen.getByText('Warehouse (Cape Town)')).toBeInTheDocument();
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

  it('searches event name, venue, address and description case-insensitively', async () => {
    const user = userEvent.setup();
    api.getEvents.mockResolvedValueOnce(FILTER_EVENTS);
    renderPage();
    await screen.findByText('Spring Packing');

    await user.type(screen.getByLabelText('Search events'), 'durban');
    expect(screen.getByText('Winter Drive')).toBeInTheDocument();
    expect(screen.queryByText('Spring Packing')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search events'));
    await user.type(screen.getByLabelText('Search events'), 'SOIL');
    expect(screen.getByText('Completed Garden Day')).toBeInTheDocument();
    expect(screen.queryByText('Winter Drive')).not.toBeInTheDocument();
  });

  it('filters by event date range', async () => {
    api.getEvents.mockResolvedValueOnce(FILTER_EVENTS);
    renderPage();
    await screen.findByText('Spring Packing');

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-10-31' } });

    expect(screen.getByText('Spring Packing')).toBeInTheDocument();
    expect(screen.getByText('Cancelled Kitchen Prep')).toBeInTheDocument();
    expect(screen.queryByText('Completed Garden Day')).not.toBeInTheDocument();
    expect(screen.queryByText('Winter Drive')).not.toBeInTheDocument();
  });

  it('sorts earliest to latest and latest to earliest', async () => {
    const user = userEvent.setup();
    api.getEvents.mockResolvedValueOnce(FILTER_EVENTS);
    renderPage();
    await screen.findByText('Spring Packing');

    expect(visibleRowText()[0]).toContain('Completed Garden Day');
    await user.selectOptions(screen.getByLabelText('Sort'), 'desc');
    expect(visibleRowText()[0]).toContain('Winter Drive');
  });

  it.each([
    ['Open Events', ['Spring Packing', 'Winter Drive'], ['Cancelled Kitchen Prep', 'Completed Garden Day']],
    ['Cancelled', ['Cancelled Kitchen Prep'], ['Spring Packing', 'Winter Drive', 'Completed Garden Day']],
    ['Completed', ['Completed Garden Day'], ['Spring Packing', 'Winter Drive', 'Cancelled Kitchen Prep']],
  ])('filters status: %s', async (status, visible, hidden) => {
    const user = userEvent.setup();
    api.getEvents.mockResolvedValueOnce(FILTER_EVENTS);
    renderPage();
    await screen.findByText('Spring Packing');

    await user.selectOptions(screen.getByLabelText('Status'), status);
    visible.forEach((name) => expect(screen.getByText(name)).toBeInTheDocument());
    hidden.forEach((name) => expect(screen.queryByText(name)).not.toBeInTheDocument());
  });

  it('combines search, date range, status and sort filters', async () => {
    const user = userEvent.setup();
    api.getEvents.mockResolvedValueOnce(FILTER_EVENTS);
    renderPage();
    await screen.findByText('Spring Packing');

    await user.type(screen.getByLabelText('Search events'), 'packing');
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-09-30' } });
    await user.selectOptions(screen.getByLabelText('Status'), 'Open Events');
    await user.selectOptions(screen.getByLabelText('Sort'), 'Latest to Earliest');

    expect(screen.getByText('Spring Packing')).toBeInTheDocument();
    expect(screen.queryByText('Completed Garden Day')).not.toBeInTheDocument();
    expect(screen.queryByText('Winter Drive')).not.toBeInTheDocument();
  });

  it('shows a useful filtered empty state and clears filters', async () => {
    const user = userEvent.setup();
    api.getEvents.mockResolvedValueOnce(FILTER_EVENTS);
    renderPage();
    await screen.findByText('Spring Packing');

    await user.type(screen.getByLabelText('Search events'), 'zzzz');
    expect(screen.getByText('No events match your filters')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear Filters' }).at(-1));

    expect(screen.getByText('Spring Packing')).toBeInTheDocument();
    expect(screen.getByText('Winter Drive')).toBeInTheDocument();
    expect(screen.getByLabelText('Search events')).toHaveValue('');
  });

  const fillCombinedCreateForm = async (user) => {
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Spring Drive' } });
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByLabelText('Venue name'), { target: { value: 'Community Hall' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Cape Town' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Community packing day' } });
    await screen.findByLabelText('Space');
    await user.selectOptions(screen.getByLabelText('Space'), 'space-1');
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '12' } });
  };

  it('creates an event with an initial timeslot and opens the workspace', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await fillCombinedCreateForm(user);
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() => expect(api.createEventWithInitialTimeslot).toHaveBeenCalledWith({
      eventName: 'Spring Drive',
      eventDate: '2026-11-12',
      venueName: 'Community Hall',
      address: 'Cape Town',
      description: 'Community packing day',
      space: { mode: 'existing', spaceId: 'space-1' },
      timeslots: [{
        startTime: '2026-11-12T09:00:00.000Z',
        endTime: '2026-11-12T10:00:00.000Z',
        capacity: 12,
      }],
    }));
    await waitFor(() => expect(api.getEvents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/volunteers/events/event-1'));
    expect(api.createEvent).not.toHaveBeenCalled();
  });

  it('adds and removes multiple timeslots before creating', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await fillCombinedCreateForm(user);
    await user.click(screen.getByRole('button', { name: 'Add Timeslot' }));

    expect(screen.getByText('Timeslot 2')).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText('Start time')[1], { target: { value: '10:30' } });
    fireEvent.change(screen.getAllByLabelText('End time')[1], { target: { value: '11:30' } });
    fireEvent.change(screen.getAllByLabelText('Capacity')[1], { target: { value: '8' } });

    await user.click(screen.getAllByRole('button', { name: 'Remove timeslot' })[0]);
    expect(screen.queryByText('Timeslot 2')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(api.createEventWithInitialTimeslot).toHaveBeenCalledWith(expect.objectContaining({
      timeslots: [{
        startTime: '2026-11-12T10:30:00.000Z',
        endTime: '2026-11-12T11:30:00.000Z',
        capacity: 8,
      }],
    })));
  });

  it('creates an event with a new space payload', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Spring Drive' } });
    fireEvent.change(screen.getByLabelText('Event date'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByLabelText('Venue name'), { target: { value: 'Community Hall' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Cape Town' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Community packing day' } });
    await user.click(screen.getByLabelText('Create new'));
    fireEvent.change(screen.getByLabelText('New space name'), { target: { value: 'Kitchen' } });
    fireEvent.change(screen.getByLabelText('New space location'), { target: { value: 'Warehouse' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '12' } });
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(api.createEventWithInitialTimeslot).toHaveBeenCalledWith(expect.objectContaining({
      space: { mode: 'new', spaceName: 'Kitchen', location: 'Warehouse' },
    })));
  });

  it('requires a new space name when creating a space', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.click(screen.getByLabelText('Create new'));
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(screen.getByRole('alert')).toHaveTextContent('New space name is required.');
    expect(screen.getByLabelText('New space name')).toHaveAttribute('aria-invalid', 'true');
    expect(api.createEventWithInitialTimeslot).not.toHaveBeenCalled();
  });

  it('shows all missing combined create fields together with field-level errors', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Please fix the following:');
    expect(alert).toHaveTextContent('Event name is required.');
    expect(alert).toHaveTextContent('Description is required.');
    expect(alert).toHaveTextContent('Event date is required.');
    expect(alert).toHaveTextContent('Venue is required.');
    expect(alert).toHaveTextContent('Address is required.');
    expect(alert).toHaveTextContent('Space is required.');
    expect(alert).toHaveTextContent('Timeslot 1: start time is required.');
    expect(alert).toHaveTextContent('Timeslot 1: end time is required.');
    expect(alert).toHaveTextContent('Timeslot 1: capacity is required.');
    expect(screen.getByLabelText('Event name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Event date')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Venue name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Address')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Space')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Start time')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('End time')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Capacity')).toHaveAttribute('aria-invalid', 'true');
    expect(api.createEventWithInitialTimeslot).not.toHaveBeenCalled();
  });

  it('keeps the combined create modal viewport-bound with a scrollable body', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(screen.getByRole('dialog')).toHaveClass('max-h-[calc(100dvh-2rem)]');
    expect(screen.getByLabelText('Event name').closest('.overflow-y-auto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create event' }).closest('div')).toHaveClass('shrink-0');
  });

  it('shows Mapbox address suggestions after typing', async () => {
    const user = userEvent.setup();
    vi.stubEnv('VITE_MAPBOX_PUBLIC_TOKEN', 'pk.test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          id: 'address.1',
          properties: { full_address: '10 Long Street, Cape Town, Western Cape, South Africa' },
        }],
      }),
    }));

    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.type(screen.getByLabelText('Address'), 'Long');

    expect(await screen.findByText('10 Long Street, Cape Town, Western Cape, South Africa')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('country=ZA'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('limit=5'), expect.anything());
  });

  it('selecting a Mapbox suggestion fills the address field', async () => {
    const user = userEvent.setup();
    vi.stubEnv('VITE_MAPBOX_PUBLIC_TOKEN', 'pk.test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          id: 'address.2',
          properties: { full_address: '25 Bree Street, Cape Town, Western Cape, South Africa' },
        }],
      }),
    }));

    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.type(screen.getByLabelText('Address'), 'Bree');
    await user.click(await screen.findByRole('option', { name: '25 Bree Street, Cape Town, Western Cape, South Africa' }));

    expect(screen.getByLabelText('Address')).toHaveValue('25 Bree Street, Cape Town, Western Cape, South Africa');
    expect(screen.queryByRole('listbox', { name: 'Address suggestions' })).not.toBeInTheDocument();
  });

  it('requires event description before creating an event', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.type(screen.getByLabelText('Event name'), 'Spring Drive');
    await user.type(screen.getByLabelText('Event date'), '2026-11-12');
    await user.type(screen.getByLabelText('Venue name'), 'Community Hall');
    await user.type(screen.getByLabelText('Address'), 'Cape Town');
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Description is required.');
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
    expect(api.createEventWithInitialTimeslot).not.toHaveBeenCalled();
  });

  it('validates time successfully', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.type(screen.getByLabelText('Event date'), '2026-11-12');
    await screen.findByLabelText('Space');
    await user.selectOptions(screen.getByLabelText('Space'), 'space-1');
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '12' } });
    await user.click(screen.getByRole('button', { name: 'Validate Times' }));
    await waitFor(() => expect(api.validateTimeslot).toHaveBeenCalledWith({
      eventDate: '2026-11-12',
      spaceId: 'space-1',
      timeslots: [{
        startTime: '2026-11-12T09:00:00.000Z',
        endTime: '2026-11-12T10:00:00.000Z',
        capacity: 12,
      }],
    }));
    expect(await screen.findByText(/times available/i)).toBeInTheDocument();
  });

  it('shows Validate Time conflicts and clears them when time changes', async () => {
    const user = userEvent.setup();
    api.validateTimeslot.mockResolvedValueOnce({
      available: false,
      conflicts: [{ type: 'TIMESLOT_OVERLAP', index: 0, message: 'The selected space is already booked during this time.' }],
    });
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await user.type(screen.getByLabelText('Event date'), '2026-11-12');
    await screen.findByLabelText('Space');
    await user.selectOptions(screen.getByLabelText('Space'), 'space-1');
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '12' } });
    await user.click(screen.getByRole('button', { name: 'Validate Times' }));
    expect(await screen.findByText(/already booked during this time/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } });
    expect(screen.queryByText(/already booked during this time/i)).not.toBeInTheDocument();
  });

  it('shows failed combined creation errors', async () => {
    const user = userEvent.setup();
    api.createEventWithInitialTimeslot.mockRejectedValueOnce(new Error('Could not create event.'));
    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await fillCombinedCreateForm(user);
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByText('Could not create event.')).toBeInTheDocument();
  });

  it('allows manual address entry when Mapbox token is missing', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubEnv('VITE_MAPBOX_PUBLIC_TOKEN', '');
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await fillCombinedCreateForm(user);
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(api.createEventWithInitialTimeslot).toHaveBeenCalled());
    expect(api.createEventWithInitialTimeslot.mock.calls[0][0]).toEqual(expect.objectContaining({ address: 'Cape Town' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows manual address entry when Mapbox search fails', async () => {
    const user = userEvent.setup();
    vi.stubEnv('VITE_MAPBOX_PUBLIC_TOKEN', 'pk.test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    renderPage();
    await screen.findByText('Mandela Day');
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    await fillCombinedCreateForm(user);
    expect(await screen.findByText(/address suggestions are unavailable/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(api.createEventWithInitialTimeslot).toHaveBeenCalled());
    expect(api.createEventWithInitialTimeslot.mock.calls[0][0]).toEqual(expect.objectContaining({ address: 'Cape Town' }));
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
