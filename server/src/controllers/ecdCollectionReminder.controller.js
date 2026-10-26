import reminderService from '../services/ecdCollectionReminder.service.js';
import { sendError } from '../utils/httpError.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  sendError(res, err, fallback);
};

const listTomorrowWhatsApp = async (req, res) => {
  try {
    const data = await reminderService.listTomorrowWhatsAppReminders();
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listTomorrowWhatsAppReminders', 'Failed to retrieve WhatsApp reminders.');
  }
};

const markWhatsAppSent = async (req, res) => {
  try {
    const data = await reminderService.markWhatsAppReminderSent(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'markWhatsAppReminderSent', 'Failed to mark WhatsApp reminder sent.');
  }
};

export default {
  listTomorrowWhatsApp,
  markWhatsAppSent,
};
