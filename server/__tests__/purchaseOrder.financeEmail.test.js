// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.financeEmail.test.js
//
// The "tell Finance" side effect: sent when a manager APPROVES an order
// (never when it is only created, never for one that is returned), in
// one of two voices depending on whether QuickBooks is connected; the
// safe-error mapping; and resendFinanceEmail.
// See purchaseOrder.service.test.js for setPurchaseOrderStatus itself.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  createPurchaseOrder: vi.fn(),
  getPurchaseOrderById: vi.fn(),
  updatePurchaseOrderStatus: vi.fn(),
  recordFinanceEmailAttempt: vi.fn(),
};
const emailProviderMock = { sendEmail: vi.fn() };
const financeEmailFallbackMock = { getEmailSettings: vi.fn() };
const quickbooksMock = { isConnected: vi.fn(), pushInBackground: vi.fn() };

vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: repoMock }));
vi.mock('../src/integrations/email.provider.js', () => ({ default: emailProviderMock }));
vi.mock('../src/services/finance.service.js', () => ({ default: financeEmailFallbackMock }));
vi.mock('../src/services/quickbooks.service.js', () => ({ default: quickbooksMock }));

const { default: purchaseOrderService } = await import('../src/services/purchaseOrder.service.js');
const { safeFinanceEmailError, FINANCE_EMAIL_ERRORS } = await import('../src/utils/financeEmailError.js');
const { default: outboundMessages } = await import('../src/repositories/outboundMessage.repository.js');

const VALID_BODY = {
  supplierId: 1,
  expectedDeliveryDate: '2099-01-01',
  items: [{ productId: 1, expectedQuantity: 10, unitPrice: 120 }],
};

const poRow = (over = {}) => ({
  id: 42,
  po_number: 'PO-2026-0042',
  supplier_id: 1,
  supplier_name: 'Acme Foods',
  status: 'approved',
  created_by: 7,
  created_at: '2026-09-25T10:00:00.000Z',
  quickbooks_po_id: null,
  items: [
    { id: 1, product_id: 1, product_name: 'Rice 25kg', expected_quantity: 10, unit_price: 120, default_unit: 'bag' },
  ],
  ...over,
});
const createdPO = poRow;   // what resend and the history tests read: an approved order

// Approve order 42: it is pending when read, approved afterwards.
const approve = async () => {
  repoMock.getPurchaseOrderById.mockReset()
    .mockResolvedValueOnce(poRow({ status: 'pending' }))
    .mockResolvedValue(poRow());
  repoMock.updatePurchaseOrderStatus.mockResolvedValue(poRow());
  return purchaseOrderService.setPurchaseOrderStatus(42, { status: 'approved' }, 7);
};

// The send runs after the approval has returned, so tests wait for its
// effects rather than assuming they have happened.
const sendFinished = () => vi.waitFor(() => {
  expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalled();
});
const settle = () => new Promise((r) => setTimeout(r, 15));

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.recordFinanceEmailAttempt.mockReset().mockResolvedValue(undefined);
  emailProviderMock.sendEmail.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  repoMock.createPurchaseOrder.mockResolvedValue({ ok: true, purchaseOrder: poRow({ status: 'pending' }) });
  repoMock.getPurchaseOrderById.mockResolvedValue(createdPO());
  financeEmailFallbackMock.getEmailSettings.mockResolvedValue({ recipientEmail: 'finance@example.org', updatedBy: null, updatedAt: null });
  emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'abc123' });
  quickbooksMock.isConnected.mockReset().mockResolvedValue(false);
  quickbooksMock.pushInBackground.mockReset().mockResolvedValue(null);
});

