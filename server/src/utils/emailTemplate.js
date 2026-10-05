export const LADLES_LOGO_URL = 'https://wms-lol.onrender.com/images/pdf_logo.png';

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const emailStyles = {
  body: 'margin:0;padding:0;background:#f7f3ee;font-family:Arial,Helvetica,sans-serif;color:#332823;',
  outer: 'background:#f7f3ee;margin:0;padding:24px 12px;',
  container: 'max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #eadfd6;',
  logoCell: 'padding:28px 24px 18px;',
  content: 'padding:0 32px 34px;font-size:16px;line-height:1.6;color:#332823;',
  paragraph: 'margin:0 0 18px;',
  note: 'margin:0 0 18px;padding:14px 16px;background:#fff7ef;border-left:4px solid #d85b2a;border-radius:8px;',
  cta: 'display:inline-block;padding:12px 20px;background:#d85b2a;color:#ffffff;border-radius:8px;font-weight:700;text-decoration:none;',
  table: 'border-collapse:collapse;width:100%;font-size:14px;margin:0 0 18px;',
  th: 'padding:8px 10px;text-align:left;border-bottom:2px solid #332823;color:#332823;',
  td: 'padding:8px 10px;border-bottom:1px solid #eadfd6;',
  footer: 'margin:0;color:#6f6258;font-size:13px;line-height:1.5;',
};

export const renderLadlesEmail = ({
  title = 'Ladles of Love',
  preheader = '',
  bodyHtml,
  footerHtml = 'Warm regards,<br>The Ladles of Love Team',
} = {}) => {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader || title);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
  </head>
  <body style="${emailStyles.body}">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">
      ${safePreheader}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${emailStyles.outer}">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${emailStyles.container}">
            <tr>
              <td align="center" style="${emailStyles.logoCell}">
                <img src="${LADLES_LOGO_URL}" width="150" alt="Ladles of Love" style="display:block;width:150px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;">
              </td>
            </tr>
            <tr>
              <td style="${emailStyles.content}">
                ${bodyHtml}
                <p style="${emailStyles.footer}">${footerHtml}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};
