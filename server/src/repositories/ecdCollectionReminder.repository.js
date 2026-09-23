import pool from '../config/db.js';

const REMINDER_COLUMNS = `
  id,
  ecd_id,
  collection_date,
  channel,
  status,
  sent_at,
  provider_message_id,
  error_message,
  created_at
`;

const findCollectionsByDate = async (collectionDate) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT
       ps.ecd_id,
       ps.dispatch_date::text AS collection_date,
       ps.cohort::text        AS cohort,
       e.name                 AS ecd_name,
       e.contact_name,
       e.contact_email,
       e.mobile_number
     FROM picking_slips ps
     JOIN ecd_centres e ON e.id = ps.ecd_id
     WHERE ps.dispatch_date = $1::date
       AND ps.ecd_id IS NOT NULL
       AND ps.status <> 'cancelled'
     ORDER BY e.name ASC`,
    [collectionDate]
  );
  return rows;
};

const listPendingReminderDeliveries = async ({ collectionDate, channel }) => {
  const { rows } = await pool.query(
    `SELECT
       r.id,
       r.ecd_id,
       r.collection_date::text AS collection_date,
       r.channel,
       r.status,
       r.sent_at,
       r.provider_message_id,
       r.error_message,
       r.created_at,
       e.name AS ecd_name,
       e.contact_name,
       e.contact_email,
       e.mobile_number
     FROM ecd_collection_reminders r
     JOIN ecd_centres e ON e.id = r.ecd_id
     WHERE r.collection_date = $1::date
       AND r.channel = $2
       AND r.status = 'pending'
     ORDER BY e.name ASC, r.id ASC`,
    [collectionDate, channel]
  );
  return rows;
};

const listReminderDeliveries = async ({ collectionDate, channel }) => {
  const { rows } = await pool.query(
    `SELECT
       r.id,
       r.ecd_id,
       r.collection_date::text AS collection_date,
       r.channel,
       r.status,
       r.sent_at,
       r.provider_message_id,
       r.error_message,
       r.created_at,
       e.name AS ecd_name,
       e.contact_name,
       e.contact_email,
       e.mobile_number
     FROM ecd_collection_reminders r
     JOIN ecd_centres e ON e.id = r.ecd_id
     WHERE r.collection_date = $1::date
       AND r.channel = $2
     ORDER BY e.name ASC, r.id ASC`,
    [collectionDate, channel]
  );
  return rows;
};

const getReminderDeliveryById = async (id) => {
  const { rows } = await pool.query(
    `SELECT
       r.id,
       r.ecd_id,
       r.collection_date::text AS collection_date,
       r.channel,
       r.status,
       r.sent_at,
       r.provider_message_id,
       r.error_message,
       r.created_at,
       e.name AS ecd_name,
       e.contact_name,
       e.contact_email,
       e.mobile_number
     FROM ecd_collection_reminders r
     JOIN ecd_centres e ON e.id = r.ecd_id
     WHERE r.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

const createReminderOnce = async ({ ecdId, collectionDate, channel, status = 'pending' }) => {
  const { rows } = await pool.query(
    `INSERT INTO ecd_collection_reminders (ecd_id, collection_date, channel, status)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (ecd_id, collection_date, channel) DO NOTHING
     RETURNING ${REMINDER_COLUMNS}`,
    [ecdId, collectionDate, channel, status]
  );
  return rows[0] ?? null;
};

const claimReminderForSending = async (id) => {
  const { rows } = await pool.query(
    `UPDATE ecd_collection_reminders
        SET status = 'sending',
            error_message = NULL
      WHERE id = $1
        AND status = 'pending'
      RETURNING ${REMINDER_COLUMNS}`,
    [id]
  );
  return rows[0] ?? null;
};

const markReminderSent = async ({ id, providerMessageId = null }) => {
  const { rows } = await pool.query(
    `UPDATE ecd_collection_reminders
        SET status = 'sent',
            sent_at = NOW(),
            provider_message_id = $2,
            error_message = NULL
      WHERE id = $1
        AND status <> 'sent'
      RETURNING ${REMINDER_COLUMNS}`,
    [id, providerMessageId]
  );
  return rows[0] ?? null;
};

const markReminderFailed = async ({ id, errorMessage }) => {
  const { rows } = await pool.query(
    `UPDATE ecd_collection_reminders
        SET status = 'failed',
            error_message = $2
      WHERE id = $1
        AND status <> 'sent'
      RETURNING ${REMINDER_COLUMNS}`,
    [id, errorMessage]
  );
  return rows[0] ?? null;
};

export default {
  findCollectionsByDate,
  listPendingReminderDeliveries,
  listReminderDeliveries,
  getReminderDeliveryById,
  createReminderOnce,
  claimReminderForSending,
  markReminderSent,
  markReminderFailed,
};
