import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoMock = {
  findCollectionsByDate: vi.fn(),
  listPendingReminderDeliveries: vi.fn(),
  listReminderDeliveries: vi.fn(),
  getReminderDeliveryById: vi.fn(),
  createReminderOnce: vi.fn(),
  claimReminderForSending: vi.fn(),
  markReminderSent: vi.fn(),
  markReminderFailed: vi.fn(),
};

const emailProviderMock = {
  sendEmail: vi.fn(),
};

vi.mock('../src/repositories/ecdCollectionReminder.repository.js', () => ({ default: repoMock }));
vi.mock('../src/providers/email.provider.js', () => ({ default: emailProviderMock }));

const { default: service } = await import('../src/services/ecdCollectionReminder.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findCollectionsByDate.mockResolvedValue([]);
  repoMock.listPendingReminderDeliveries.mockResolvedValue([]);
  repoMock.listReminderDeliveries.mockResolvedValue([]);
  repoMock.getReminderDeliveryById.mockResolvedValue(null);
  repoMock.createReminderOnce.mockResolvedValue(null);
  repoMock.claimReminderForSending.mockImplementation(async (id) => ({ id }));
  repoMock.markReminderSent.mockResolvedValue({});
  repoMock.markReminderFailed.mockResolvedValue({});
  emailProviderMock.sendEmail.mockResolvedValue({ sent: true, messageId: 'gmail-1' });
});

describe('queueTomorrowCollectionReminders', () => {
  it('finds collections for tomorrow in SAST', async () => {
    repoMock.findCollectionsByDate.mockResolvedValueOnce([
      { ecd_id: 1, collection_date: '2026-09-24' },
    ]);
    repoMock.createReminderOnce.mockResolvedValueOnce({ id: 10 });

    const result = await service.queueTomorrowCollectionReminders({
      now: new Date('2026-09-23T22:30:00.000Z'),
    });

    expect(repoMock.findCollectionsByDate).toHaveBeenCalledWith('2026-09-25');
    expect(repoMock.createReminderOnce).toHaveBeenCalledWith({
      ecdId: 1,
      collectionDate: '2026-09-25',
      channel: 'sms',
    });
    expect(result).toMatchObject({
      collectionDate: '2026-09-25',
      channels: ['sms'],
      collectionsFound: 1,
      created: 1,
      skipped: 0,
    });
  });

  it('creates at most one reminder per ECD, date, and channel', async () => {
    repoMock.findCollectionsByDate.mockResolvedValueOnce([
      { ecd_id: 1, collection_date: '2026-09-24' },
      { ecd_id: 2, collection_date: '2026-09-24' },
    ]);
    repoMock.createReminderOnce
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 12 })
      .mockResolvedValueOnce(null);

    const result = await service.queueTomorrowCollectionReminders({
      now: new Date('2026-09-23T08:00:00.000Z'),
      channels: ['sms', 'sms', 'email'],
    });

    expect(repoMock.createReminderOnce).toHaveBeenCalledTimes(4);
    expect(repoMock.createReminderOnce.mock.calls.map(([arg]) => arg)).toEqual([
      { ecdId: 1, collectionDate: '2026-09-24', channel: 'sms' },
      { ecdId: 1, collectionDate: '2026-09-24', channel: 'email' },
      { ecdId: 2, collectionDate: '2026-09-24', channel: 'sms' },
      { ecdId: 2, collectionDate: '2026-09-24', channel: 'email' },
    ]);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(2);
  });

  it('rejects an empty channel list', async () => {
    await expect(service.queueTomorrowCollectionReminders({ channels: [] }))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.findCollectionsByDate).not.toHaveBeenCalled();
  });
});

