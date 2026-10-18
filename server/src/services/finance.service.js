import crypto from 'crypto';
import financeRepository from '../repositories/finance.repository.js';
import communications from './communications.service.js';
import { appBaseUrl, missingAddressMessage } from '../config/appUrl.js';
import { emailStyles, escapeHtml, renderLadlesEmail } from '../utils/emailTemplate.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;
const ALLOWED_TYPES = new Set(financeRepository.FINANCE_MOVEMENT_TYPES);
const TOKEN_BYTES = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseDate = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!DATE_ONLY.test(text) || Number.isNaN(Date.parse(text))) {
    fail(400, `${label} must be a calendar date (YYYY-MM-DD).`);
  }
  return text;
};

const parseLimit = (value) => {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    fail(400, `Limit must be a whole number between 1 and ${MAX_LIMIT}.`);
  }
  return limit;
};

const parseMovementTypes = (value) => {
  if (value === undefined || value === null || value === '') {
    return [...financeRepository.FINANCE_MOVEMENT_TYPES];
  }

  const list = (Array.isArray(value) ? value : String(value).split(','))
    .map((type) => String(type).trim())
    .filter(Boolean);

  for (const type of list) {
    if (!ALLOWED_TYPES.has(type)) {
      fail(400, `"${type}" is not available in the finance summary.`);
    }
  }

  return [...new Set(list)];
};

const getFinanceSummary = async (query = {}) => {
  const from = parseDate(query.from, 'Start date');
  const to = parseDate(query.to, 'End date');

  if (from && to && from > to) {
    fail(400, 'The start date is after the end date.');
  }

  const movementTypes = parseMovementTypes(query.movementType ?? query.movementTypes);
  const rows = await financeRepository.listFinanceMovements({
    from,
    to,
    movementTypes,
    limit: parseLimit(query.limit),
  });

  const includesDonations = movementTypes.includes('donated');
  const [donationValues, donationTotal] = includesDonations
    ? await Promise.all([
      financeRepository.listDonationValues({ from, to, limit: MAX_LIMIT }),
      financeRepository.getDonationValueTotal({ from, to }),
    ])
    : [[], '0'];

  return {
    movements: rows,
    donationValues,
    totals: {
      donations: donationTotal,
    },
  };
};

export const hashFinanceReportToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const newFinanceReportToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

const regenerateReportLink = async ({ createdBy } = {}) => {
  const token = newFinanceReportToken();
  const link = await financeRepository.createReportAccessLink({
    tokenHash: hashFinanceReportToken(token),
    createdBy,
  });

  return {
    token,
    publicPath: `/api/finance/public/${token}/report`,
    link,
  };
};

const revokeReportLink = async ({ revokedBy } = {}) =>
  financeRepository.revokeReportAccessLinks({ revokedBy });

const getPublicFinanceSummary = async (token, query = {}) => {
  const text = String(token || '').trim();
  if (!TOKEN_RE.test(text)) {
    fail(404, 'Finance report link is invalid or has been revoked.');
  }

  const link = await financeRepository.getActiveReportAccessLinkByHash(hashFinanceReportToken(text));
  if (!link) {
    fail(404, 'Finance report link is invalid or has been revoked.');
  }

  return getFinanceSummary(query);
};

const toEmailSettings = (row) => ({
  recipientEmail: row?.recipient_email ?? null,
  updatedBy: row?.updated_by ?? null,
  updatedAt: row?.updated_at ?? null,
});

const getEmailSettings = async () =>
  toEmailSettings(await financeRepository.getEmailSettings());

const saveEmailSettings = async ({ recipientEmail, updatedBy } = {}) => {
  const email = String(recipientEmail || '').trim();
  if (!EMAIL_RE.test(email)) {
    fail(400, 'Finance recipient email must be a valid email address.');
  }

  return toEmailSettings(await financeRepository.saveEmailSettings({
    recipientEmail: email,
    updatedBy,
  }));
};

const buildPublicFinanceReportUrl = (base, token) => `${base}/finance/report/${token}`;

const sendFinanceReportLink = async ({ sentBy } = {}) => {
  const settings = await getEmailSettings();
  if (!settings.recipientEmail) {
    fail(400, 'Save a Finance recipient email before sending the report link.');
  }

  // Checked before making a new link: a new link turns the old one off, so
  // it must not happen for an email that cannot be sent.
  const base = appBaseUrl('financeReport');
  if (!base) fail(503, missingAddressMessage('financeReport'));

  const link = await regenerateReportLink({ createdBy: sentBy });
  const url = buildPublicFinanceReportUrl(base, link.token);
  const subject = 'Warehouse Finance Report Link';
  const text = [
    'Hello,',
    '',
    'Use this secure link to open the read-only Warehouse Movement Report:',
    url,
    '',
    'If a new link is generated later, this link may stop working.',
  ].join('\n');
  const safeUrl = escapeHtml(url);
  const html = renderLadlesEmail({
    title: subject,
    preheader: 'Use this secure link to open the read-only Warehouse Movement Report.',
    bodyHtml: `
      <p style="${emailStyles.paragraph}">Hello,</p>
      <p style="${emailStyles.paragraph}">Use this secure link to open the read-only Warehouse Movement Report:</p>
      <p style="${emailStyles.paragraph}"><a href="${safeUrl}" style="${emailStyles.cta}">Open Warehouse Movement Report</a></p>
      <p style="${emailStyles.paragraph}"><a href="${safeUrl}" style="color:#d85b2a;text-decoration:none;">${safeUrl}</a></p>
      <p style="${emailStyles.note}">If a new link is generated later, this link may stop working.</p>
    `,
  });

  const result = await communications.send({
    type: 'finance_report_link',
    to: settings.recipientEmail,
    subject,
    text,
    html,
    related: { type: 'finance_report_link', id: link.link?.id ?? null },
    sentBy,
    sendAs: sentBy,
  });

  const sent = result?.sent === true;
  const log = await financeRepository.logFinanceReportEmail({
    recipientEmail: settings.recipientEmail,
    status: sent ? 'SENT' : 'FAILED',
    financeLinkId: link.link?.id ?? null,
    providerMessageId: result?.messageId ?? null,
    errorMessage: sent ? null : (result?.error || result?.reason || 'Failed to send finance report link.'),
    sentByUserId: sentBy ?? null,
  });

  if (!sent) {
    fail(502, log.error_message || 'Failed to send finance report link.');
  }

  return {
    sent: true,
    recipientEmail: settings.recipientEmail,
    publicUrl: url,
    messageId: result?.messageId ?? null,
    logId: log.id,
  };
};

export default {
  getFinanceSummary,
  regenerateReportLink,
  revokeReportLink,
  getPublicFinanceSummary,
  getEmailSettings,
  saveEmailSettings,
  sendFinanceReportLink,
};
