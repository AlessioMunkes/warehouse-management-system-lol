import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api';

const BASE = '/api/operational-goals';

const buildQuery = (params = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
};

export const toOperationalGoal = (row = {}) => ({
  id: row.id,
  title: row.title ?? '',
  goalText: row.goal_text ?? '',
  metricId: row.metric_id ?? '',
  metricFilters: row.metric_filters ?? null,
  goalType: row.goal_type ?? '',
  direction: row.direction ?? '',
  targetValue: row.target_value === null || row.target_value === undefined ? null : Number(row.target_value),
  periodStart: row.period_start ?? '',
  periodEnd: row.period_end ?? '',
  comparisonType: row.comparison_type ?? '',
  goalState: row.goal_state ?? '',
  createdBy: row.created_by ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
  archivedAt: row.archived_at ?? null,
});

export const getOperationalGoals = async (params = {}) => {
  const body = await apiGet(`${BASE}${buildQuery(params)}`);
  return (body.data ?? []).map(toOperationalGoal);
};

export const getOperationalGoal = async (id) => {
  const body = await apiGet(`${BASE}/${encodeURIComponent(id)}`);
  return toOperationalGoal(body.data ?? {});
};

export const createOperationalGoal = async (payload) => {
  const body = await apiPost(BASE, payload);
  return toOperationalGoal(body.data ?? {});
};

export const updateOperationalGoal = async (id, payload) => {
  const body = await apiPut(`${BASE}/${encodeURIComponent(id)}`, payload);
  return toOperationalGoal(body.data ?? {});
};

export const archiveOperationalGoal = async (id) => {
  const body = await apiDelete(`${BASE}/${encodeURIComponent(id)}`);
  return toOperationalGoal(body.data ?? {});
};

export const restoreOperationalGoal = async (id) => {
  const body = await apiPatch(`${BASE}/${encodeURIComponent(id)}/restore`, {});
  return toOperationalGoal(body.data ?? {});
};

export const getOperationalGoalProgress = async (id) => {
  const body = await apiGet(`${BASE}/${encodeURIComponent(id)}/progress`);
  return body.data ?? {};
};

export const draftOperationalGoalWithAI = async (goalText) => {
  const body = await apiPost(`${BASE}/ai/draft`, { goalText });
  return body.data ?? {};
};

export const explainOperationalGoalWithAI = async (goalId) => {
  const body = await apiPost(`${BASE}/ai/explain`, { goalId });
  return body.data ?? {};
};

export const askWhyOperationalGoalWithAI = async (goalId) => {
  const body = await apiPost(`${BASE}/ai/why`, { goalId });
  return body.data ?? {};
};

export default {
  getOperationalGoals,
  getOperationalGoal,
  createOperationalGoal,
  updateOperationalGoal,
  archiveOperationalGoal,
  restoreOperationalGoal,
  getOperationalGoalProgress,
  draftOperationalGoalWithAI,
  explainOperationalGoalWithAI,
  askWhyOperationalGoalWithAI,
};



