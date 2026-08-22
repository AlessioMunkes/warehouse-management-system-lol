// ─────────────────────────────────────────────────────────────
// server/src/services/reportingAi.service.js
//
// Question in, report out.
//
//   question → model → { metric, dates, filters } → validateSpec
//            → reporting.service.runReport → chart payload
//
// THE MODEL CHOOSES WHICH QUESTION, NEVER HOW IT IS ANSWERED.
// It returns a spec and nothing else. Whatever it produces goes
// through the same validator and the same six queries the dropdown
// builder uses. A hallucinated metric, a widened date range, or a
// prompt injection buried in a centre name all fail at
// validateSpec() before pg is touched.
//
// That is also why there is no narrative generation here yet. The
// chart and the restated spec are both derived from real rows; a
// prose summary is the one place a fabricated number could enter,
// so it waits until the specs are demonstrably resolving correctly.
// ─────────────────────────────────────────────────────────────
import provider          from '../features/reporting/ai/provider.js';
import { buildTools, buildSystemPrompt } from '../features/reporting/ai/toolSchema.js';
import { validateSpec }  from '../features/reporting/specValidator.js';
import reportingService  from './reporting.service.js';
import logRepo           from '../repositories/reportingLog.repository.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// The model returns a flat argument list; the validator wants a
// nested spec. Only declared keys are copied across, so an extra
// argument the model invents is dropped rather than passed along.
const argsToSpec = (args) => {
  const filters = {};
  if (args.cohort)           filters.cohort = args.cohort;
  if (args.beneficiary_kind) filters.beneficiary_kind = args.beneficiary_kind;

  return {
    metric: args.metric,
    dimension: args.dimension,
    filters,
    dateRange: { from: args.date_from, to: args.date_to },
    limit: args.limit,
  };
};

// A metric declares which filters it accepts and validateSpec
// rejects the rest. Rather than burn a retry on that, drop filters
// the chosen metric does not support and tell the caller — asking
// for "decanting wastage for week1" is a reasonable thing to say
// even though wastage is not cohort-scoped.
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

// ── ask ───────────────────────────────────────────────────────
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
    userId,
    question,
    outcome,
    latencyMs: Date.now() - started,
    provider: provider.providerName(),
    ...extra,
  });

  // One retry. If the model picks a breakdown the metric does not
  // allow, the validator's message names the valid ones, so handing
  // that back is usually enough to fix it. Two attempts is the cap:
  // beyond that it is not a near miss, and the manager is waiting.
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const userMessage = attempt === 0
      ? question
      : `${question}\n\nYour previous attempt was rejected: ${lastError}\nTry again, choosing a valid combination.`;

    const call = await provider.callWithTools({ systemPrompt: system, userMessage, tools });

    // ── Clarification ──
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
      // Fewer than two options is not a usable choice. Treat it as a
      // failed attempt rather than rendering a dead end.
      lastError = 'ask_clarification needs at least two options. Run a report with a sensible default instead.';
      continue;
    }

    if (call.name !== 'run_report') {
      lastError = `Unknown function: ${call.name}`;
      continue;
    }

    // ── Run it ──
    try {
      const raw = argsToSpec(call.args);
      const { spec: cleaned, dropped } = stripUnsupportedFilters(raw, catalog);
      const report = await reportingService.runReport(cleaned);

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
        },
      };
    } catch (err) {
      // A 4xx here is the validator rejecting the spec — worth one
      // retry. A 5xx is our own bug and retrying will not help.
      if (!err.status || err.status >= 500) {
        await log('error', { errorMessage: err.message });
        throw err;
      }
      lastError = err.message;
    }
  }

  await log('unresolved', { errorMessage: lastError });

  const names = catalog.metrics.map((m) => m.label).join(', ');
  throw fail(
    422,
    `I could not turn that into one of the available reports. I can show: ${names}. ` +
    `Try rephrasing, or use the report builder below.`
  );
};

export default { ask };