describe('sendTomorrowCollectionReminderEmails', () => {
  it('uses the existing reminder queue and sends pending email reminders with usable email addresses', async () => {
    repoMock.findCollectionsByDate.mockResolvedValueOnce([
      { ecd_id: 1, collection_date: '2026-09-24' },
    ]);
    repoMock.createReminderOnce.mockResolvedValueOnce({ id: 10 });
    repoMock.listPendingReminderDeliveries.mockResolvedValueOnce([
      {
        id: 10,
        ecd_id: 1,
        collection_date: '2026-09-24',
        ecd_name: 'Little Stars',
        contact_name: 'Nomsa',
        contact_email: ' Nomsa@Example.ORG ',
      },
    ]);

    const result = await service.sendTomorrowCollectionReminderEmails({
      now: new Date('2026-09-23T08:00:00.000Z'),
    });

    expect(repoMock.createReminderOnce).toHaveBeenCalledWith({
      ecdId: 1,
      collectionDate: '2026-09-24',
      channel: 'email',
    });
    expect(repoMock.claimReminderForSending).toHaveBeenCalledWith(10);
    expect(emailProviderMock.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'nomsa@example.org',
      subject: 'Collection reminder for 2026-09-24',
    }));
    expect(repoMock.markReminderSent).toHaveBeenCalledWith({
      id: 10,
      providerMessageId: 'gmail-1',
    });
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('does not send or mark sent when a reminder has no usable email', async () => {
    repoMock.listPendingReminderDeliveries.mockResolvedValueOnce([
      { id: 11, collection_date: '2026-09-24', contact_email: 'not-email' },
    ]);

    const result = await service.sendTomorrowCollectionReminderEmails({
      now: new Date('2026-09-23T08:00:00.000Z'),
    });

    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(repoMock.markReminderFailed).toHaveBeenCalledWith({
      id: 11,
      errorMessage: 'ECD has no usable contact email.',
    });
    expect(repoMock.markReminderSent).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it('marks the reminder failed with provider error when Gmail cannot send', async () => {
    repoMock.listPendingReminderDeliveries.mockResolvedValueOnce([
      { id: 12, collection_date: '2026-09-24', ecd_name: 'Little Stars', contact_email: 'ecd@example.org' },
    ]);
    emailProviderMock.sendEmail.mockResolvedValueOnce({ sent: false, error: 'Gmail down' });

    const result = await service.sendTomorrowCollectionReminderEmails({
      now: new Date('2026-09-23T08:00:00.000Z'),
    });

    expect(repoMock.markReminderFailed).toHaveBeenCalledWith({
      id: 12,
      errorMessage: 'Gmail down',
    });
    expect(result.failed).toBe(1);
  });

  it('prevents duplicate sends by claiming the pending reminder before sending', async () => {
    repoMock.listPendingReminderDeliveries.mockResolvedValueOnce([
      { id: 13, collection_date: '2026-09-24', contact_email: 'ecd@example.org' },
    ]);
    repoMock.claimReminderForSending.mockResolvedValueOnce(null);

    const result = await service.sendTomorrowCollectionReminderEmails({
      now: new Date('2026-09-23T08:00:00.000Z'),
    });

    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
    expect(repoMock.markReminderSent).not.toHaveBeenCalled();
    expect(repoMock.markReminderFailed).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});

describe('listTomorrowWhatsAppReminders', () => {
  it('creates WhatsApp reminder records using the existing queue and returns wa.me links', async () => {
    repoMock.findCollectionsByDate.mockResolvedValueOnce([
      { ecd_id: 1, collection_date: '2026-09-24' },
    ]);
    repoMock.createReminderOnce.mockResolvedValueOnce({ id: 20 });
    repoMock.listReminderDeliveries.mockResolvedValueOnce([
      {
        id: 20,
        ecd_id: 1,
        collection_date: '2026-09-24',
        channel: 'whatsapp',
        status: 'pending',
        ecd_name: 'Little Stars',
        contact_name: 'Nomsa',
        mobile_number: '082 123 4567',
      },
    ]);

    const result = await service.listTomorrowWhatsAppReminders({
      now: new Date('2026-09-23T08:00:00.000Z'),
    });

    expect(repoMock.createReminderOnce).toHaveBeenCalledWith({
      ecdId: 1,
      collectionDate: '2026-09-24',
      channel: 'whatsapp',
    });
    expect(repoMock.listReminderDeliveries).toHaveBeenCalledWith({
      collectionDate: '2026-09-24',
      channel: 'whatsapp',
    });
    expect(result.reminders[0]).toMatchObject({
      whatsappNumber: '+27821234567',
      whatsappMessage: expect.stringContaining('Little Stars is scheduled to collect tomorrow, 2026-09-24.'),
    });
    expect(result.reminders[0].whatsappLink).toContain('https://wa.me/27821234567?text=');
    expect(decodeURIComponent(result.reminders[0].whatsappLink.split('text=')[1]))
      .toContain('Hello Nomsa,');
    expect(emailProviderMock.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['+27 82 123 4567', '+27821234567', '27821234567'],
    ['27821234567', '+27821234567', '27821234567'],
    ['82 123 4567', '+27821234567', '27821234567'],
  ])('normalizes %s to %s', async (mobileNumber, e164, waNumber) => {
    repoMock.listReminderDeliveries.mockResolvedValueOnce([
      {
        id: 21,
        collection_date: '2026-09-24',
        channel: 'whatsapp',
        ecd_name: 'Little Stars',
        mobile_number: mobileNumber,
      },
    ]);

    const result = await service.listTomorrowWhatsAppReminders({
      now: new Date('2026-09-23T08:00:00.000Z'),
    });

    expect(result.reminders[0].whatsappNumber).toBe(e164);
    expect(result.reminders[0].whatsappLink).toContain(`https://wa.me/${waNumber}?text=`);
  });

  it('returns the message but no wa.me link when the mobile number is not usable', async () => {
    repoMock.listReminderDeliveries.mockResolvedValueOnce([
      {
        id: 22,
        collection_date: '2026-09-24',
        channel: 'whatsapp',
        ecd_name: 'Little Stars',
        mobile_number: '123',
      },
    ]);

    const result = await service.listTomorrowWhatsAppReminders({
      now: new Date('2026-09-23T08:00:00.000Z'),
    });

    expect(result.reminders[0].whatsappNumber).toBeNull();
    expect(result.reminders[0].whatsappLink).toBeNull();
    expect(result.reminders[0].whatsappMessage).toContain('Little Stars');
  });
});

describe('markWhatsAppReminderSent', () => {
  it('marks a WhatsApp reminder sent manually without a provider message id', async () => {
    repoMock.getReminderDeliveryById.mockResolvedValueOnce({
      id: 30,
      collection_date: '2026-09-24',
      channel: 'whatsapp',
      status: 'pending',
      ecd_name: 'Little Stars',
      mobile_number: '0821234567',
    });
    repoMock.markReminderSent.mockResolvedValueOnce({
      id: 30,
      collection_date: '2026-09-24',
      channel: 'whatsapp',
      status: 'sent',
      ecd_name: 'Little Stars',
      mobile_number: '0821234567',
    });

    const result = await service.markWhatsAppReminderSent(30);

    expect(repoMock.markReminderSent).toHaveBeenCalledWith({ id: 30 });
    expect(result.status).toBe('sent');
    expect(result.whatsappLink).toContain('https://wa.me/27821234567?text=');
  });

  it('does not rewrite an already-sent WhatsApp reminder', async () => {
    repoMock.getReminderDeliveryById.mockResolvedValueOnce({
      id: 31,
      collection_date: '2026-09-24',
      channel: 'whatsapp',
      status: 'sent',
      ecd_name: 'Little Stars',
      mobile_number: '0821234567',
    });

    await service.markWhatsAppReminderSent(31);

    expect(repoMock.markReminderSent).not.toHaveBeenCalled();
  });

  it('rejects non-WhatsApp reminders', async () => {
    repoMock.getReminderDeliveryById.mockResolvedValueOnce({
      id: 32,
      channel: 'email',
      status: 'pending',
    });

    await expect(service.markWhatsAppReminderSent(32))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.markReminderSent).not.toHaveBeenCalled();
  });
});
