export const EMAIL_ENABLED = () => {
  const flag = process.env.EMAIL_ENABLED;
  // Default ON: the Gmail plumbing (.env credentials, connection table,
  // OAuth callback) is all in place, so emails should genuinely send.
  // Set EMAIL_ENABLED=false or 0 explicitly to stub sends (tests/dev).
  if (flag === undefined || flag === null || String(flag).trim() === '') return true;
  const normalised = String(flag).trim().toLowerCase();
  return normalised !== 'false' && normalised !== '0' && normalised !== 'no' && normalised !== 'off';
};

export const getEmailConfig = () => ({
  from: process.env.EMAIL_FROM || 'noreply@ladlesoflove.org',
});
