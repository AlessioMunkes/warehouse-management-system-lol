import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import financeController from '../controllers/finance.controller.js';

const router = express.Router();

router.get('/public/:token/report', financeController.getPublicFinanceReport);

router.get('/report', auth, requireRole(ROLES.ADMIN), financeController.getFinanceReport);
router.post('/report-link/regenerate', auth, requireRole(ROLES.ADMIN), financeController.regenerateFinanceReportLink);
router.post('/report-link/revoke', auth, requireRole(ROLES.ADMIN), financeController.revokeFinanceReportLink);
router.get('/email-settings', auth, requireRole(ROLES.ADMIN), financeController.getFinanceEmailSettings);
router.post('/email-settings', auth, requireRole(ROLES.ADMIN), financeController.saveFinanceEmailSettings);
router.post('/report-link/send', auth, requireRole(ROLES.ADMIN), financeController.sendFinanceReportLink);

export default router;
