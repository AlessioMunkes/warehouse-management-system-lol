// ─────────────────────────────────────────────────────────────
// server/src/services/reportingAi.service.js
//
// Question in, report out.
//   question → model → { metric, dates, filters } → validateSpec
//            → reporting.service.runReport → chart payload
//
// THE MODEL CHOOSES WHICH QUESTION, NEVER HOW IT IS ANSWERED.
// Whatever it produces goes through the same validator and the same
// queries the dropdown builder uses. A hallucinated metric, a
// widened range, or a prompt injection buried in a centre name all
// fail at validateSpec() before pg is touched.
// ─────────────────────────────────────────────────────────────
import provider          from '../features/reporting/ai/provider.js';
import { buildTools, buildSystemPrompt } from '../features/reporting/ai/toolSchema.js';
import reportingService  from './reporting.service.js';
import insightService    from './reportingInsight.service.js';
import { CHART_VIEWS }   from '../features/reporting/ai/toolSchema.js';
import { matchQuestion } from '../features/reporting/ai/keywordFallback.js';
import logRepo           from '../repositories/reportingLog.repository.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// Flat arguments → nested spec. Only declared keys are copied, so an
// argument the model invents is dropped rather than passed along.
const argsToSpec = (args) => {
  const filters = {};
  for (const k of ['cohort', 'beneficiary_kind', 'movement_type', 'donation_category']) {
    if (args[k]) filters[k] = args[k];
  }
  return {
    metric: args.metric,
    dimension: args.dimension,
    filters,
    dateRange: args.date_from && args.date_to
      ? { from: args.date_from, to: args.date_to }
      : undefined,
    limit: args.limit,
  };
};

// Metrics declare which filters they accept and validateSpec rejects
// the rest. Rather than burn a retry, drop unsupported filters and
// tell the caller — "decanting wastage for week1" is a reasonable
// thing to say even though wastage is not cohort-scoped.
const stripUnsupportedFilters = (spec, catalog) => {
  const metric = catalog.metrics.find((m) => m.id === spec.metric);
  if (!metric) return { spec, dropped: [] };

  const dropped = [];
  const filters = {};
  for (const [k, v] of Object.entries(spec.filters)) {
    if (metric.filters.includes(k)) filters[k] = v;
    else dropped.push(k);
  }
  return { spec: { ...spec, filters }, dropped };
};

// A period report with no dates is a near miss, not a failure: the
// model understood the report and omitted the range. Default to the
// last three months rather than spending a retry on it.
const applyDefaultRange = (spec, catalog, todayISO) => {
  const metric = catalog.metrics.find((m) => m.id === spec.metric);
  if (!metric || metric.temporal === 'snapshot' || spec.dateRange) return spec;

  const to = new Date(`${todayISO}T00:00:00Z`);
  const from = new Date(to);
  from.setUTCDate(1);
  from.setUTCMonth(from.getUTCMonth() - 2);
  return {
    ...spec,
    dateRange: { from: from.toISOString().slice(0, 10), to: todayISO },
    defaultedRange: true,
  };
};

// Not an error. A question the catalog cannot answer is a normal
// outcome, so it comes back as a 200 the page shows as a gentle note
// with a way forward, rather than a red failure. `closest` is only
// passed on when it names a real operational report.
const noMatch = (catalog, reason, closestId) => {
  const operational = catalog.metrics.filter((m) => !m.impactOnly);
  const closest = operational.find((m) => m.id === closestId);
  const message = typeof reason === 'string' && reason.trim()
    ? reason.trim().slice(0, 300)
    : "I couldn't match that to one of the operational reports.";
  return {
    type: 'no_match',
    message,
    closest: closest ? { id: closest.id, label: closest.label } : null,
  };
};

// Upstream conditions — every model in the chain out of quota,
// overloaded, unreachable or timing out. Not our bug, and not the
// manager's question being wrong, so the keyword matcher steps in.
const PROVIDER_DOWN = new Set([429, 502, 503, 504]);

// Every model failed: answer with the closest keyword match instead
// of an error. Labelled so the page says "closest match".
const keywordAnswer = async ({ question, todayISO, reason, log }) => {
  const match = matchQuestion(question, todayISO);
  if (!match) {
    await log('error', { errorMessage: `provider down, no keyword match: ${reason}` });
    return {
      type: 'no_match',
      message: "The AI assistant is busy right now and I couldn't match that question by its keywords. " +
        'Try one of the suggested questions, or pick a report from Browse all reports.',
      closest: null,
    };
  }
  try {
    if (match.kind === 'comparison') {
      const result = await insightService.runComparison({ id: match.id, dateRange: match.dateRange });
      await log('ok', { metric: `comparison:${match.id}`, spec: { comparison: match.id }, errorMessage: `keyword fallback: ${reason}` });
      return { ...result, matchedBy: 'keyword', aiUnavailable: true };
    }
    const report = await reportingService.runReport(match.spec);
    await log('ok', { metric: report.spec.metric, spec: report.spec, errorMessage: `keyword fallback: ${reason}` });
    return {
      type: 'report',
      ...report,
      meta: { ...report.meta, matchedBy: 'keyword', aiUnavailable: true, chartHint: match.chartHint },
    };
  } catch (err) {
    await log('error', { errorMessage: `keyword fallback failed: ${err.message}` });
    throw err;
  }
};

