// ─────────────────────────────────────────────────────────────
// server/__tests__/communications.test.js
//
// features/communications: the one send, its history row, the history
// listing, and the notices the operational services now raise.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const providerMock = { sendEmail: vi.fn() };
vi.mock('../src/providers/email.provider.js', () => ({ default: providerMock }));

const createNotification = vi.fn();
vi.mock('../src/repositories/notification.repository.js', () => ({ createNotification }));

// setup.js stubs the history repository for every file; this file
// inspects the stub.
const { default: outbound } = await import('../src/features/communications/outboundMessage.repository.js');
const { send, listMessages, outcomeOf } = await import('../src/features/communications/communications.service.js');
const { default: notices } = await import('../src/features/communications/notices.js');

beforeEach(() => {
  vi.clearAllMocks();
  providerMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'm-1' });
  outbound.record.mockResolvedValue({ id: 1 });
});

describe('send', () => {
  it('hands the message to the provider and returns its reply unchanged', async () => {
    const reply = await send({ type: 'user_invite', to: 'a@b.org', subject: 'Hi', text: 't', sendAs: null });
    expect(reply).toEqual({ sent: true, messageId: 'm-1' });
    expect(providerMock.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.org', subject: 'Hi', text: 't' }), null,
    );
  });

  it('sends as the account the sender asked for, and only that', async () => {
    await send({ type: 'test_email', to: 'a@b.org', subject: 's', text: 't', sentBy: 7, sendAs: 7 });
    expect(providerMock.sendEmail.mock.calls[0][1]).toBe(7);

    providerMock.sendEmail.mockClear();
    // No sendAs: the provider gets no second argument at all, as the
    // reminder and scheduled-report senders always called it — so
    // gmail.service.js still picks the latest connection.
    await send({ type: 'collection_reminder', to: 'a@b.org', subject: 's', text: 't', sentBy: 7 });
    expect(providerMock.sendEmail.mock.calls[0]).toHaveLength(1);
  });

  it('records one history row with the outcome and what it was about', async () => {
    await send({
      type: 'purchase_order_finance', to: 'fin@b.org', subject: 'PO-1', text: 't',
      related: { type: 'purchase_order', id: 12 }, sendAs: null,
    });
    expect(outbound.record).toHaveBeenCalledWith(expect.objectContaining({
      type: 'purchase_order_finance', recipient: 'fin@b.org', subject: 'PO-1',
      status: 'sent', error: null, relatedType: 'purchase_order', relatedId: 12,
    }));
  });

  it.each([
    [{ sent: true, stubbed: true }, 'stubbed'],
    [{ sent: false, error: 'quota' }, 'failed'],
    [undefined, 'failed'],
  ])('reads %j as %s', (reply, status) => {
    expect(outcomeOf(reply).status).toBe(status);
  });

  it('still returns the reply when the history cannot be written', async () => {
    outbound.record.mockRejectedValue(new Error('relation "outbound_messages" does not exist'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(send({ type: 'password_reset', to: 'a@b.org', subject: 's', text: 't', sendAs: null }))
      .resolves.toEqual({ sent: true, messageId: 'm-1' });
    spy.mockRestore();
  });

  it('refuses a type nobody could filter the history on', async () => {
    await expect(send({ type: 'misc', to: 'a@b.org', subject: 's', text: 't' })).rejects.toThrow(/Unknown message type/);
    expect(providerMock.sendEmail).not.toHaveBeenCalled();
  });
});

describe('listMessages', () => {
  it('filters by type and status and lists every type for the filter', async () => {
    const res = await listMessages({ type: 'scheduled_report', status: 'failed' });
    expect(outbound.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'scheduled_report', status: 'failed', limit: 50 }));
    expect(res.types.map((t) => t.key)).toContain('section_18a');
  });

  it.each([
    [{ type: 'nope' }],
    [{ status: 'delivered' }],
    [{ limit: '0' }],
    [{ limit: '201' }],
    [{ cursor: 'not-a-cursor' }],
  ])('rejects %j with 400', async (query) => {
    await expect(listMessages(query)).rejects.toMatchObject({ status: 400 });
  });

  it('turns the next-page cursor into something a URL can carry, and back', async () => {
    outbound.list.mockResolvedValueOnce({ rows: [], nextCursor: { attemptedAt: '2026-10-02T10:00:00Z', id: 9 } });
    const { nextCursor } = await listMessages({});
    await listMessages({ cursor: nextCursor });
    expect(outbound.list).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: { attemptedAt: '2026-10-02T10:00:00Z', id: 9 },
    }));
  });
});

describe('notices', () => {
  const client = { query: vi.fn() };

  it('announces generated slips once per run, and says nothing for none', async () => {
    await notices.slipsGenerated(client, { created: 0, cohort: 'tuesday', dispatchDate: '2026-10-06' });
    expect(createNotification).not.toHaveBeenCalled();

    await notices.slipsGenerated(client, { created: 3, cohort: 'tuesday', dispatchDate: '2026-10-06', emptySlips: [{}] });
    expect(createNotification).toHaveBeenCalledWith(client, expect.objectContaining({
      type: 'picking_slips_generated', title: '3 picking slips generated', body: 'tuesday, 2026-10-06. 1 with no lines to check.',
    }));
  });

  it('writes on the caller\'s transaction client', async () => {
    await notices.slipReleased(client, { slipId: 4, ecdName: 'Sunshine ECD' });
    expect(createNotification.mock.calls[0][0]).toBe(client);
  });

  it('flags non-collections in the singular when there is one', async () => {
    await notices.nonCollectionsFlagged(client, { flagged: 1, dispatchDate: '2026-10-01' });
    expect(createNotification.mock.calls[0][1].title).toBe('1 pallet not collected by 15:00');
  });

  it('raises a purchase-order notice only for returned and follow-up', async () => {
    const po = { id: 3, po_number: 'PO-3' };
    await notices.purchaseOrderNeedsAttention(client, { purchaseOrder: po, status: 'approved', reason: null });
    expect(createNotification).not.toHaveBeenCalled();
    await notices.purchaseOrderNeedsAttention(client, { purchaseOrder: po, status: 'follow_up_required', reason: 'Late' });
    expect(createNotification).toHaveBeenCalledWith(client, expect.objectContaining({
      title: 'Purchase order PO-3 needs follow-up', body: 'Late', entityId: 3,
    }));
  });
});