describe('when Finance is told', () => {
  it('not when an order is created: it is only a request until a manager approves it', async () => {
    const po = await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);
    await settle();
    expect(po.id).toBe(42);
    expect(financeEmailFallbackMock.getEmailSettings).not.toHaveBeenCalled();
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(quickbooksMock.pushInBackground).not.toHaveBeenCalled();
  });

  it('when a manager approves it', async () => {
    await approve();
    await sendFinished();
    expect(emailProviderMock.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailProviderMock.sendEmail.mock.calls[0][0]).toMatchObject({ to: 'finance@example.org' });
  });

  it('never for a pending order that is deleted before anyone approves it', async () => {
    repoMock.deletePurchaseOrder = vi.fn().mockResolvedValue({ ok: true });
    await purchaseOrderService.deletePurchaseOrder(42, 7);
    await settle();
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(quickbooksMock.pushInBackground).not.toHaveBeenCalled();
  });

  it('not again when an approved order is later returned', async () => {
    repoMock.getPurchaseOrderById.mockReset().mockResolvedValue(poRow({ status: 'approved' }));
    repoMock.updatePurchaseOrderStatus.mockResolvedValue(poRow({ status: 'returned' }));
    await purchaseOrderService.setPurchaseOrderStatus(42, { status: 'returned', reason: 'Wrong supplier' }, 7);
    await settle();
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });

  it('not again when an already approved order moves on', async () => {
    repoMock.getPurchaseOrderById.mockReset().mockResolvedValue(poRow({ status: 'approved' }));
    repoMock.updatePurchaseOrderStatus.mockResolvedValue(poRow({ status: 'in_transit' }));
    await purchaseOrderService.setPurchaseOrderStatus(42, { status: 'in_transit' }, 7);
    await settle();
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });
});

describe('approving — the finance email', () => {
  it('returns as soon as the approval is saved, without waiting for the send', async () => {
    let finishSend;
    emailProviderMock.sendEmail.mockReturnValue(new Promise((resolve) => { finishSend = resolve; }));

    const po = await approve();

    expect(po.id).toBe(42);
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();

    // The send is still pending; once it resolves the status is written.
    await vi.waitFor(() => expect(emailProviderMock.sendEmail).toHaveBeenCalled());
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
    finishSend({ sent: true });
    await sendFinished();
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, expect.objectContaining({ status: 'sent' }));
  });

  it('still approves when the send throws, recording a safe message and logging the raw one', async () => {
    emailProviderMock.sendEmail.mockRejectedValue(new Error('connect ECONNREFUSED 142.250.0.1:443'));

    const po = await approve();
    expect(po.id).toBe(42);

    await sendFinished();
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, {
      status: 'failed',
      error: "The email service didn't respond. Try again.",
      attemptedAt: expect.any(Date),
    });
    expect(console.error).toHaveBeenCalledWith('[purchaseOrder:financeEmail]', expect.stringContaining('ECONNREFUSED'));
  });

  it('does not let a failing status write become an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    repoMock.recordFinanceEmailAttempt.mockRejectedValue(new Error('db down'));

    await approve();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('[purchaseOrder:financeEmail]', 'db down'));
    await new Promise((r) => setTimeout(r, 10));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('writes status/error/attemptedAt after a successful send, not before', async () => {
    await approve();
    await sendFinished();

    expect(emailProviderMock.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'finance@example.org' }),
      null
    );
    const sentEmail = emailProviderMock.sendEmail.mock.calls[0][0];
    expect(sentEmail.html).toContain('https://wms-lol.onrender.com/images/pdf_logo.png');
    expect(sentEmail.html).toContain('Purchase order approved');
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
    await approve();
    await sendFinished();
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, expect.objectContaining({
      status: 'failed', error: 'Ask an admin to connect Gmail in Settings, then resend.',
    }));
  });

  it('skips the send and leaves status untouched when no recipient is configured', async () => {
    financeEmailFallbackMock.getEmailSettings.mockResolvedValue({ recipientEmail: null, updatedBy: null, updatedAt: null });

    const po = await approve();
    await vi.waitFor(() => expect(financeEmailFallbackMock.getEmailSettings).toHaveBeenCalled());
    await settle();

    expect(po.id).toBe(42);
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });

  it('does not record "sent" for a stubbed send (EMAIL_ENABLED=false)', async () => {
    emailProviderMock.sendEmail.mockResolvedValue({ sent: true, stubbed: true, messageId: 'stub-123', reason: 'Email disabled via EMAIL_ENABLED flag.' });

    const po = await approve();
    await vi.waitFor(() => expect(emailProviderMock.sendEmail).toHaveBeenCalled());
    await settle();

    expect(po.id).toBe(42);
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });
});

describe('the email without QuickBooks connected', () => {
  it('asks Finance to capture it, typing the PO number into the QuickBooks Memo, with the number first', async () => {
    await approve();
    await sendFinished();

    const [mail] = emailProviderMock.sendEmail.mock.calls[0];
    const ask = "Capture this order in QuickBooks and type PO-2026-0042 into the QuickBooks PO's Memo field. The system links the two automatically from your QuickBooks export.";
    expect(mail.subject.startsWith('PO-2026-0042')).toBe(true);
    expect(mail.subject).toContain('capture in QuickBooks');
    expect(mail.text).toContain('has been approved and needs to be captured in QuickBooks');
    expect(mail.text).toContain(ask);
    expect(mail.html).toContain(ask.replace("'", '&#39;'));
    expect(mail.text).not.toMatch(/Batches|add the QuickBooks PO number|automatically, as QuickBooks PO/);
    expect(quickbooksMock.pushInBackground).not.toHaveBeenCalled();
  });
});

