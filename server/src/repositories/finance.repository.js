import pool from '../config/db.js';

const FINANCE_MOVEMENT_TYPES = ['received', 'donated', 'dispatched'];

const financeWhere = (filters, params, alias) => {
  const where = [`${alias}.movement_type = ANY($${params.length + 1}::text[])`];
  params.push(filters.movementTypes?.length ? filters.movementTypes : FINANCE_MOVEMENT_TYPES);

  if (filters.from) {
    params.push(filters.from);
    where.push(`(${alias}.created_at AT TIME ZONE 'Africa/Johannesburg')::date >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`(${alias}.created_at AT TIME ZONE 'Africa/Johannesburg')::date <= $${params.length}::date`);
  }

  return where;
};

const listFinanceMovements = async ({ from = null, to = null, movementTypes = [], limit = 200 } = {}) => {
  const params = [];
  const where = financeWhere({ from, to, movementTypes }, params, 'sm');
  params.push(limit);

  const result = await pool.query(
    `SELECT
       sm.movement_type,
       CASE sm.movement_type
         WHEN 'received'   THEN sm.reference_id::text
         WHEN 'donated'    THEN sm.reference_id::text
         WHEN 'dispatched' THEN sm.reference_id::text
         ELSE sm.id::text
       END AS reference_id,
       (sm.created_at AT TIME ZONE 'Africa/Johannesburg')::date::text AS movement_date,
       CASE sm.movement_type
         WHEN 'received'   THEN s.name
         WHEN 'donated'    THEN d.donor_name
         WHEN 'dispatched' THEN COALESCE(ec.name, ps.beneficiary_name)
         ELSE NULL
       END AS source_destination,
       p.name AS product,
       sm.quantity::numeric AS quantity,
       sm.unit,
       CASE sm.movement_type
         WHEN 'received' THEN
           CASE WHEN po_line.unit_price IS NULL THEN NULL
                ELSE (sm.quantity * po_line.unit_price)::numeric END
         WHEN 'donated' THEN NULL::numeric
         ELSE NULL::numeric
       END AS monetary_value
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     LEFT JOIN delivery_notes dn
       ON sm.movement_type = 'received'
      AND sm.reference_type = 'delivery_note'
      AND dn.id = sm.reference_id
     LEFT JOIN suppliers s ON s.id = dn.supplier_id
     LEFT JOIN LATERAL (
       SELECT poi.unit_price
       FROM delivery_note_items dni
       JOIN purchase_order_items poi ON poi.id = dni.purchase_order_item_id
       WHERE dni.delivery_note_id = sm.reference_id
         AND dni.product_id = sm.product_id
         AND dni.received_quantity = sm.quantity
       ORDER BY dni.id ASC
       LIMIT 1
     ) po_line ON sm.movement_type = 'received'
     LEFT JOIN donations d
       ON sm.movement_type = 'donated'
      AND sm.reference_type = 'donation'
      AND d.id = sm.reference_id
     LEFT JOIN dispatch_events de
       ON sm.movement_type = 'dispatched'
      AND sm.reference_type = 'dispatch_event'
      AND de.id = sm.reference_id
     LEFT JOIN picking_slips ps ON ps.id = de.picking_slip_id
     LEFT JOIN ecd_centres ec ON ec.id = ps.ecd_id
     WHERE ${where.join(' AND ')}
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT $${params.length}`,
    params,
  );

  return result.rows;
};

const donationValueWhere = (filters, params, alias = 'd') => {
  const where = ['di.estimated_value_zar IS NOT NULL'];

  if (filters.from) {
    params.push(filters.from);
    where.push(`(${alias}.received_at AT TIME ZONE 'Africa/Johannesburg')::date >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`(${alias}.received_at AT TIME ZONE 'Africa/Johannesburg')::date <= $${params.length}::date`);
  }

  return where;
};