export const ask = async ({ question, userId }) => {
  if (!provider.isEnabled()) {
    throw fail(503, 'The AI assistant is not available. Use the report builder below.');
  }
  if (typeof question !== 'string' || question.trim().length < 3) {
    throw fail(400, 'Please type a question.');
  }
  if (question.length > 300) {
    throw fail(400, 'That question is too long. Try asking something shorter.');
  }

  const started  = Date.now();
  const todayISO = reportingService.todayISO();
  const tools    = buildTools();
  const system   = buildSystemPrompt(todayISO);
  const catalog  = reportingService.getCatalog();

  const log = (outcome, extra = {}) => logRepo.record({
    userId, question, outcome,
    latencyMs: Date.now() - started,
    provider: provider.providerName(),
    ...extra,
  });

  // One retry. If the model picks a breakdown the metric disallows,
  // the validator names the valid ones, and handing that back is
  // usually enough. Two attempts is the cap — beyond that it is not
  // a near miss, and the manager is waiting.
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const userMessage = attempt === 0
      ? question
      : `${question}\n\nYour previous attempt was rejected: ${lastError}\nTry again, choosing a valid combination.`;

    let call;
    try {
      call = await provider.callWithTools({ systemPrompt: system, userMessage, tools });
    } catch (err) {
      // Logged either way, so outages show up in reporting_queries
      // instead of vanishing (they used to be thrown before logging).
      if (PROVIDER_DOWN.has(err.status)) {
        return keywordAnswer({ question, todayISO, reason: err.message, log });
      }
      await log('error', { errorMessage: err.message });
      throw err;
    }

    if (call.name === 'ask_clarification') {
      const options = Array.isArray(call.args.options)
        ? call.args.options.filter((o) => typeof o === 'string').slice(0, 4)
        : [];
      if (options.length >= 2) {
        await log('clarify');
        return {
          type: 'clarify',
          question: String(call.args.question ?? 'Which did you mean?').slice(0, 200),
          options,
        };
      }
      lastError = 'ask_clarification needs at least two options. Run a report with a sensible default instead.';
      continue;
    }

    if (call.name === 'no_matching_report') {
      // Logged under the existing 'unresolved' outcome, so the log
      // table needs no new value; the prefix tells the two apart.
      await log('unresolved', { errorMessage: `no_matching_report: ${call.args?.reason ?? ''}` });
      return noMatch(catalog, call.args?.reason, call.args?.closest_metric);
    }

    if (call.name === 'run_comparison') {
      try {
        const a = call.args ?? {};
        const result = await insightService.runComparison({
          id: a.comparison,
          dateRange: a.date_from && a.date_to ? { from: a.date_from, to: a.date_to } : undefined,
        });
        await log('ok', { metric: `comparison:${result.id}`, spec: { comparison: result.id, dateRange: result.dateRange } });
        return { ...result, answeredByAI: true };
      } catch (err) {
        if (!err.status || err.status >= 500) { await log('error', { errorMessage: err.message }); throw err; }
        lastError = err.message;
        continue;
      }
    }

    if (call.name !== 'run_report') { lastError = `Unknown function: ${call.name}`; continue; }

    try {
      const raw = argsToSpec(call.args);
      const { spec: cleaned, dropped } = stripUnsupportedFilters(raw, catalog);
      const withRange = applyDefaultRange(cleaned, catalog, todayISO);
      const report = await reportingService.runReport(withRange);

      await log('ok', { metric: report.spec.metric, spec: report.spec });

      return {
        type: 'report',
        ...report,
        meta: {
          ...report.meta,
          answeredByAI: true,
          // Surfaced in the UI: a dropped filter means the answer is
          // broader than the question, and the manager should know.
          droppedFilters: dropped.length ? dropped : undefined,
          defaultedRange: withRange.defaultedRange || undefined,
          // Display only: how the manager asked to see it.
          chartHint: CHART_VIEWS.includes(call.args.chart_type) ? call.args.chart_type : undefined,
        },
      };
    } catch (err) {
      // A 4xx is the validator rejecting the spec — worth one retry.
      // A 5xx is our own bug and retrying will not help.
      if (!err.status || err.status >= 500) {
        await log('error', { errorMessage: err.message });
        throw err;
      }
      lastError = err.message;
    }
  }

  await log('unresolved', { errorMessage: lastError });
  return noMatch(catalog);
};

export default { ask };