describe('the email with QuickBooks connected', () => {
  beforeEach(() => { quickbooksMock.isConnected.mockResolvedValue(true); });

  it('says it was sent to QuickBooks automatically, gives the QuickBooks number, and asks for no capture', async () => {
    // The send runs first and links the order; the email reads it afterwards.
    quickbooksMock.pushInBackground.mockImplementation(async () => {
      repoMock.getPurchaseOrderById.mockResolvedValue(poRow({ quickbooks_po_id: '1099' }));
      return { state: 'synced', quickbooksPoId: '1099' };
    });
    await approve();
    await sendFinished();

    const [mail] = emailProviderMock.sendEmail.mock.calls[0];
    expect(mail.subject).toContain('sent to QuickBooks automatically');
    expect(mail.subject).not.toContain('capture in QuickBooks');
    expect(mail.text).toContain('has been approved and sent to QuickBooks automatically, as QuickBooks PO 1099');
    expect(mail.text).toContain('There is nothing for you to capture');
    expect(mail.html).toContain('QuickBooks PO 1099');
    // It must not ask Robin to capture it or to type anything into a Memo.
    expect(mail.text).not.toMatch(/Capture this order|type PO-2026-0042|needs to be captured/);
    expect(mail.html).not.toMatch(/Capture this order|needs to be captured/);
  });

  it('sends the order to QuickBooks before it emails, so the email can say where it ended up', async () => {
    await approve();
    await sendFinished();
    expect(quickbooksMock.pushInBackground).toHaveBeenCalledWith(42);
    expect(quickbooksMock.pushInBackground.mock.invocationCallOrder[0])
      .toBeLessThan(emailProviderMock.sendEmail.mock.invocationCallOrder[0]);
  });

  it('still asks for no capture when the order has not reached QuickBooks yet, and says so', async () => {
    quickbooksMock.pushInBackground.mockResolvedValue({ state: 'needs_match', message: 'x' });
    await approve();
    await sendFinished();

    const [mail] = emailProviderMock.sendEmail.mock.calls[0];
    expect(mail.subject).toContain('sent to QuickBooks automatically');
    expect(mail.text).toContain('has not reached it yet');
    expect(mail.text).toContain('a manager is told and will sort it out');
    expect(mail.text).toContain('There is nothing for you to capture');
    expect(mail.text).not.toMatch(/as QuickBooks PO|Capture this order/);
  });

  it('still emails Finance when the QuickBooks send throws', async () => {
    // pushInBackground never rejects in practice; this is the belt and braces.
    quickbooksMock.pushInBackground.mockRejectedValue(new Error('boom'));
    await approve();
    await sendFinished();
    expect(emailProviderMock.sendEmail).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('[purchaseOrder:financeEmail]', 'boom');
  });

  it('a manual resend reads the order as it stands: the number once linked', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(poRow({ quickbooks_po_id: 'PO-2026-0042' }));
    await purchaseOrderService.resendFinanceEmail(42, 9);
    const [mail] = emailProviderMock.sendEmail.mock.calls[0];
    expect(mail.text).toContain('as QuickBooks PO PO-2026-0042');
  });
});

describe('the amounts in the finance email', () => {
  it('shows each line rounded half up and a total that is the sum of those lines', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(createdPO({ items: [
      { id: 1, product_id: 1, product_name: 'Rocks', expected_quantity: '100.000', unit_price: '12.50', default_unit: 'kg' },
      { id: 2, product_id: 2, product_name: 'Soil', expected_quantity: '2.500', unit_price: '33.33', default_unit: 'kg' },
    ] }));
    emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'x' });
    await purchaseOrderService.resendFinanceEmail(42, 7);
    const mail = emailProviderMock.sendEmail.mock.calls[0][0];
    const num = (t) => Number(t.replace(/[^0-9,]/g, '').replace(',', '.'));
    const lines = [...mail.text.matchAll(/= (R [^\n]+)/g)].map((m) => num(m[1]));
    const total = num(mail.text.match(/Total: (R [^\n]+)/)[1]);
    expect(lines).toEqual([1250, 83.33]);
    expect(total).toBe(1333.33);
    expect(Math.round(lines.reduce((a, b) => a + b, 0) * 100) / 100).toBe(total);
  });
});

