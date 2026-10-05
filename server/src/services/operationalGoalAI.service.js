// server/src/services/operationalGoalAI.service.js
// Draft and explanation AI helpers for Operational Goals. No persistence, no repositories.
import provider from '../features/reporting/ai/provider.js';
import operationalGoalsService from './operationalGoals.service.js';
import {
  getAllMetrics,
  validateMetric,
  GOAL_METRIC_GOAL_TYPES,
  GOAL_METRIC_DIRECTIONS,
} from '../config/goalMetricRegistry.js';
import { isValidDateString } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const clean = (value) => String(value ?? '').trim();
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());

const metricContext = () => getAllMetrics().map((metric) => ({
  id: metric.id,
  label: metric.label,
  description: metric.description,
  domain: metric.domain,
  unit: metric.unit,
  supportedGoalTypes: metric.supportedGoalTypes,
  supportedDirections: metric.supportedDirections,
  comparisonType: metric.comparisonType,
}));

const buildDraftPrompt = () => `You draft one measurable Operational Goal for WMS managers.
Return exactly one draft by calling draft_operational_goal.
Do not save data. Do not claim current performance. Do not invent insights.
Use only these metrics: ${JSON.stringify(metricContext())}
Today in Africa/Johannesburg is ${todayIso()}.
Choose period_start and period_end as YYYY-MM-DD. If the manager does not specify dates, choose the current calendar quarter.
Use TARGET when the manager gives a numeric target. Use DIRECTIONAL when they only ask to improve/reduce/maintain compared with a previous period.
For DIRECTIONAL goals, target_value must be null.
Choose the single best metric, goal type, direction, target and period for the manager's plain-language request.
If unsure, set confidence below 0.7 and explain why.`;

const buildExplainPrompt = () => `You explain Operational Goal progress for WMS managers.
Use only the supplied goal, metric, progress JSON and evidence JSON.
Do not query data, ask for hidden data, invent operational facts, or invent evidence.
Do not replace the calculated progress values.
Return concise, practical text by calling explain_operational_goal_progress.
Recommendations must be actions a manager can take next.
Confidence should reflect whether the supplied progress and evidence are enough to support the explanation.`;

const buildWhyPrompt = () => `You answer a manager asking why an Operational Goal has its current progress status.
Use only the supplied goal, metric, progress JSON and evidence JSON.
Do not query data, ask for hidden data, invent operational facts, or invent evidence.
Do not replace calculated progress values.
Explain the likely reason based strictly on the deterministic evidence.
Return concise text by calling explain_operational_goal_why.
Follow-up questions should help the manager investigate using existing WMS operational processes.`;

const draftShape = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    goal_text: { type: 'string' },
    metric_id: { type: 'string' },
    goal_type: { type: 'string', enum: Object.values(GOAL_METRIC_GOAL_TYPES) },
    direction: { type: 'string', enum: Object.values(GOAL_METRIC_DIRECTIONS) },
    target_value: { type: 'number', nullable: true },
    period_start: { type: 'string' },
    period_end: { type: 'string' },
    reasoning: { type: 'string' },
    confidence: { type: 'number' },
    confidence_reason: { type: 'string' },
  },
  required: ['title', 'goal_text', 'metric_id', 'goal_type', 'direction', 'period_start', 'period_end', 'reasoning', 'confidence', 'confidence_reason'],
};

const draftTools = [{
  name: 'draft_operational_goal',
  description: 'Create one structured Operational Goal draft for manager review.',
  parameters: draftShape,
}];

const explainTools = [{
  name: 'explain_operational_goal_progress',
  description: 'Explain measured Operational Goal progress and suggest practical manager actions.',
  parameters: {
    type: 'object',
    properties: {
      insight: { type: 'string' },
      recommendations: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
      confidence_reason: { type: 'string' },
    },
    required: ['insight', 'recommendations', 'confidence', 'confidence_reason'],
  },
}];

const whyTools = [{
  name: 'explain_operational_goal_why',
  description: 'Explain why an Operational Goal has its current measured status using deterministic evidence only.',
  parameters: {
    type: 'object',
    properties: {
      explanation: { type: 'string' },
      confidence: { type: 'number' },
      confidence_reason: { type: 'string' },
      follow_up_questions: { type: 'array', items: { type: 'string' } },
    },
    required: ['explanation', 'confidence', 'confidence_reason', 'follow_up_questions'],
  },
}];

const normalizeDraft = (args = {}, variant = null) => {
  const metric = validateMetric(args.metric_id);
  const goalType = clean(args.goal_type);
  const direction = clean(args.direction);
  const periodStart = clean(args.period_start).slice(0, 10);
  const periodEnd = clean(args.period_end).slice(0, 10);

  if (!clean(args.title)) throw fail(502, 'The AI draft did not include a title.');
  if (!clean(args.goal_text)) throw fail(502, 'The AI draft did not include a description.');
  if (!metric.supportedGoalTypes.includes(goalType)) throw fail(502, `The AI chose an unsupported goal type for ${metric.id}.`);
  if (!metric.supportedDirections.includes(direction)) throw fail(502, `The AI chose an unsupported direction for ${metric.id}.`);
  if (!isValidDateString(periodStart) || !isValidDateString(periodEnd) || periodStart > periodEnd) {
    throw fail(502, 'The AI draft did not include a valid date period.');
  }

  let targetValue = null;
  if (goalType === GOAL_METRIC_GOAL_TYPES.TARGET) {
    targetValue = Number(args.target_value);
    if (!Number.isFinite(targetValue)) throw fail(502, 'The AI draft did not include a valid target value.');
  }

  const confidence = Number(args.confidence);
  return {
    ...(variant ? { variant } : {}),
    title: clean(args.title).slice(0, 160),
    goal_text: clean(args.goal_text).slice(0, 1000),
    metric_id: metric.id,
    goal_type: goalType,
    direction,
    target_value: targetValue,
    period_start: periodStart,
    period_end: periodEnd,
    reasoning: clean(args.reasoning).slice(0, 1200),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    confidence_reason: clean(args.confidence_reason || 'The AI was not fully confident in this draft.').slice(0, 600),
  };
};

