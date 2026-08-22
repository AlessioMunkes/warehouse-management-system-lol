// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingLog.repository.js
//
// Records every question put to the AI, what it resolved to, and
// whether it worked.
//
// This is not analytics-on-the-analytics. It is the evaluation
// evidence for the project write-up — which questions the catalog
// could answer, which it could not, how often clarification was
// needed — and after handover it is the only way to see that the
// assistant has started failing.
//
// Logging never blocks the answer. A failed insert is swallowed:
// losing a log row is a nuisance, losing the manager's report
// because the log table is missing is not acceptable.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const record = async ({ userId, question, outcome, metric, spec, errorMessage, latencyMs, provider }) => {
  try {
    await pool.query(
      `INSERT INTO reporting_queries
         (user_id, question, outcome, metric, spec, error_message, latency_ms, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId ?? null,
        // Truncated: a question is a sentence, and an unbounded text
        // column fed by a text box is an easy way to grow a free-tier
        // database.
        String(question).slice(0, 500),
        outcome,
        metric ?? null,
        spec ? JSON.stringify(spec) : null,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
        latencyMs ?? null,
        provider ?? null,
      ]
    );
  } catch (err) {
    console.error('[reportingLog] could not record query:', err.message);
  }
};

export default { record };