describe('safeFinanceEmailError', () => {
  it.each([
    ['No Gmail connection found. Please connect Gmail first.', 'Ask an admin to connect Gmail in Settings, then resend.'],
    ['Failed to refresh Gmail access token. Please reconnect Gmail.', 'Ask an admin to connect Gmail in Settings, then resend.'],
    ['invalid_grant', 'Ask an admin to connect Gmail in Settings, then resend.'],
    ['getaddrinfo ENOTFOUND gmail.googleapis.com', "The email service didn't respond. Try again."],
    ['fetch failed', "The email service didn't respond. Try again."],
    ['Gmail API send failed.', "The email didn't send. Try again."],
    ['550 5.1.1 someone@secret-host.internal rejected', "The email didn't send. Try again."],
  ])('maps %j to %j', (raw, safe) => {
    expect(safeFinanceEmailError(raw)).toBe(safe);
  });

  it('returns null for no error and never echoes unknown text', () => {
    expect(safeFinanceEmailError(null)).toBeNull();
    expect(safeFinanceEmailError('')).toBeNull();
    expect(safeFinanceEmailError('token=abc123 leaked')).not.toContain('abc123');
  });

  it('is idempotent on already-safe messages', () => {
    for (const m of [FINANCE_EMAIL_ERRORS.noRecipient, FINANCE_EMAIL_ERRORS.notConnected, FINANCE_EMAIL_ERRORS.unreachable, FINANCE_EMAIL_ERRORS.generic]) {
      expect(safeFinanceEmailError(m)).toBe(m);
    }
  });

  it('maps the texts earlier versions stored to the current ones', () => {
    expect(safeFinanceEmailError('No Finance recipient saved')).toBe(FINANCE_EMAIL_ERRORS.noRecipient);
    expect(safeFinanceEmailError('Gmail not connected')).toBe(FINANCE_EMAIL_ERRORS.notConnected);
    expect(safeFinanceEmailError("Couldn't reach the email service")).toBe(FINANCE_EMAIL_ERRORS.unreachable);
    expect(safeFinanceEmailError('Send failed')).toBe(FINANCE_EMAIL_ERRORS.generic);
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
      status: 'failed', error: 'Ask an admin to connect Gmail in Settings, then resend.',
    }));
    expect(po.finance_email_error).toBe('Gmail not connected');
  });

  it('400s with the Finance recipient message when none is set', async () => {
    financeEmailFallbackMock.getEmailSettings.mockResolvedValue({ recipientEmail: null });
    await expect(purchaseOrderService.resendFinanceEmail(42))
      .rejects.toMatchObject({ status: 400, message: 'Ask an admin to add a Finance email address in Settings, then resend.' });
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });

  it('409s for an order nobody has approved: Finance is told on approval, so there is nothing to resend', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(poRow({ status: 'pending' }));
    await expect(purchaseOrderService.resendFinanceEmail(42)).rejects.toMatchObject({ status: 409, message: /Approve this order/ });
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });

  it('409s for a returned order, which Finance is never told about', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(poRow({ status: 'returned' }));
    await expect(purchaseOrderService.resendFinanceEmail(42)).rejects.toMatchObject({ status: 409, message: /returned/ });
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
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

// The send goes through the communications module, so it lands in the
// message history; the provider's reply still drives the status write.
describe('finance email — message history', () => {
  it('records a purchase_order_finance message tied to the PO and the user who caused it', async () => {
    const record = vi.spyOn(outboundMessages, 'record').mockResolvedValue(undefined);

    await purchaseOrderService.resendFinanceEmail(42, 9);

    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      type: 'purchase_order_finance',
      status: 'sent',
      recipient: 'finance@example.org',
      relatedType: 'purchase_order',
      relatedId: 42,
      sentBy: 9,
    }));
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(
      42, expect.objectContaining({ status: 'sent' }),
    );
  });

  it('a history write that fails does not change the outcome', async () => {
    vi.spyOn(outboundMessages, 'record').mockRejectedValue(new Error('relation does not exist'));

    await expect(purchaseOrderService.resendFinanceEmail(42, 9)).resolves.toBeTruthy();
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(
      42, expect.objectContaining({ status: 'sent' }),
    );
  });
});
