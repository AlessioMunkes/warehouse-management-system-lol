import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ROLES } from '../src/middleware/auth.middleware.js';
import { authCookie } from './helpers/testAuth.js';

const serviceMock = {
  listTomorrowWhatsAppReminders: vi.fn(),
  markWhatsAppReminderSent: vi.fn(),
};

vi.mock('../src/services/ecdCollectionReminder.service.js', () => ({ default: serviceMock }));

const { buildEcdCollectionReminderApp } = await import('./helpers/ecdCollectionReminderApp.js');
const app = buildEcdCollectionReminderApp();
const BASE = '/api/collection-reminders';

const cookieFor = (role) => [authCookie({ id: 1, username: 'reminder.user', role })];

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.listTomorrowWhatsAppReminders.mockResolvedValue({
    collectionDate: '2026-09-24',
    reminders: [{ id: 1, whatsappLink: 'https://wa.me/27821234567?text=Hello' }],
  });
  serviceMock.markWhatsAppReminderSent.mockResolvedValue({ id: 1, status: 'sent' });
});

describe('ECD collection reminder WhatsApp routes', () => {
  it('requires authentication', async () => {
    const list = await request(app).get(`${BASE}/whatsapp/tomorrow`);
    const mark = await request(app).patch(`${BASE}/whatsapp/1/sent`);

    expect(list.status).toBe(401);
    expect(mark.status).toBe(401);
  });

  it.each([ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN])('%s can list WhatsApp links', async (role) => {
    const res = await request(app)
      .get(`${BASE}/whatsapp/tomorrow`)
      .set('Cookie', cookieFor(role));

    expect(res.status).toBe(200);
    expect(res.body.data.reminders[0].whatsappLink).toContain('https://wa.me/');
  });

  it('marks a WhatsApp reminder sent manually', async () => {
    const res = await request(app)
      .patch(`${BASE}/whatsapp/1/sent`)
      .set('Cookie', cookieFor(ROLES.WORKER));

    expect(res.status).toBe(200);
    expect(serviceMock.markWhatsAppReminderSent).toHaveBeenCalledWith(1);
    expect(res.body.data).toMatchObject({ id: 1, status: 'sent' });
  });

  it.each(['abc', '0', '-1'])('rejects reminder id "%s"', async (id) => {
    const res = await request(app)
      .patch(`${BASE}/whatsapp/${id}/sent`)
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(400);
    expect(serviceMock.markWhatsAppReminderSent).not.toHaveBeenCalled();
  });

  it('hides unexpected service errors behind a safe message', async () => {
    serviceMock.listTomorrowWhatsAppReminders.mockRejectedValueOnce(new Error('relation missing'));

    const res = await request(app)
      .get(`${BASE}/whatsapp/tomorrow`)
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to retrieve WhatsApp reminders.');
  });
});
