// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.financeEmail.test.js
//
// The "email PO to Finance" side effect: the fire-and-forget send after
// createPurchaseOrder, the safe-error mapping, and resendFinanceEmail.
// See purchaseOrder.service.test.js for setPurchaseOrderStatus.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  createPurchaseOrder: vi.fn(),
  getPurchaseOrderById: vi.fn(),
  recordFinanceEmailAttempt: vi.fn(),
};
const emailProviderMock = { sendEmail: vi.fn() };
const financeEmailFallbackMock = { getEmailSettings: vi.fn() };

vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: repoMock }));
vi.mock('../src/providers/email.provider.js', () => ({ default: emailProviderMock }));
vi.mock('../src/services/finance.service.js', () => ({ default: financeEmailFallbackMock }));

const { default: purchaseOrderService } = await import('../src/services/purchaseOrder.service.js');
const { safeFinanceEmailError } = await import('../src/utils/financeEmailError.js');

const VALID_BODY = {
  supplierId: 1,
  expectedDeliveryDate: '2099-01-01',
  items: [{ productId: 1, expectedQuantity: 10, unitPrice: 120 }],
};

const createdPO = (over = {}) => ({
  id: 42,
  po_number: 'PO-2026-0042',
  supplier_id: 1,
  supplier_name: 'Acme Foods',
  status: 'pending',
  created_by: 7,
  created_at: '2026-09-25T10:00:00.000Z',
  items: [
    { id: 1, product_id: 1, product_name: 'Rice 25kg', expected_quantity: 10, unit_price: 120, default_unit: 'bag' },
  ],
  ...over,
});

// The send runs after createPurchaseOrder has returned, so tests wait
// for its effects rather than assuming they have happened.
const sendFinished = () => vi.waitFor(() => {
  expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalled();
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.recordFinanceEmailAttempt.mockReset().mockResolvedValue(undefined);
  emailProviderMock.sendEmail.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  repoMock.createPurchaseOrder.mockResolvedValue({ ok: true, purchaseOrder: createdPO() });
  repoMock.getPurchaseOrderById.mockResolvedValue(createdPO());
  financeEmailFallbackMock.getEmailSettings.mockResolvedValue({ recipientEmail: 'finance@example.org', updatedBy: null, updatedAt: null });
  emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'abc123' });
});

describe('createPurchaseOrder — finance email', () => {
  it('returns as soon as the PO is committed, without waiting for the send', async () => {
    let finishSend;
    emailProviderMock.sendEmail.mockReturnValue(new Promise((resolve) => { finishSend = resolve; }));

    const po = await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);

    expect(po.id).toBe(42);
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();

    // The send is still pending; once it resolves the status is written.
    await vi.waitFor(() => expect(emailProviderMock.sendEmail).toHaveBeenCalled());
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
    finishSend({ sent: true });
    await sendFinished();
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, expect.objectContaining({ status: 'sent' }));
  });

  it('still creates the PO when the send throws, recording a safe message and logging the raw one', async () => {
    emailProviderMock.sendEmail.mockRejectedValue(new Error('connect ECONNREFUSED 142.250.0.1:443'));

    const po = await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);
    expect(po.id).toBe(42);

    await sendFinished();
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, {
      status: 'failed',
      error: "Couldn't reach the email service",
      attemptedAt: expect.any(Date),
    });
    expect(console.error).toHaveBeenCalledWith('[purchaseOrder:financeEmail]', expect.stringContaining('ECONNREFUSED'));
  });

  it('does not let a failing status write become an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    repoMock.recordFinanceEmailAttempt.mockRejectedValue(new Error('db down'));

    await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('[purchaseOrder:financeEmail]', 'db down'));
    await new Promise((r) => setTimeout(r, 10));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('writes status/error/attemptedAt after a successful send, not before', async () => {
    await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);
    await sendFinished();

    expect(emailProviderMock.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'finance@example.org' }),
      null
    );
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, {
      status: 'sent',
      error: null,
      attemptedAt: expect.any(Date),
    });

    const sendOrder = emailProviderMock.sendEmail.mock.invocationCallOrder[0];
    const writeOrder = repoMock.recordFinanceEmailAttempt.mock.invocationCallOrder[0];
    expect(writeOrder).toBeGreaterThan(sendOrder);
  });

  it('records a safe message when the provider reports a failure', async () => {
    emailProviderMock.sendEmail.mockResolvedValue({ sent: false, error: 'No Gmail connection found. Please connect Gmail first.' });
    await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);
    await sendFinished();
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, expect.objectContaining({
      status: 'failed', error: 'Gmail not connected',
    }));
  });

  it('skips the send and leaves status untouched when no recipient is configured', async () => {
    financeEmailFallbackMock.getEmailSettings.mockResolvedValue({ recipientEmail: null, updatedBy: null, updatedAt: null });

    const po = await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);
    await vi.waitFor(() => expect(financeEmailFallbackMock.getEmailSettings).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));

    expect(po.id).toBe(42);
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });

  it('does not record "sent" for a stubbed send (EMAIL_ENABLED=false)', async () => {
    emailProviderMock.sendEmail.mockResolvedValue({ sent: true, stubbed: true, messageId: 'stub-123', reason: 'Email disabled via EMAIL_ENABLED flag.' });

    const po = await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);
    await vi.waitFor(() => expect(emailProviderMock.sendEmail).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));

    expect(po.id).toBe(42);
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });
});

