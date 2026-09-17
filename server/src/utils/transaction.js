// ─────────────────────────────────────────────────────────────
// server/src/utils/transaction.js
//
// Shared transaction wrapper for service-layer orchestration.
//
// The convention in this codebase is that services own their
// transactions and pass the transaction client down to every
// repository call (and to logAudit) so that a business operation
// and the audit row describing it commit or roll back together.
// Without this, an audit row could survive a rolled-back change
// and describe something that never happened.
//
// Every repository already accepts an optional `client` parameter
// defaulting to the shared pool, so a service only needs to open
// one transaction and thread that client through.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// Runs `work(client)` inside a single transaction. COMMITs on
// success, ROLLBACKs on any throw, and always releases the client.
export const withTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default { withTransaction };
