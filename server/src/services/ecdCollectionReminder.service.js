import reminderRepository from '../repositories/ecdCollectionReminder.repository.js';
import emailProvider from '../providers/email.provider.js';
import { emailStyles, escapeHtml, renderLadlesEmail } from '../utils/emailTemplate.js';

const DEFAULT_CHANNELS = ['sms'];
const EMAIL_CHANNEL = 'email';
const WHATSAPP_CHANNEL = 'whatsapp';
const SAST_TIME_ZONE = 'Africa/Johannesburg';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEDNESDAY = 3;
const THURSDAY = 4;

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

const dayOfWeekForIsoDate = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const thursdayCollectionDateForWednesdayRun = (now = new Date()) => {
  const today = dateStringInZone(now);
  if (dayOfWeekForIsoDate(today) !== WEDNESDAY) return null;
  const collectionDate = addDaysToIsoDate(today, 1);
  return dayOfWeekForIsoDate(collectionDate) === THURSDAY ? collectionDate : null;
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
  collectionDate: requestedCollectionDate = null,
} = {}) => {
  const today = dateStringInZone(now);
  const collectionDate = requestedCollectionDate ?? addDaysToIsoDate(today, 1);
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

const queueThursdayCollectionRemindersForWednesdayRun = async ({
  channels = DEFAULT_CHANNELS,
  now = new Date(),
} = {}) => {
  const collectionDate = thursdayCollectionDateForWednesdayRun(now);
  if (!collectionDate) {
    return {
      collectionDate: null,
      channels: normaliseChannels(channels),
      collectionsFound: 0,
      created: 0,
      skipped: 0,
      reminders: [],
      skippedReason: 'ECD Thursday collection reminders run only on Wednesday Africa/Johannesburg time.',
    };
  }
  return queueTomorrowCollectionReminders({ channels, now, collectionDate });
};

const usableEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
};

const formatCollectionDate = (isoDate) => {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  if (!year || !month || !day) return String(isoDate || '');
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

const buildReminderEmail = (reminder) => {
  const date = reminder.collection_date;
  const formattedDate = formatCollectionDate(date);
  const greetingName = reminder.ecd_name ? `${reminder.ecd_name} team` : 'there';

  const text = [
    `Hi ${greetingName},`,
    '',
    'We hope you’re doing well.',
    '',
    `This is a friendly reminder that your Ladles of Love collection is scheduled for ${formattedDate}.`,
    '',
    'Please make sure someone from your centre is available to collect your items at the scheduled time.',
    '',
    'If your collection arrangements have changed or you are unable to collect, please contact the Ladles of Love team as soon as possible.',
    '',
    'Thank you for helping us make sure every collection runs smoothly.',
    '',
    'Warm regards,',
    'The Ladles of Love Team',
  ].join('\n');

  const safeGreetingName = escapeHtml(greetingName);
  const safeFormattedDate = escapeHtml(formattedDate);
  const html = renderLadlesEmail({
    title: 'Reminder: Your Ladles of Love collection is tomorrow',
    preheader: `Friendly reminder that your Ladles of Love collection is scheduled for ${formattedDate}.`,
    bodyHtml: `
      <p style="${emailStyles.paragraph}">Hi ${safeGreetingName},</p>
      <p style="${emailStyles.paragraph}">We hope you&rsquo;re doing well.</p>
      <p style="${emailStyles.paragraph}">This is a friendly reminder that your Ladles of Love collection is scheduled for <strong>${safeFormattedDate}</strong>.</p>
      <p style="${emailStyles.paragraph}">Please make sure someone from your centre is available to collect your items at the scheduled time.</p>
      <p style="${emailStyles.note}">If your collection arrangements have changed or you are unable to collect, please contact the Ladles of Love team as soon as possible.</p>
      <p style="${emailStyles.paragraph}">Thank you for helping us make sure every collection runs smoothly.</p>
    `,
  });

  return {
    subject: 'Reminder: Your Ladles of Love collection is tomorrow',
    text,
    html,
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
  const queued = await queueThursdayCollectionRemindersForWednesdayRun({
    channels: [EMAIL_CHANNEL],
    now,
  });

  if (!queued.collectionDate) {
    return {
      collectionDate: null,
      queued,
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };
  }

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
      html: email.html,
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
  const queued = await queueThursdayCollectionRemindersForWednesdayRun({
    channels: [WHATSAPP_CHANNEL],
    now,
  });

  if (!queued.collectionDate) {
    return {
      collectionDate: null,
      queued,
      reminders: [],
    };
  }

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
  queueThursdayCollectionRemindersForWednesdayRun,
  sendTomorrowCollectionReminderEmails,
  listTomorrowWhatsAppReminders,
  markWhatsAppReminderSent,
};