const listDonationValues = async ({ from = null, to = null, limit = 500 } = {}) => {
  const params = [];
  const where = donationValueWhere({ from, to }, params, 'd');
  params.push(limit);

  const result = await pool.query(
    `SELECT
       'donated' AS movement_type,
       d.id::text AS reference_id,
       di.id::text AS donation_item_id,
       (d.received_at AT TIME ZONE 'Africa/Johannesburg')::date::text AS movement_date,
       d.donor_name AS source_destination,
       COALESCE(p.name, di.description) AS product,
       di.quantity::numeric AS quantity,
       di.unit,
       di.estimated_value_zar::numeric AS monetary_value
     FROM donation_items di
     JOIN donations d ON d.id = di.donation_id
     LEFT JOIN products p ON p.id = di.product_id
     WHERE ${where.join(' AND ')}
     ORDER BY d.received_at DESC, d.id DESC, di.id ASC
     LIMIT $${params.length}`,
    params,
  );

  return result.rows;
};

const getDonationValueTotal = async ({ from = null, to = null } = {}) => {
  const params = [];
  const where = donationValueWhere({ from, to }, params, 'd');

  const result = await pool.query(
    `SELECT COALESCE(SUM(di.estimated_value_zar), 0)::numeric AS total
     FROM donation_items di
     JOIN donations d ON d.id = di.donation_id
     WHERE ${where.join(' AND ')}`,
    params,
  );

  return result.rows[0]?.total ?? '0';
};

const createReportAccessLink = async ({ tokenHash, createdBy }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE finance_report_access_links
          SET revoked_at = NOW(),
              revoked_by = $1
        WHERE revoked_at IS NULL`,
      [createdBy ?? null],
    );

    const { rows } = await client.query(
      `INSERT INTO finance_report_access_links (token_hash, created_by)
       VALUES ($1, $2)
       RETURNING id, created_by, created_at, revoked_at`,
      [tokenHash, createdBy ?? null],
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const revokeReportAccessLinks = async ({ revokedBy }) => {
  const { rows } = await pool.query(
    `UPDATE finance_report_access_links
        SET revoked_at = NOW(),
            revoked_by = $1
      WHERE revoked_at IS NULL
      RETURNING id, revoked_at`,
    [revokedBy ?? null],
  );
  return { revokedCount: rows.length };
};

const getActiveReportAccessLinkByHash = async (tokenHash) => {
  const { rows } = await pool.query(
    `SELECT id, created_at
       FROM finance_report_access_links
      WHERE token_hash = $1
        AND revoked_at IS NULL
      LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
};

const getEmailSettings = async () => {
  const { rows } = await pool.query(
    `SELECT recipient_email, updated_by, updated_at
       FROM finance_report_email_settings
      WHERE id = 1`,
  );
  return rows[0] ?? { recipient_email: null, updated_by: null, updated_at: null };
};

const saveEmailSettings = async ({ recipientEmail, updatedBy }) => {
  const { rows } = await pool.query(
    `INSERT INTO finance_report_email_settings (id, recipient_email, updated_by, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET recipient_email = EXCLUDED.recipient_email,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
     RETURNING recipient_email, updated_by, updated_at`,
    [recipientEmail, updatedBy ?? null],
  );
  return rows[0];
};

const logFinanceReportEmail = async ({
  recipientEmail,
  status,
  financeLinkId = null,
  providerMessageId = null,
  errorMessage = null,
  sentByUserId = null,
}) => {
  const { rows } = await pool.query(
    `INSERT INTO finance_report_email_logs
       (recipient_email, status, finance_link_id, provider_message_id,
        error_message, sent_by_user_id, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6,
             CASE WHEN $2 = 'SENT' THEN NOW() ELSE NULL END)
     RETURNING id, recipient_email, status, finance_link_id, provider_message_id,
               error_message, sent_by_user_id, created_at, sent_at`,
    [recipientEmail, status, financeLinkId, providerMessageId, errorMessage, sentByUserId],
  );
  return rows[0];
};

export default {
  FINANCE_MOVEMENT_TYPES,
  listFinanceMovements,
  listDonationValues,
  getDonationValueTotal,
  createReportAccessLink,
  revokeReportAccessLinks,
  getActiveReportAccessLinkByHash,
  getEmailSettings,
  saveEmailSettings,
  logFinanceReportEmail,
};
