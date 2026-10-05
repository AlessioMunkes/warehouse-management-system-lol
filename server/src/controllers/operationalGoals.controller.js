// server/src/controllers/operationalGoals.controller.js
//
// Thin HTTP layer for Operational Goals. Business rules live in services.
import operationalGoalsService from '../services/operationalGoals.service.js';
import operationalGoalAIService from '../services/operationalGoalAI.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

const list = async (req, res) => {
  try {
    const data = await operationalGoalsService.listGoals(req.query || {});
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listOperationalGoals', 'Failed to retrieve operational goals.');
  }
};

const getOne = async (req, res) => {
  try {
    const data = await operationalGoalsService.getGoal(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getOperationalGoal', 'Failed to retrieve operational goal.');
  }
};

const create = async (req, res) => {
  try {
    const data = await operationalGoalsService.createGoal({
      ...(req.body || {}),
      created_by: req.user?.id,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'createOperationalGoal', 'Failed to create operational goal.');
  }
};

const update = async (req, res) => {
  try {
    const data = await operationalGoalsService.updateGoal(req.params.id, req.body || {});
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'updateOperationalGoal', 'Failed to update operational goal.');
  }
};

const archive = async (req, res) => {
  try {
    const data = await operationalGoalsService.archiveGoal(req.params.id, req.user?.id ?? null);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'archiveOperationalGoal', 'Failed to archive operational goal.');
  }
};

const restore = async (req, res) => {
  try {
    const data = await operationalGoalsService.restoreGoal(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'restoreOperationalGoal', 'Failed to restore operational goal.');
  }
};

const progress = async (req, res) => {
  try {
    const data = await operationalGoalsService.getGoalProgress(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'getOperationalGoalProgress', 'Failed to retrieve operational goal progress.');
  }
};

const draftWithAI = async (req, res) => {
  try {
    const data = await operationalGoalAIService.draftGoal({
      goalText: req.body?.goalText ?? req.body?.goal_text ?? req.body?.text,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'draftOperationalGoalWithAI', 'Failed to draft operational goal.');
  }
};

const explainWithAI = async (req, res) => {
  try {
    const data = await operationalGoalAIService.explainProgress({
      goalId: req.body?.goalId ?? req.body?.goal_id ?? req.body?.id,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'explainOperationalGoalWithAI', 'Failed to explain operational goal progress.');
  }
};

const whyWithAI = async (req, res) => {
  try {
    const data = await operationalGoalAIService.askWhy({
      goalId: req.body?.goalId ?? req.body?.goal_id ?? req.body?.id,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'whyOperationalGoalWithAI', 'Failed to explain why this operational goal has its current progress.');
  }
};


export default {
  list,
  getOne,
  create,
  update,
  archive,
  restore,
  progress,
  draftWithAI,
  explainWithAI,
  whyWithAI,
};
