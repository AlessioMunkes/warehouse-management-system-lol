// -------------------------------------------------------------
// server/src/services/financeEmailFallback.service.js
//
// TODO: delete this file once feature/notification-fix merges.
//
// Stands in for financeService.getEmailSettings() (see
// finance.service.js / finance.repository.js on feature/notification-fix,
// backed by the finance_report_email_settings table) until that branch
// lands on staging. Same call signature and return shape, so the swap
// at the call site is a single import line:
//
//   import financeEmailService from './financeEmailFallback.service.js';
//   -->
//   import financeEmailService from './finance.service.js';
//
// Reads the recipient from FINANCE_EMAIL instead of the DB — there is
// no persisted "updated by / updated at" for an env var, so those come
// back null rather than being faked.
// -------------------------------------------------------------

const getEmailSettings = async () => ({
  recipientEmail: process.env.FINANCE_EMAIL || null,
  updatedBy: null,
  updatedAt: null,
});

export default { getEmailSettings };
