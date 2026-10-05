// server/src/routes/operationalGoals.routes.js
import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import operationalGoalsController from '../controllers/operationalGoals.controller.js';

const router = express.Router();

const MANAGER_ONLY = [ROLES.MANAGER];

router.get('/', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.list);
router.post('/ai/draft', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.draftWithAI);
router.post('/ai/explain', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.explainWithAI);
router.post('/ai/why', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.whyWithAI);
router.get('/:id/progress', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.progress);
router.get('/:id', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.getOne);
router.post('/', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.create);
router.put('/:id', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.update);
router.patch('/:id/restore', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.restore);
router.delete('/:id', auth, requireRole(...MANAGER_ONLY), operationalGoalsController.archive);

export default router;

