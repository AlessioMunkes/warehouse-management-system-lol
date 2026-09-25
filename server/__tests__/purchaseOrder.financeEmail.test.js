// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.financeEmail.test.js
//
// Covers only the "email PO to Finance" side effect of
// createPurchaseOrder. See purchaseOrder.service.test.js for
// setPurchaseOrderStatus; general createPurchaseOrder validation
// coverage is a separate job (see that file's header comment).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  createPurchaseOrder: vi.fn(),
  recordFinanceEmailAttempt: vi.fn(),
};
const emailProviderMock = { sendEmail: vi.fn() };
const financeEmailFallbackMock = { getEmailSettings: vi.fn() };

vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: repoMock }));
vi.mock('../src/providers/email.provider.js', () => ({ default: emailProviderMock }));
vi.mock('../src/services/finance.service.js', () => ({ default: financeEmailFallbackMock }));

const { default: purchaseOrderService } = await import('../src/services/purchaseOrder.service.js');

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

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.createPurchaseOrder.mockResolvedValue({ ok: true, purchaseOrder: createdPO() });
  financeEmailFallbackMock.getEmailSettings.mockResolvedValue({ recipientEmail: 'finance@example.org', updatedBy: null, updatedAt: null });
  emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'abc123' });
});

describe('createPurchaseOrder — finance email', () => {
  it('still creates the PO when the finance email send throws', async () => {
    emailProviderMock.sendEmail.mockRejectedValue(new Error('Gmail is down'));

    const po = await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);

    expect(po.id).toBe(42);
    expect(repoMock.recordFinanceEmailAttempt).toHaveBeenCalledWith(42, {
      status: 'failed',
      error: 'Gmail is down',
      attemptedAt: expect.any(Date),
    });
  });

  it('writes status/error/attemptedAt after a successful send, not before', async () => {
    await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);

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

  it('skips the send and leaves status untouched when no recipient is configured', async () => {
    financeEmailFallbackMock.getEmailSettings.mockResolvedValue({ recipientEmail: null, updatedBy: null, updatedAt: null });

    const po = await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);

    expect(po.id).toBe(42);
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });

  it('does not record "sent" for a stubbed send (EMAIL_ENABLED=false)', async () => {
    emailProviderMock.sendEmail.mockResolvedValue({ sent: true, stubbed: true, messageId: 'stub-123', reason: 'Email disabled via EMAIL_ENABLED flag.' });

    const po = await purchaseOrderService.createPurchaseOrder(VALID_BODY, 7);

    expect(po.id).toBe(42);
    expect(emailProviderMock.sendEmail).toHaveBeenCalled();
    expect(repoMock.recordFinanceEmailAttempt).not.toHaveBeenCalled();
  });
});