describe('safeFinanceEmailError', () => {
  it.each([
    ['No Gmail connection found. Please connect Gmail first.', 'Gmail not connected'],
    ['Failed to refresh Gmail access token. Please reconnect Gmail.', 'Gmail not connected'],
    ['invalid_grant', 'Gmail not connected'],
    ['getaddrinfo ENOTFOUND gmail.googleapis.com', "Couldn't reach the email service"],
    ['fetch failed', "Couldn't reach the email service"],
    ['Gmail API send failed.', 'Send failed'],
    ['550 5.1.1 someone@secret-host.internal rejected', 'Send failed'],
  ])('maps %j to %j', (raw, safe) => {
    expect(safeFinanceEmailError(raw)).toBe(safe);
  });

  it('returns null for no error and never echoes unknown text', () => {
    expect(safeFinanceEmailError(null)).toBeNull();
    expect(safeFinanceEmailError('')).toBeNull();
    expect(safeFinanceEmailError('token=abc123 leaked')).not.toContain('abc123');
  });

  it('is idempotent on already-safe messages', () => {
    for (const m of ['No Finance recipient saved', 'Gmail not connected', "Couldn't reach the email service", 'Send failed']) {
      expect(safeFinanceEmailError(m)).toBe(m);
    }
  });
});

describe('resendFinanceEmail', () => {
  it('sends, writes the status after the attempt, and returns the refreshed PO', async () => {
    repoMock.getPurchaseOrderById
      .mockResolvedValueOnce(createdPO())
      .mockResolvedValueOnce(createdPO({ finance_email_status: 'sent' }));

    const po = await purchaseOrderService.resendFinanceEmail('42');

    expect(emailProviderMock.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'finance@example.org' }), null);
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, {
      status: 'sent', error: null, attemptedAt: expect.any(Date),
    });
    expect(emailProviderMock.sendEmail.mock.invocationCallOrder[0])
      .toBeLessThan(repoMock.recordFinanceEmailAttempt.mock.invocationCallOrder[0]);
    expect(po.finance_email_status).toBe('sent');
  });

  it('records a failure with a safe message and still returns the PO', async () => {
    emailProviderMock.sendEmail.mockRejectedValue(new Error('invalid_grant: Token has been expired'));
    repoMock.getPurchaseOrderById.mockResolvedValue(createdPO({ finance_email_status: 'failed', finance_email_error: 'Gmail not connected' }));

    const po = await purchaseOrderService.resendFinanceEmail(42);

    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, expect.objectContaining({
      status: 'failed', error: 'Gmail not connected',
    }));
    expect(po.finance_email_error).toBe('Gmail not connected');
  });

  it('400s with "No Finance recipient saved" when none is set', async () => {
    financeEmailFallbackMock.getEmailSettings.mockResolvedValue({ recipientEmail: null });
    await expect(purchaseOrderService.resendFinanceEmail(42))
      .rejects.toMatchObject({ status: 400, message: 'No Finance recipient saved' });
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });

  it('404s for a PO that does not exist and 400s for a bad id', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(null);
    await expect(purchaseOrderService.resendFinanceEmail(999)).rejects.toMatchObject({ status: 404 });
    await expect(purchaseOrderService.resendFinanceEmail('abc')).rejects.toMatchObject({ status: 400 });
  });

  it('409s while a send for the same PO is already in progress, and clears the flag afterwards', async () => {
    let finishSend;
    emailProviderMock.sendEmail.mockReturnValueOnce(new Promise((resolve) => { finishSend = resolve; }));

    const first = purchaseOrderService.resendFinanceEmail(42);
    await vi.waitFor(() => expect(emailProviderMock.sendEmail).toHaveBeenCalledTimes(1));

    await expect(purchaseOrderService.resendFinanceEmail(42)).rejects.toMatchObject({ status: 409 });
    expect(emailProviderMock.sendEmail).toHaveBeenCalledTimes(1);

    finishSend({ sent: true });
    await first;

    // Flag cleared: a later resend goes through.
    await purchaseOrderService.resendFinanceEmail(42);
    expect(emailProviderMock.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('clears the in-progress flag even when the status write throws', async () => {
    repoMock.recordFinanceEmailAttempt.mockRejectedValueOnce(new Error('db down'));
    await expect(purchaseOrderService.resendFinanceEmail(42)).rejects.toThrow('db down');
    await purchaseOrderService.resendFinanceEmail(42);
    expect(emailProviderMock.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('503s on a stubbed send rather than pretending it was sent', async () => {
    emailProviderMock.sendEmail.mockResolvedValue({ sent: true, stubbed: true });
    await expect(purchaseOrderService.resendFinanceEmail(42)).rejects.toMatchObject({ status: 503 });
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });
});
