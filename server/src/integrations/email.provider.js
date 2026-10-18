import { EMAIL_ENABLED } from '../config/email.js';
import gmailService from '../services/gmail.service.js';

const sendEmail = async ({ to, subject, text, html, attachments = [] }, userId = null) => {
  if (!EMAIL_ENABLED()) {
    return {
      sent: true,
      stubbed: true,
      messageId: `stub-${Date.now()}`,
      reason: 'Email disabled via EMAIL_ENABLED flag.',
    };
  }

  // userId === null sends as the organisation account (most recently
  // connected) — that is how the system-side donation email flows call it.
  // The From address is never hardcoded here; it comes from the connected
  // Gmail account's email + configured display name (see gmail.service.js).
  try {
    const result = await gmailService.sendEmail(
        { to, subject, text, html, attachments },
        userId
    );

    console.log("EMAIL RESULT:", result);

    return result;

} catch (err) {
    console.error("EMAIL ERROR");
    console.error(err);
    console.error(err.stack);

    return {
        sent: false,
        error: err.message || 'Gmail send failed.',
        reason: err.message || 'Gmail send failed.',
    };
}
  
};

export default { sendEmail };
