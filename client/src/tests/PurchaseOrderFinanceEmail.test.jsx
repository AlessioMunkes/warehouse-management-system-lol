import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PurchaseOrderDetail from '../features/purchaseOrders/PurchaseOrderDetail';
import PurchaseOrderForm from '../features/purchaseOrders/PurchaseOrderForm';
import { toPurchaseOrder } from '../services/purchaseOrderAPI';

const row = (over = {}) => ({
  id: 12, po_number: 'PO-2026-0012', supplier_id: 1, supplier_name: 'Acme Foods',
  status: 'approved', expected_delivery_date: '2026-11-01', created_at: '2026-10-01T08:00:00.000Z',
  line_count: 1, estimated_value: 100, receipt_count: 0, items: [], deliveries: [],
  ...over,
});

const renderDetail = (over = {}, props = {}) => {
  const onResendFinanceEmail = vi.fn().mockResolvedValue(true);
  render(
    <PurchaseOrderDetail
      purchaseOrder={toPurchaseOrder(row(over))}
      canManage
      onApprove={vi.fn()}
      onSetQuickbooksRef={vi.fn()}
      onResendFinanceEmail={onResendFinanceEmail}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
  return { onResendFinanceEmail };
};

describe('toPurchaseOrder — finance email fields', () => {
  it('maps status, safe error and attempted-at', () => {
    const po = toPurchaseOrder(row({
      finance_email_status: 'failed',
      finance_email_error: 'Gmail not connected',
      finance_email_attempted_at: '2026-10-02T08:00:00.000Z',
    }));
    expect(po.financeEmailStatus).toBe('failed');
    expect(po.financeEmailError).toBe('Gmail not connected');
    expect(po.financeEmailAttemptedAt).toBe('2026-10-02T08:00:00.000Z');
  });

  it('defaults to no status when the columns are absent', () => {
    const po = toPurchaseOrder(row());
    expect(po.financeEmailStatus).toBeNull();
    expect(po.financeEmailError).toBe('');
    expect(po.financeEmailAttemptedAt).toBeNull();
  });
});

describe('PurchaseOrderDetail — finance email', () => {
  it('shows "Sent to Finance · <time>" in a neutral badge with no Resend', () => {
    renderDetail({ finance_email_status: 'sent', finance_email_attempted_at: '2026-10-02T08:30:00.000Z' });
    const badge = screen.getByText(/Sent to Finance ·/);
    expect(badge.closest('[data-tone]').dataset.tone).toBe('neutral');
    expect(screen.queryByRole('button', { name: 'Resend to Finance' })).toBeNull();
  });

  it('shows "Not sent" with Resend when nothing was ever attempted', () => {
    renderDetail();
    expect(screen.getByText('Not sent').closest('[data-tone]').dataset.tone).toBe('neutral');
    expect(screen.getByRole('button', { name: 'Resend to Finance' })).toBeTruthy();
  });

  it('shows "Send failed" in the warning tone, the safe reason, and Resend', async () => {
    const user = userEvent.setup();
    const { onResendFinanceEmail } = renderDetail({
      finance_email_status: 'failed', finance_email_error: 'Gmail not connected',
    });
    expect(screen.getByText('Send failed').closest('[data-tone]').dataset.tone).toBe('warn');
    expect(screen.getByText('Gmail not connected')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Resend to Finance' }));
    expect(onResendFinanceEmail).toHaveBeenCalledTimes(1);
  });

  it('hides Resend from someone who cannot manage orders', () => {
    renderDetail({ finance_email_status: 'failed' }, { canManage: false });
    expect(screen.getByText('Send failed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend to Finance' })).toBeNull();
  });
});

describe('PurchaseOrderDetail — QuickBooks PO number', () => {
  it('shows "Not linked to QuickBooks yet" in a neutral badge when unlinked', () => {
    renderDetail();
    expect(screen.getByText('QuickBooks PO number')).toBeTruthy();
    expect(screen.getByText('Not linked to QuickBooks yet').closest('[data-tone]').dataset.tone).toBe('neutral');
  });

  it('shows "Linked to QuickBooks PO number <number>" when linked', () => {
    renderDetail({ quickbooks_po_id: 'QB-1042' });
    expect(screen.getByText('Linked to QuickBooks PO number QB-1042')).toBeTruthy();
  });

  it('uses the renamed edit label and placeholder', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit QuickBooks PO number' }));
    expect(screen.getByPlaceholderText('QuickBooks PO number')).toBeTruthy();
  });

  it('no longer says "reference" or "QBO" on screen', () => {
    renderDetail({ quickbooks_po_id: 'QB-1' });
    expect(document.body.textContent).not.toMatch(/QBO|reference/i);
  });
});

describe('PurchaseOrderForm — QuickBooks field', () => {
  it('is labelled "QuickBooks PO number (optional)", with the new placeholder and hint', () => {
    render(<PurchaseOrderForm suppliers={[]} products={[]} onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('QuickBooks PO number (optional)');
    expect(input.getAttribute('placeholder')).toBe('Leave blank');
    expect(screen.getByText('Only fill in if this order was already raised in QuickBooks.')).toBeTruthy();
  });
});
