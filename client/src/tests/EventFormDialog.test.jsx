import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventFormDialog from '../features/volunteerManagement/components/EventFormDialog';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, disablePointerDismissal, children }) => (
    <div
      data-testid="dialog-root"
      data-open={String(open)}
      data-disable-pointer-dismissal={String(Boolean(disablePointerDismissal))}
    >
      {children}
    </div>
  ),
  DialogContent: ({ children, className }) => <div className={className}>{children}</div>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children, className }) => <div className={className}>{children}</div>,
  DialogHeader: ({ children, className }) => <div className={className}>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

describe('EventFormDialog', () => {
  const defaultProps = {
    open: true,
    busy: false,
    spaces: [{ id: 'space-1', name: 'Packing Floor', location: 'Warehouse' }],
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    onValidateTime: vi.fn().mockResolvedValue({ available: true, conflicts: [] }),
  };

  it('prevents outside pointer dismissal so clicks in/around the modal do not close it', () => {
    render(<EventFormDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog-root')).toHaveAttribute('data-disable-pointer-dismissal', 'true');
  });

  it('defaults Same day as event to checked and hides the timeslot date input', () => {
    render(<EventFormDialog {...defaultProps} />);
    const sameDayCheckbox = screen.getByLabelText(/Same day as event/i);
    expect(sameDayCheckbox).toBeChecked();
    expect(screen.queryByLabelText(/Timeslot date/i)).not.toBeInTheDocument();
  });

  it('uses event date for start/end times construct and passes valid 14:00 -> 16:00', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EventFormDialog {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: 'Packing Drive' } });
    fireEvent.change(screen.getByLabelText(/Event date/i), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText(/Venue name/i), { target: { value: 'Warehouse' } });
    fireEvent.change(screen.getByLabelText(/Address/i), { target: { value: '1 Main Rd' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Food packing' } });
    await user.selectOptions(screen.getByLabelText(/Space/i), 'space-1');

    fireEvent.change(screen.getByLabelText(/Start time/i), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText(/End time/i), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/Capacity/i), { target: { value: '10' } });

    await user.click(screen.getByRole('button', { name: /^Create event$/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      eventDate: '2026-09-16',
      timeslots: [{
        startTime: '2026-09-16T14:00:00.000Z',
        endTime: '2026-09-16T16:00:00.000Z',
        capacity: 10,
      }],
    }));
  });

  it('unchecking Same day as event reveals timeslot date input and constructs different-day timestamp', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EventFormDialog {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: 'Packing Drive' } });
    fireEvent.change(screen.getByLabelText(/Event date/i), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText(/Venue name/i), { target: { value: 'Warehouse' } });
    fireEvent.change(screen.getByLabelText(/Address/i), { target: { value: '1 Main Rd' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Food packing' } });
    await user.selectOptions(screen.getByLabelText(/Space/i), 'space-1');

    const sameDayCheckbox = screen.getByLabelText(/Same day as event/i);
    await user.click(sameDayCheckbox);
    expect(sameDayCheckbox).not.toBeChecked();

    const timeslotDateInput = screen.getByLabelText(/Timeslot date/i);
    expect(timeslotDateInput).toBeInTheDocument();
    fireEvent.change(timeslotDateInput, { target: { value: '2026-09-17' } });

    fireEvent.change(screen.getByLabelText(/Start time/i), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText(/End time/i), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/Capacity/i), { target: { value: '10' } });

    await user.click(screen.getByRole('button', { name: /^Create event$/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      eventDate: '2026-09-16',
      timeslots: [{
        startTime: '2026-09-17T14:00:00.000Z',
        endTime: '2026-09-17T16:00:00.000Z',
        capacity: 10,
      }],
    }));
  });

  it('rejects end <= start time', async () => {
    const { container } = render(<EventFormDialog {...defaultProps} onSubmit={vi.fn()} />);

    // Fill all required fields synchronously to avoid batching surprises.
    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: 'Packing Drive' } });
    fireEvent.change(screen.getByLabelText(/Event date/i), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText(/Venue name/i), { target: { value: 'Warehouse' } });
    fireEvent.change(screen.getByLabelText(/Address/i), { target: { value: '1 Main Rd' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Food packing' } });
    fireEvent.change(screen.getByLabelText(/Space/i), { target: { value: 'space-1' } });
    fireEvent.change(screen.getByLabelText(/Start time/i), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/End time/i), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText(/Capacity/i), { target: { value: '10' } });

    fireEvent.submit(container.querySelector('form'));

    // The time check fires even if spaceId is empty — find the timeslot error in the alert list.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/end time must be after start time/i);
  });

  it('supports multiple timeslots with different settings', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EventFormDialog {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: 'Multi Drive' } });
    fireEvent.change(screen.getByLabelText(/Event date/i), { target: { value: '2026-09-16' } });
    fireEvent.change(screen.getByLabelText(/Venue name/i), { target: { value: 'Warehouse' } });
    fireEvent.change(screen.getByLabelText(/Address/i), { target: { value: '1 Main Rd' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Multi slot event' } });
    await user.selectOptions(screen.getByLabelText(/Space/i), 'space-1');

    fireEvent.change(screen.getAllByLabelText(/Start time/i)[0], { target: { value: '09:00' } });
    fireEvent.change(screen.getAllByLabelText(/End time/i)[0], { target: { value: '11:00' } });
    fireEvent.change(screen.getAllByLabelText(/Capacity/i)[0], { target: { value: '5' } });

    await user.click(screen.getByRole('button', { name: /Add Timeslot/i }));

    const checkboxes = screen.getAllByLabelText(/Same day as event/i);
    await user.click(checkboxes[1]);
    fireEvent.change(screen.getByLabelText(/Timeslot date/i), { target: { value: '2026-09-17' } });

    fireEvent.change(screen.getAllByLabelText(/Start time/i)[1], { target: { value: '14:00' } });
    fireEvent.change(screen.getAllByLabelText(/End time/i)[1], { target: { value: '16:00' } });
    fireEvent.change(screen.getAllByLabelText(/Capacity/i)[1], { target: { value: '8' } });

    await user.click(screen.getByRole('button', { name: /^Create event$/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      timeslots: [
        { startTime: '2026-09-16T09:00:00.000Z', endTime: '2026-09-16T11:00:00.000Z', capacity: 5 },
        { startTime: '2026-09-17T14:00:00.000Z', endTime: '2026-09-17T16:00:00.000Z', capacity: 8 },
      ],
    }));
  });
});
