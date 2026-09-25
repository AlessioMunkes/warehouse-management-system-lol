// -------------------------------------------------------------
// server/scripts/send-test-email.js
//
// THROWAWAY. Sends one hardcoded test email through the existing
// Gmail service, to prove the send path works before wiring the
// PO finance email into purchaseOrder.service.js.
//
// Usage (run from repo root or from server/):
//   node server/scripts/send-test-email.js someone@example.com
//
// Delete this file once the PO finance email is confirmed working
// end-to-end.
// -------------------------------------------------------------
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { default: gmailService } = await import('../src/services/gmail.service.js');

const to = process.argv[2];
if (!to) {
  console.error('Usage: node server/scripts/send-test-email.js <recipient-email>');
  process.exit(1);
}

console.log(`Sending test email to ${to} via the org's most recently connected Gmail account...`);

try {
  // No userId -> same "org account" path the system-side (non-admin-
  // triggered) sends will use, e.g. the future PO finance email.
  const result = await gmailService.sendEmail(
    {
      to,
      subject: 'WMS test email (throwaway script)',
      text: 'This is a test email sent from server/scripts/send-test-email.js to confirm the Gmail send path works.',
    },
    null
  );
  console.log('Send result:', result);
  process.exit(0);
} catch (err) {
  console.error('Send failed:', err.message);
  process.exit(1);
}
