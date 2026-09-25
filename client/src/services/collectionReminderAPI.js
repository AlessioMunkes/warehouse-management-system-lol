import { apiGet, apiPatch, apiPost } from './api';

const statusFrom = (row, prefix, fallback = null) =>
  row?.[`${prefix}Status`] ??
  row?.[`${prefix}_status`] ??
  row?.[`${prefix}ReminderStatus`] ??
  row?.[`${prefix}_reminder_status`] ??
  fallback;

export const toCollectionReminder = (row = {}) => ({
  id: row.id,
  ecdId: row.ecdId ?? row.ecd_id ?? null,
  ecdName: row.ecdName ?? row.ecd_name ?? 'Unknown ECD',
  contactName: row.contactName ?? row.contact_name ?? '',
  collectionDate: row.collectionDate ?? row.collection_date ?? null,
  collectionTime: row.collectionTime ?? row.collection_time ?? row.time ?? null,
  emailStatus: statusFrom(row, 'email', row.channel === 'email' ? row.status : row.email_status ?? null),
  whatsappStatus: statusFrom(row, 'whatsapp', row.channel === 'whatsapp' ? row.status : row.whatsapp_status ?? null),
  mobileNumber: row.mobileNumber ?? row.mobile_number ?? '',
  whatsappLink: row.whatsappLink ?? row.whatsapp_link ?? null,
  whatsappMessage: row.whatsappMessage ?? row.whatsapp_message ?? '',
  canRetryEmail: Boolean(row.canRetryEmail ?? row.can_retry_email ?? row.emailRetryUrl ?? row.email_retry_url),
  emailRetryUrl: row.emailRetryUrl ?? row.email_retry_url ?? null,
});

export const getTomorrowCollectionReminders = async () => {
  const body = await apiGet('/api/collection-reminders/whatsapp/tomorrow');
  const data = body.data ?? {};
  return {
    collectionDate: data.collectionDate ?? data.collection_date ?? null,
    reminders: (data.reminders ?? []).map(toCollectionReminder),
  };
};

export const markWhatsAppReminderSent = async (id) => {
  const body = await apiPatch(`/api/collection-reminders/whatsapp/${id}/sent`, {});
  return toCollectionReminder(body.data ?? {});
};

export const retryEmailReminder = async (reminder) => {
  if (!reminder?.emailRetryUrl) return null;
  const body = await apiPost(reminder.emailRetryUrl, {});
  return body.data ?? null;
};

export default {
  getTomorrowCollectionReminders,
  markWhatsAppReminderSent,
  retryEmailReminder,
};
