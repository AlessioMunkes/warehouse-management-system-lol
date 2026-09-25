import reminderRepository from '../repositories/ecdCollectionReminder.repository.js';
import emailProvider from '../providers/email.provider.js';

const DEFAULT_CHANNELS = ['sms'];
const EMAIL_CHANNEL = 'email';
const WHATSAPP_CHANNEL = 'whatsapp';
const SAST_TIME_ZONE = 'Africa/Johannesburg';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const dateStringInZone = (date, timeZone = SAST_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

const addDaysToIsoDate = (isoDate, days) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
};

const normaliseChannels = (channels = DEFAULT_CHANNELS) => {
  if (!Array.isArray(channels) || channels.length === 0) {
    fail(400, 'At least one reminder channel is required.');
  }

  const cleaned = channels
    .map((channel) => String(channel ?? '').trim().toLowerCase())
    .filter(Boolean);

  if (cleaned.length === 0) fail(400, 'At least one reminder channel is required.');
  return [...new Set(cleaned)];
};

const queueTomorrowCollectionReminders = async ({
  channels = DEFAULT_CHANNELS,
  now = new Date(),
} = {}) => {
  const today = dateStringInZone(now);
  const collectionDate = addDaysToIsoDate(today, 1);
  const reminderChannels = normaliseChannels(channels);
  const collections = await reminderRepository.findCollectionsByDate(collectionDate);

  const reminders = [];
  let skipped = 0;

  for (const collection of collections) {
    for (const channel of reminderChannels) {
      const reminder = await reminderRepository.createReminderOnce({
        ecdId: collection.ecd_id,
        collectionDate,
        channel,
      });

      if (reminder) {
        reminders.push(reminder);
      } else {
        skipped += 1;
      }
    }
  }

  return {
    collectionDate,
    channels: reminderChannels,
    collectionsFound: collections.length,
    created: reminders.length,
    skipped,
    reminders,
  };
};

const usableEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
};

const buildReminderEmail = (reminder) => {
  const ecdName = reminder.ecd_name || 'your ECD';
  const date = reminder.collection_date;
  const contactName = reminder.contact_name ? ` ${reminder.contact_name}` : '';

  const text = [
    `Hello${contactName},`,
    '',
    `This is a reminder that ${ecdName} is scheduled to collect tomorrow, ${date}.`,
    '',
    'Kind regards,',
    'Ladles of Love',
  ].join('\n');

  return {
    subject: `Collection reminder for ${date}`,
    text,
  };
};

const buildReminderMessage = (reminder) => {
  const ecdName = reminder.ecd_name || 'your ECD';
  const date = reminder.collection_date;
  const greeting = reminder.contact_name ? `Hello ${reminder.contact_name},` : 'Hello,';

  return [
    greeting,
    `This is a reminder that ${ecdName} is scheduled to collect tomorrow, ${date}.`,
    'Kind regards,',
    'Ladles of Love',
  ].join('\n\n');
};

const normaliseSaMobileToE164 = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (hasPlus && digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`;
  if (/^[6-8]\d{8}$/.test(digits)) return `+27${digits}`;

  return null;
};

const decorateWhatsAppReminder = (reminder) => {
  const message = buildReminderMessage(reminder);
  const e164 = normaliseSaMobileToE164(reminder.mobile_number);
  const waNumber = e164 ? e164.replace(/^\+/, '') : null;

  return {
    ...reminder,
    whatsappMessage: message,
    whatsappNumber: e164,
    whatsappLink: waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : null,
  };
};

const sendTomorrowCollectionReminderEmails = async ({ now = new Date() } = {}) => {
  const queued = await queueTomorrowCollectionReminders({
    channels: [EMAIL_CHANNEL],
    now,
  });

  const pending = await reminderRepository.listPendingReminderDeliveries({
    collectionDate: queued.collectionDate,
    channel: EMAIL_CHANNEL,
  });

  const results = [];

  for (const reminder of pending) {
    const claimed = await reminderRepository.claimReminderForSending(reminder.id);
    if (!claimed) {
      results.push({ reminderId: reminder.id, status: 'skipped', reason: 'Reminder was already claimed or sent.' });
      continue;
    }

    const to = usableEmail(reminder.contact_email);
    if (!to) {
      const errorMessage = 'ECD has no usable contact email.';
      await reminderRepository.markReminderFailed({ id: reminder.id, errorMessage });
      results.push({ reminderId: reminder.id, status: 'failed', error: errorMessage });
      continue;
    }

    const email = buildReminderEmail(reminder);
    const providerResult = await emailProvider.sendEmail({
      to,
      subject: email.subject,
      text: email.text,
    });

    if (providerResult?.sent) {
      await reminderRepository.markReminderSent({
        id: reminder.id,
        providerMessageId: providerResult.messageId ?? null,
      });
      results.push({
        reminderId: reminder.id,
        status: 'sent',
        recipientEmail: to,
        messageId: providerResult.messageId ?? null,
      });
    } else {
      const errorMessage = providerResult?.error || providerResult?.reason || 'Email provider did not send the reminder.';
      await reminderRepository.markReminderFailed({ id: reminder.id, errorMessage });
      results.push({ reminderId: reminder.id, status: 'failed', recipientEmail: to, error: errorMessage });
    }
  }

  return {
    collectionDate: queued.collectionDate,
    queued,
    attempted: results.filter((result) => result.status === 'sent' || result.recipientEmail).length,
    sent: results.filter((result) => result.status === 'sent').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    results,
  };
};

const listTomorrowWhatsAppReminders = async ({ now = new Date() } = {}) => {
  const queued = await queueTomorrowCollectionReminders({
    channels: [WHATSAPP_CHANNEL],
    now,
  });

  const reminders = await reminderRepository.listReminderDeliveries({
    collectionDate: queued.collectionDate,
    channel: WHATSAPP_CHANNEL,
  });

  return {
    collectionDate: queued.collectionDate,
    queued,
    reminders: reminders.map(decorateWhatsAppReminder),
  };
};

const markWhatsAppReminderSent = async (id) => {
  const reminderId = Number(id);
  if (!Number.isInteger(reminderId) || reminderId <= 0) {
    fail(400, 'A valid reminder ID is required.');
  }

  const reminder = await reminderRepository.getReminderDeliveryById(reminderId);
  if (!reminder) fail(404, 'Reminder not found.');
  if (reminder.channel !== WHATSAPP_CHANNEL) {
    fail(400, 'Only WhatsApp reminders can be marked sent through this path.');
  }
  if (reminder.status === 'sent') return decorateWhatsAppReminder(reminder);

  const updated = await reminderRepository.markReminderSent({ id: reminderId });
  return decorateWhatsAppReminder(updated ?? { ...reminder, status: 'sent' });
};

export default {
  queueTomorrowCollectionReminders,
  sendTomorrowCollectionReminderEmails,
  listTomorrowWhatsAppReminders,
  markWhatsAppReminderSent,
};
