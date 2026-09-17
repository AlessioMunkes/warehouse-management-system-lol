// -------------------------------------------------------------
// server/src/controllers/gmail.controller.js
//
// Thin HTTP layer for Gmail OAuth connection.
// -------------------------------------------------------------
import gmailService from '../services/gmail.service.js';
import emailProvider from '../providers/email.provider.js';

const EMAIL_INTEGRATION_PATH = '/admin/email-integration';

const buildEmailIntegrationRedirect = (gmailStatus) => {
  const safeStatus = gmailStatus === 'connected' ? 'connected' : 'error';
  const pathWithQuery = `${EMAIL_INTEGRATION_PATH}?gmail=${safeStatus}`;
  const clientOrigin = String(process.env.CLIENT_ORIGIN || '').trim();

  if (!clientOrigin) return pathWithQuery;

  try {
    const url = new URL(clientOrigin);
    url.pathname = EMAIL_INTEGRATION_PATH;
    url.search = `gmail=${safeStatus}`;
    url.hash = '';
    return url.toString();
  } catch {
    return pathWithQuery;
  }
};

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  return res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

const connect = async (req, res) => {
  try {
    const { redirectUrl } = gmailService.startConnectFlow({
      initiatedByUserId: req.user?.id ?? null,
    });

    return res.redirect(302, redirectUrl);
  } catch (err) {
    return respondError(res, err, 'gmailConnect', 'Failed to start Gmail connection.');
  }
};

const callback = async (req, res) => {
  try {
    await gmailService.handleOAuthCallback({
      code: req.query.code ?? null,
      state: req.query.state ?? null,
      oauthError: req.query.error ?? null,
    });

    return res.redirect(302, buildEmailIntegrationRedirect('connected'));
  } catch (err) {
    console.error("===== CALLBACK FAILED =====");
    console.error(err);
    console.error(err.stack);
    return res.redirect(302, buildEmailIntegrationRedirect('error'));
  }
};

const status = async (req, res) => {
  try {
    const result = await gmailService.getConnectionStatus(req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return respondError(res, err, 'gmailStatus', 'Failed to retrieve Gmail connection status.');
  }
};

const disconnect = async (req, res) => {
  try {
    const result = await gmailService.disconnect(req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return respondError(res, err, 'gmailDisconnect', 'Failed to disconnect Gmail.');
  }
};

const testEmail = async (req, res) => {
  try {
    const { to, subject, text } = req.body;

    if (!to || !subject || !text) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, subject, text.',
      });
    }

    const result = await emailProvider.sendEmail({ to, subject, text }, req.user.id);

    if (!result.sent) {
      return res.status(502).json({
        success: false,
        message: result.error || 'Failed to send test email.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        sent: true,
        from: result.from || null,
        messageId: result.messageId,
      },
    });
  } catch (err) {
    return respondError(res, err, 'gmailTestEmail', 'Failed to send test email.');
  }
};

const saveDisplayName = async (req, res) => {
  try {
    const { displayName } = req.body;

    if (displayName === undefined || displayName === null) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: displayName.',
      });
    }

    const result = await gmailService.saveDisplayName(req.user.id, displayName);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return respondError(res, err, 'gmailSaveDisplayName', 'Failed to save display name.');
  }
};

export default {
  connect,
  callback,
  status,
  disconnect,
  testEmail,
  saveDisplayName,
};
