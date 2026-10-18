import { beforeEach, describe, expect, it, vi } from 'vitest';
import collectionReminderAPI, { toCollectionReminder } from '../services/collectionReminderAPI';
import { apiGet, apiPatch } from '../services/api';

vi.mock('../services/api', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('collectionReminderAPI', () => {
  it('maps backend reminder rows into the UI shape', () => {
    expect(toCollectionReminder({
      id: 1,
      ecd_id: 7,
      ecd_name: 'Little Stars',
      contact_name: 'Nomsa',
      collection_date: '2026-09-24',
      status: 'pending',
      channel: 'whatsapp',
      mobile_number: '0821234567',
      whatsapp_link: 'https://wa.me/27821234567?text=Hello',
      email_reminder_status: 'failed',
      can_retry_email: true,
    })).toMatchObject({
      id: 1,
      ecdId: 7,
      ecdName: 'Little Stars',
      contactName: 'Nomsa',
      collectionDate: '2026-09-24',
      whatsappStatus: 'pending',
      emailStatus: 'failed',
      mobileNumber: '0821234567',
      whatsappLink: 'https://wa.me/27821234567?text=Hello',
      canRetryEmail: true,
    });
  });

  it('loads tomorrow reminders from the existing WhatsApp reminder API', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        collectionDate: '2026-09-24',
        reminders: [{ id: 1, ecd_name: 'Little Stars', channel: 'whatsapp', status: 'pending' }],
      },
    });

    const result = await collectionReminderAPI.getTomorrowCollectionReminders();

    expect(apiGet).toHaveBeenCalledWith('/api/collection-reminders/whatsapp/tomorrow');
    expect(result.collectionDate).toBe('2026-09-24');
    expect(result.reminders[0]).toMatchObject({ ecdName: 'Little Stars', whatsappStatus: 'pending' });
  });

  it('marks WhatsApp sent through the existing PATCH endpoint', async () => {
    apiPatch.mockResolvedValueOnce({ data: { id: 1, channel: 'whatsapp', status: 'sent' } });

    const result = await collectionReminderAPI.markWhatsAppReminderSent(1);

    expect(apiPatch).toHaveBeenCalledWith('/api/collection-reminders/whatsapp/1/sent', {});
    expect(result.whatsappStatus).toBe('sent');
  });
});
