import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../features/taskdashboard/components/TopNavBar', () => ({ TopNavbar: () => <div>Navigation</div> }));

const mockRole = { value: 'manager' };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: mockRole.value }, logout: vi.fn() }),
}));

vi.mock('../services/volunteerManagementAPI', () => ({
  default: {
    getEventBooking: vi.fn(), getEventBookings: vi.fn(), getEventAttendance: vi.fn(), getSyncStatus: vi.fn(),
    getCapacity: vi.fn(), getAttendanceSummary: vi.fn(), createEventBooking: vi.fn(), updateTimeslot: vi.fn(),
    closeTimeslot: vi.fn(), cancelTimeslot: vi.fn(), createWalkIn: vi.fn(), confirmAttendance: vi.fn(), retrySync: vi.fn(),
    getSpaces: vi.fn(),
    createSpace: vi.fn(),
  },
}));

const { default: api } = await import('../services/volunteerManagementAPI');
const { default: VolunteerEventWorkspacePage } = await import('../pages/VolunteerEventWorkspacePage');

const EVENT = { id: 'e1', name: 'Mandela Day', description: 'Packing day', eventDate: '2026-10-10', status: 'PUBLISHED', statusLabel: 'Published' };
const SLOT = { id: 't1', eventId: 'e1', spaceId: 's1', startTime: '2026-10-10T08:00:00.000Z', endTime: '2026-10-10T10:00:00.000Z', capacity: 10, status: 'OPEN' };
const BOOKING = { id: 'b1', timeslotId: 't1', firstName: 'Ayesha', lastName: 'Khan', source: 'VMS', status: 'CONFIRMED' };
const CAPACITY = { timeslotId: 't1', capacity: 10, booked: 1, remaining: 9, isFull: false };
const SUMMARY = { timeslotId: 't1', booked: 1, attended: 0, noShow: 1 };
const FAILED_SYNC = { status: 'FAILED', errorMessage: 'VMS unavailable', lastSuccessAt: null };

const renderPage = () => render(<MemoryRouter initialEntries={['/volunteers/events/e1']}><Routes><Route path="/volunteers/events/:eventId" element={<VolunteerEventWorkspacePage />} /></Routes></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks(); mockRole.value = 'manager';
  api.getEventBooking.mockResolvedValue({ event: EVENT, timeslots: [SLOT] });
  api.getEventBookings.mockResolvedValue([BOOKING]);
  api.getEventAttendance.mockResolvedValue([]);
  api.getSyncStatus.mockResolvedValue({ status: 'SYNCED', lastSuccessAt: '2026-10-10T10:00:00Z', errorMessage: '' });
  api.getCapacity.mockResolvedValue(CAPACITY);
  api.getAttendanceSummary.mockResolvedValue(SUMMARY);
  api.getSpaces.mockResolvedValue([{ id: 's1', name: 'Community Hall', location: 'Cape Town', isActive: true }]);
  api.createSpace.mockResolvedValue({ id: 's2', name: 'Kitchen', location: 'Warehouse', isActive: true });
  api.createEventBooking.mockResolvedValue([SLOT]);
  api.createWalkIn.mockResolvedValue({ ...BOOKING, id: 'b2', source: 'WMS_GUEST' });
  api.confirmAttendance.mockResolvedValue({ bookingId: 'b1', checkedIn: true });
  api.retrySync.mockResolvedValue({ status: 'SYNCED', errorMessage: '' });
});

