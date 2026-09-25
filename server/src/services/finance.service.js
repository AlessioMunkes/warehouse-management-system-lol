import crypto from 'crypto';
import financeRepository from '../repositories/finance.repository.js';
import emailProvider from '../providers/email.provider.js';

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

const publicOrigin = () => {
  const origin = String(process.env.CLIENT_ORIGIN || '').trim();
  return origin.replace(/\/+$/, '');
};

const buildPublicFinanceReportUrl = (token) => {
  const path = `/finance/report/${token}`;
  const origin = publicOrigin();
  return origin ? `${origin}${path}` : path;
};

const sendFinanceReportLink = async ({ sentBy } = {}) => {
  const settings = await getEmailSettings();
  if (!settings.recipientEmail) {
    fail(400, 'Save a Finance recipient email before sending the report link.');
  }

  const link = await regenerateReportLink({ createdBy: sentBy });
  const url = buildPublicFinanceReportUrl(link.token);
  const subject = 'Warehouse Finance Report Link';
  const text = [
    'Hello,',
    '',
    'Use this secure link to open the read-only Warehouse Movement Report:',
    url,
    '',
    'If a new link is generated later, this link may stop working.',
  ].join('\n');

  const result = await emailProvider.sendEmail({
    to: settings.recipientEmail,
    subject,
    text,
  }, sentBy);

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
