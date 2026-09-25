import financeService from '../services/finance.service.js';

const getFinanceReport = async (req, res) => {
  try {
    const data = await financeService.getFinanceSummary(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getFinanceReport]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve finance report.',
    });
  }
};

const getPublicFinanceReport = async (req, res) => {
  try {
    const data = await financeService.getPublicFinanceSummary(req.params.token, req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getPublicFinanceReport]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve finance report.',
    });
  }
};

const regenerateFinanceReportLink = async (req, res) => {
  try {
    const data = await financeService.regenerateReportLink({ createdBy: req.user.id });
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[regenerateFinanceReportLink]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to regenerate finance report link.',
    });
  }
};

const revokeFinanceReportLink = async (req, res) => {
  try {
    const data = await financeService.revokeReportLink({ revokedBy: req.user.id });
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[revokeFinanceReportLink]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to revoke finance report link.',
    });
  }
};

const getFinanceEmailSettings = async (_req, res) => {
  try {
    const data = await financeService.getEmailSettings();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getFinanceEmailSettings]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve finance email settings.',
    });
  }
};

const saveFinanceEmailSettings = async (req, res) => {
  try {
    const data = await financeService.saveEmailSettings({
      recipientEmail: req.body?.recipientEmail,
      updatedBy: req.user.id,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[saveFinanceEmailSettings]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to save finance email settings.',
    });
  }
};

const sendFinanceReportLink = async (req, res) => {
  try {
    const data = await financeService.sendFinanceReportLink({ sentBy: req.user.id });
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[sendFinanceReportLink]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to send finance report link.',
    });
  }
};

export default {
  getFinanceReport,
  getPublicFinanceReport,
  regenerateFinanceReportLink,
  revokeFinanceReportLink,
  getFinanceEmailSettings,
  saveFinanceEmailSettings,
  sendFinanceReportLink,
};