describe('VolunteerEventPage workspace', () => {
  it('shows loading, event, timeslot capacity, bookings and attendance summary', async () => {
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading event workspace' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Mandela Day' })).toBeInTheDocument();
    expect(screen.getByText('9 remaining')).toBeInTheDocument();
    expect(screen.getByText('Ayesha Khan')).toBeInTheDocument();
    expect(screen.getByText(/Community Hall — Cape Town/)).toBeInTheDocument();
    expect(screen.queryByText('t1')).not.toBeInTheDocument();
    expect(screen.getByText('No-show')).toBeInTheDocument();
    expect(screen.getByText('SYNCED')).toBeInTheDocument();
  });

  it('shows empty timeslot and booking states', async () => {
    api.getEventBooking.mockResolvedValueOnce({ event: EVENT, timeslots: [] });
    api.getEventBookings.mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText('No timeslots configured.')).toBeInTheDocument();
    expect(screen.getByText('No bookings for this event.')).toBeInTheDocument();
  });

  it('shows a workspace error and retries', async () => {
    const user = userEvent.setup();
    api.getEventBooking.mockRejectedValueOnce(new Error('Workspace unavailable.')).mockResolvedValue({ event: EVENT, timeslots: [SLOT] });
    renderPage();
    expect(await screen.findByText('Workspace unavailable.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Mandela Day' })).toBeInTheDocument();
  });

  it('creates a timeslot booking and refreshes capacity', async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole('heading', { name: 'Mandela Day' });
    await user.click(screen.getByLabelText('Space'));
    await user.click(screen.getByRole('option', { name: /Community Hall/ }));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-10-10T11:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-10-10T13:00' } });
    await user.type(screen.getByLabelText('Capacity'), '15');
    await user.click(screen.getByRole('button', { name: 'Add timeslot' }));
    await waitFor(() => expect(api.createEventBooking).toHaveBeenCalledWith('e1', expect.objectContaining({ spaceId: 's1', timeslots: [expect.objectContaining({ capacity: 15 })] })));
    await waitFor(() => expect(api.getCapacity).toHaveBeenCalledTimes(2));
  });

  it('creates and selects a manually entered space', async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole('heading', { name: 'Mandela Day' });
    await user.type(screen.getByLabelText('New space name'), 'Kitchen');
    await user.type(screen.getByLabelText('New space location'), 'Warehouse');
    await user.click(screen.getByRole('button', { name: 'Add space' }));
    await waitFor(() => expect(api.createSpace).toHaveBeenCalledWith({ spaceName: 'Kitchen', location: 'Warehouse' }));
    expect(api.getSpaces).toHaveBeenCalledTimes(2);
  });

  it('shows space loading and empty states', async () => {
    let resolveSpaces;
    api.getSpaces.mockReturnValueOnce(new Promise((resolve) => { resolveSpaces = resolve; }));
    renderPage();
    expect(await screen.findByText('Loading spaces…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add timeslot' })).toBeDisabled();
    resolveSpaces([]);
    expect(await screen.findByText('No active event spaces are available.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add timeslot' })).toBeDisabled();
  });

  it('shows a space error and retries only the space list', async () => {
    const user = userEvent.setup();
    api.getSpaces.mockRejectedValueOnce(new Error('Spaces unavailable.')).mockResolvedValueOnce([{ id: 's1', name: 'Community Hall', location: '', isActive: true }]);
    renderPage();
    expect(await screen.findByText('Spaces unavailable.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try spaces again' }));
    expect(await screen.findByText('Select a space')).toBeInTheDocument();
    expect(api.getSpaces).toHaveBeenCalledTimes(2);
  });

  it('registers a walk-in without external IDs and refreshes booking and capacity data', async () => {
    const user = userEvent.setup(); renderPage();
    await user.click(await screen.findByRole('button', { name: 'Register walk-in' }));
    await user.type(screen.getByLabelText('First name'), 'Lebo');
    await user.type(screen.getByLabelText('Last name'), 'M');
    await user.click(screen.getByRole('button', { name: 'Register walk-in' }));
    await waitFor(() => expect(api.createWalkIn).toHaveBeenCalledWith('t1', { volunteerFirstName: 'Lebo', volunteerLastName: 'M' }));
    expect(api.createWalkIn.mock.calls[0][1]).not.toHaveProperty('externalBookingId');
    await waitFor(() => expect(api.getEventBookings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getCapacity).toHaveBeenCalledTimes(2));
  });

  it('checks in a booking and refreshes attendance summary', async () => {
    const user = userEvent.setup(); renderPage();
    await user.click(await screen.findByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(api.confirmAttendance).toHaveBeenCalledWith('b1', true));
    await waitFor(() => expect(api.getAttendanceSummary).toHaveBeenCalledTimes(2));
  });

  it('shows failed sync details and retries to a synced result', async () => {
    const user = userEvent.setup();
    api.getSyncStatus.mockResolvedValueOnce(FAILED_SYNC).mockResolvedValue({ status: 'SYNCED', errorMessage: '', lastSuccessAt: '2026-10-10T10:00:00Z' });
    renderPage();
    expect(await screen.findByText('VMS unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(api.retrySync).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('SYNCED')).toBeInTheDocument();
  });

  it('keeps management actions hidden while leaving attendance reusable for warehouse staff', async () => {
    mockRole.value = 'warehouse_worker'; renderPage();
    await screen.findByRole('heading', { name: 'Mandela Day' });
    expect(screen.queryByRole('button', { name: 'Add timeslot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register walk-in' })).not.toBeInTheDocument();
    expect(screen.queryByText('VMS sync')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check in' })).toBeInTheDocument();
  });
});
