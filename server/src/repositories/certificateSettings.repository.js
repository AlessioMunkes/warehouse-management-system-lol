// ─────────────────────────────────────────────────────────────
// server/src/repositories/certificateSettings.repository.js
//
// Repository for certificate_settings singleton table.
// Enforces singleton behaviour: only ONE active settings record (id = 1).
//
// All methods operate on the single row. createSettings() will not
// create a second row if one already exists. updateSettings() updates
// the existing row. This ensures persistent, consistent configuration
// across logout, browser refresh, and backend restart.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// ── getSettings ───────────────────────────────────────────────
// Returns the single certificate settings row, or null if not
// yet initialized. The service layer handles the "not found" case.
const getSettings = async () => {
  const result = await pool.query(
    `SELECT * FROM certificate_settings WHERE id = 1`
  );
  if (!result.rows[0]) return null;
  return result.rows[0];
};

// ── settingsExist ─────────────────────────────────────────────
// Check whether the singleton row has been created.
const settingsExist = async () => {
  const result = await pool.query(
    `SELECT EXISTS(SELECT 1 FROM certificate_settings WHERE id = 1) AS exists`
  );
  return result.rows[0].exists;
};

// ── createSettings ────────────────────────────────────────────
// Creates the singleton row if it does not already exist.
// Returns { created: true, settings } on success, or
// { created: false, settings } if the row already existed.
// This enforces singleton behaviour: only ONE row ever.
const createSettings = async (data) => {
  // First check if settings already exist
  const exists = await settingsExist();
  if (exists) {
    const existing = await getSettings();
    return { created: false, settings: existing };
  }

  // Sanitise input - only allow known fields
  const allowedFields = [
    'organisation_name',
    'pbo_number',
    'section18a_reference',
    'physical_address',
    'postal_address',
    'contact_email',
    'contact_phone',
    'sender_display_name',
    'reply_to_email',
    'subject_template',
    'footer_text',
    'signature_name',
    'signature_title',
    'default_acknowledgement_message',
  ];

  const sanitized = {};
  for (const field of allowedFields) {
    sanitized[field] = String(data[field] ?? '').trim();
  }

  const result = await pool.query(
    `INSERT INTO certificate_settings (
      organisation_name, pbo_number, section18a_reference,
      physical_address, postal_address, contact_email, contact_phone,
      sender_display_name, reply_to_email, subject_template,
      footer_text, signature_name, signature_title,
      default_acknowledgement_message
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    ON CONFLICT (id) DO UPDATE SET
      organisation_name = EXCLUDED.organisation_name,
      pbo_number = EXCLUDED.pbo_number,
      section18a_reference = EXCLUDED.section18a_reference,
      physical_address = EXCLUDED.physical_address,
      postal_address = EXCLUDED.postal_address,
      contact_email = EXCLUDED.contact_email,
      contact_phone = EXCLUDED.contact_phone,
      sender_display_name = EXCLUDED.sender_display_name,
      reply_to_email = EXCLUDED.reply_to_email,
      subject_template = EXCLUDED.subject_template,
      footer_text = EXCLUDED.footer_text,
      signature_name = EXCLUDED.signature_name,
      signature_title = EXCLUDED.signature_title,
      default_acknowledgement_message = EXCLUDED.default_acknowledgement_message,
      updated_at = NOW()
    RETURNING *`,
    [
      sanitized.organisation_name,
      sanitized.pbo_number,
      sanitized.section18a_reference,
      sanitized.physical_address,
      sanitized.postal_address,
      sanitized.contact_email,
      sanitized.contact_phone,
      sanitized.sender_display_name,
      sanitized.reply_to_email,
      sanitized.subject_template,
      sanitized.footer_text,
      sanitized.signature_name,
      sanitized.signature_title,
      sanitized.default_acknowledgement_message,
    ]
  );

  return { created: true, settings: result.rows[0] };
};

// ── updateSettings ────────────────────────────────────────────
// Upserts the singleton row and returns the saved settings.
// This keeps Save deterministic even if the startup seed/migration row
// has not been created in the current database yet.
const updateSettings = async (data) => {
  // Sanitise input - only allow known fields
  const allowedFields = [
    'organisation_name',
    'pbo_number',
    'section18a_reference',
    'physical_address',
    'postal_address',
    'contact_email',
    'contact_phone',
    'sender_display_name',
    'reply_to_email',
    'subject_template',
    'footer_text',
    'signature_name',
    'signature_title',
    'default_acknowledgement_message',
  ];

  const sanitized = {};
  for (const field of allowedFields) {
    sanitized[field] = String(data[field] ?? '').trim();
  }

  const result = await pool.query(
    `INSERT INTO certificate_settings (
      id,
      organisation_name, pbo_number, section18a_reference,
      physical_address, postal_address, contact_email, contact_phone,
      sender_display_name, reply_to_email, subject_template,
      footer_text, signature_name, signature_title,
      default_acknowledgement_message
    ) VALUES (
      1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    ON CONFLICT (id) DO UPDATE SET
      organisation_name = EXCLUDED.organisation_name,
      pbo_number = EXCLUDED.pbo_number,
      section18a_reference = EXCLUDED.section18a_reference,
      physical_address = EXCLUDED.physical_address,
      postal_address = EXCLUDED.postal_address,
      contact_email = EXCLUDED.contact_email,
      contact_phone = EXCLUDED.contact_phone,
      sender_display_name = EXCLUDED.sender_display_name,
      reply_to_email = EXCLUDED.reply_to_email,
      subject_template = EXCLUDED.subject_template,
      footer_text = EXCLUDED.footer_text,
      signature_name = EXCLUDED.signature_name,
      signature_title = EXCLUDED.signature_title,
      default_acknowledgement_message = EXCLUDED.default_acknowledgement_message,
      updated_at = NOW()
    RETURNING *`,
    [
      sanitized.organisation_name,
      sanitized.pbo_number,
      sanitized.section18a_reference,
      sanitized.physical_address,
      sanitized.postal_address,
      sanitized.contact_email,
      sanitized.contact_phone,
      sanitized.sender_display_name,
      sanitized.reply_to_email,
      sanitized.subject_template,
      sanitized.footer_text,
      sanitized.signature_name,
      sanitized.signature_title,
      sanitized.default_acknowledgement_message,
    ]
  );

  return result.rows[0] || null;
};

// ── deleteSettings ────────────────────────────────────────────
// Removes the singleton row. Primarily for testing/reset purposes.
// In production, settings should not be deleted, only updated.
const deleteSettings = async () => {
  const result = await pool.query(
    `DELETE FROM certificate_settings WHERE id = 1 RETURNING *`
  );
  return result.rows[0] || null;
};

// ── initializeSettings ────────────────────────────────────────
// Ensures the singleton row exists (creates with defaults if missing).
// Safe to call at startup to guarantee the row is present.
const initializeSettings = async () => {
  const exists = await settingsExist();
  if (exists) return { initialized: true, settings: await getSettings() };

  const result = await pool.query(
    `INSERT INTO certificate_settings (id) VALUES (1)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`
  );

  // If the row was just created, return it; otherwise fetch it
  if (result.rows[0]) {
    return { initialized: true, settings: result.rows[0] };
  }

  // Row already existed (ON CONFLICT fired)
  return { initialized: true, settings: await getSettings() };
};

export default {
  getSettings,
  settingsExist,
  createSettings,
  updateSettings,
  deleteSettings,
  initializeSettings,
};