const normalizeExplanation = (args = {}, evidence = []) => {
  const recommendations = Array.isArray(args.recommendations)
    ? args.recommendations.map((item) => clean(item)).filter(Boolean).slice(0, 5)
    : [];
  const confidence = Number(args.confidence);

  return {
    insight: clean(args.insight).slice(0, 1600) || 'No AI insight was returned.',
    recommendations,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    confidence_reason: clean(args.confidence_reason || 'Confidence is based on the live progress values available.').slice(0, 800),
    evidence,
  };
};

const normalizeWhy = (args = {}, evidence = []) => {
  const followUpQuestions = Array.isArray(args.follow_up_questions)
    ? args.follow_up_questions.map((item) => clean(item)).filter(Boolean).slice(0, 5)
    : [];
  const confidence = Number(args.confidence);

  return {
    explanation: clean(args.explanation).slice(0, 1600) || 'No AI explanation was returned.',
    evidence,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    confidence_reason: clean(args.confidence_reason || 'Confidence is based on the live progress values available.').slice(0, 800),
    follow_up_questions: followUpQuestions,
  };
};

const formatEvidenceValue = (value, fallback = 'Not available') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(2)) : fallback;
  return String(value);
};

const buildEvidence = (goal, progress) => {
  const evidence = [
    { label: 'Current Value', value: formatEvidenceValue(progress.currentValue) },
    { label: 'Target', value: formatEvidenceValue(progress.targetValue, 'No target') },
    { label: 'Previous Period', value: formatEvidenceValue(progress.previousValue, 'Not applicable') },
    { label: 'Progress %', value: progress.progressPercent === null || progress.progressPercent === undefined ? 'Not applicable' : `${formatEvidenceValue(progress.progressPercent)}%` },
    { label: 'Goal Period', value: `${String(goal.period_start).slice(0, 10)} � ${String(goal.period_end).slice(0, 10)}` },
  ];

  if (progress.targetValue !== null && progress.targetValue !== undefined) {
    const remaining = Number(progress.targetValue) - Number(progress.currentValue ?? 0);
    evidence.splice(4, 0, { label: 'Remaining', value: Number.isFinite(remaining) ? Number(Math.max(0, remaining).toFixed(2)) : 'Not available' });
  }

  return evidence;
};

const draftGoal = async ({ goalText } = {}) => {
  const text = clean(goalText);
  if (text.length < 5) throw fail(400, 'Enter a goal for the AI assistant to draft.');
  if (text.length > 1200) throw fail(400, 'Goal text is too long. Keep it under 1200 characters.');
  if (!provider.isEnabled()) throw fail(503, 'The AI assistant is not configured.');

  const result = await provider.callWithTools({
    systemPrompt: buildDraftPrompt(),
    userMessage: text,
    tools: draftTools,
  });

  if (result.name !== 'draft_operational_goal') {
    throw fail(502, 'The AI assistant returned an unexpected draft format.');
  }

  return { draft: normalizeDraft(result.args || {}) };
};

const buildProgressContext = async (goalId) => {
  const id = clean(goalId);
  if (!id) throw fail(400, 'goalId is required.');

  const goal = await operationalGoalsService.getGoal(id);
  const progress = await operationalGoalsService.getGoalProgress(id);
  const metric = validateMetric(goal.metric_id);
  const evidence = buildEvidence(goal, progress);

  return { goal, progress, metric, evidence };
};

const progressContextMessage = ({ goal, progress, metric, evidence }) => JSON.stringify({
  goal: {
    id: goal.id,
    title: goal.title,
    goal_text: goal.goal_text,
    metric_id: goal.metric_id,
    goal_type: goal.goal_type,
    direction: goal.direction,
    target_value: goal.target_value,
    period_start: goal.period_start,
    period_end: goal.period_end,
    comparison_type: goal.comparison_type,
  },
  metric: {
    id: metric.id,
    label: metric.label,
    description: metric.description,
    domain: metric.domain,
    unit: metric.unit,
  },
  progress,
  evidence,
});

const explainProgress = async ({ goalId } = {}) => {
  if (!provider.isEnabled()) throw fail(503, 'The AI assistant is not configured.');

  const context = await buildProgressContext(goalId);

  const result = await provider.callWithTools({
    systemPrompt: buildExplainPrompt(),
    userMessage: progressContextMessage(context),
    tools: explainTools,
  });

  if (result.name !== 'explain_operational_goal_progress') {
    throw fail(502, 'The AI assistant returned an unexpected explanation format.');
  }

  return normalizeExplanation(result.args || {}, context.evidence);
};

const askWhy = async ({ goalId } = {}) => {
  if (!provider.isEnabled()) throw fail(503, 'The AI assistant is not configured.');

  const context = await buildProgressContext(goalId);

  const result = await provider.callWithTools({
    systemPrompt: buildWhyPrompt(),
    userMessage: progressContextMessage(context),
    tools: whyTools,
  });

  if (result.name !== 'explain_operational_goal_why') {
    throw fail(502, 'The AI assistant returned an unexpected why explanation format.');
  }

  return normalizeWhy(result.args || {}, context.evidence);
};

export default { draftGoal, explainProgress, askWhy };
export { draftGoal, explainProgress, askWhy };
