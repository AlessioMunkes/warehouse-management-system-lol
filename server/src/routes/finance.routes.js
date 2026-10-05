import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ONLY } from '../constants/permissions.js';
import financeController from '../controllers/finance.controller.js';

const router = express.Router();

router.get('/public/:token/report', financeController.getPublicFinanceReport);

router.get('/report', auth, requireRole(...ADMIN_ONLY), financeController.getFinanceReport);
router.post('/report-link/regenerate', auth, requireRole(...ADMIN_ONLY), financeController.regenerateFinanceReportLink);
router.post('/report-link/revoke', auth, requireRole(...ADMIN_ONLY), financeController.revokeFinanceReportLink);
router.get('/email-settings', auth, requireRole(...ADMIN_ONLY), financeController.getFinanceEmailSettings);
router.post('/email-settings', auth, requireRole(...ADMIN_ONLY), financeController.saveFinanceEmailSettings);
router.post('/report-link/send', auth, requireRole(...ADMIN_ONLY), financeController.sendFinanceReportLink);

export default router;
