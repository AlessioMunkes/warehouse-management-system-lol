// ─────────────────────────────────────────────────────────────
// server/src/repositories/assistantLog.repository.js
//
// Records every question put to the help assistant, what it
// resolved to, and whether it worked.
//
// This is the point of the whole feature being measurable. The
// `outcome` column answers the question the URS actually cares
// about — R3, staff resistance, and R13, accessibility exclusion —
// which is not "is the AI clever" but "can a volunteer find out how
// to do their job without asking a person". A week of rows where
// outcome is 'not_covered' names exactly which topics to write next,
// and the `screen` column says where people get stuck.
//
// So this table is the evaluation evidence for the write-up, and
// after handover it is the only way to notice the assistant has
// started failing. It is worth reading, not just worth having.
//
// Logging never blocks the answer. A failed insert is swallowed:
// losing a log row is a nuisance; losing the volunteer's answer
// because the log table has not been migrated yet is not.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const record = async ({
  userId, role, screen, question, outcome, topicId, screenId,
  errorMessage, latencyMs, provider,
}) => {
  try {
    await pool.query(
      `INSERT INTO assistant_queries
         (user_id, user_role, screen, question, outcome, topic_id, target_screen,
          error_message, latency_ms, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId ?? null,
        role ?? null,
        screen ?? null,
        // Truncated: a question is a sentence, and an unbounded text
        // column fed by a text box is an easy way to grow a
        // free-tier database.
        String(question).slice(0, 500),
        outcome,
        topicId ?? null,
        screenId ?? null,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
        latencyMs ?? null,
        provider ?? null,
      ]
    );
  } catch (err) {
    console.error('[assistantLog] could not record query:', err.message);
  }
};

export default { record };
