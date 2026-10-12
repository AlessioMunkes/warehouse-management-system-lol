// ─────────────────────────────────────────────────────────────
// src/tests/ReverseRequest.test.jsx
//
// A manager can reverse a confirmed benevolent request: the detail
// panel offers Reverse on the manager's screen only, and the reason is
// required before anything is sent.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequestDetailPanel from '../features/communityRequests/RequestDetailPanel';
import ReversePanel from '../features/communityRequests/ReversePanel';

const request = (over = {}) => ({
  id: 4, callerName: 'Sister Agnes', itemsRequested: 'Rice and beans', outcome: 'fulfilled',
  resolvedAt: '2026-10-10T09:00:00Z', outcomeNote: '',
  items: [{ id: 1, productName: 'Rice', unit: 'kg', quantityApproved: 6, quantityReleased: 6 }],
  ...over,
});

describe('Reverse on a confirmed request', () => {
  it('is offered on the manager screen for a confirmed request', async () => {
    const onReverse = vi.fn();
    render(<RequestDetailPanel request={request()} onClose={() => {}} onReverse={onReverse} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    expect(onReverse).toHaveBeenCalled();
  });

  it('is not offered where the screen does not allow it, or before confirming', () => {
    const { unmount } = render(<RequestDetailPanel request={request()} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Reverse' })).toBeNull();
    unmount();
    render(<RequestDetailPanel request={request({ outcome: 'approved' })} onClose={() => {}} onReverse={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Reverse' })).toBeNull();
  });
});

describe('the reverse form', () => {
  it('says what goes back into stock', () => {
    render(<ReversePanel request={request()} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/6 kg Rice/)).toBeInTheDocument();
  });

  it('needs a reason, then sends it', async () => {
    const onSubmit = vi.fn();
    render(<ReversePanel request={request()} onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reverse request' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Say why the request is being reversed.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Reason'), 'Caller never came');
    await userEvent.click(screen.getByRole('button', { name: 'Reverse request' }));
    expect(onSubmit).toHaveBeenCalledWith('Caller never came');
  });
});
