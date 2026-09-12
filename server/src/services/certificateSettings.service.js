// ─────────────────────────────────────────────────────────────
// server/src/services/certificateSettings.service.js
//
// Service layer for certificate settings.
// Handles validation, singleton enforcement, business rules,
// and sanitisation before persisting to the database.
//
// The settings are organisation-wide and must persist across:
// - Logout/login cycles
// - Browser refreshes
// - Backend restarts
//
// Only ONE settings record should ever exist (singleton pattern).
// ─────────────────────────────────────────────────────────────
import certificateSettingsModel from '../repositories/certificateSettings.repository.js';

// ── fail ───────────────────────────────────────────────────────
// Creates an error with a status code for HTTP responses.
// Mirrors the pattern used in donation.service.js and other services.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ── Validation helpers ─────────────────────────────────────────

// Validate email format
const isValidEmail = (email) => {
  if (!email) return true; // Empty is allowed (optional field)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Validate URL format (for any URL fields if added later)
const isValidUrl = (url) => {
  if (!url) return true;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// ── Validation ─────────────────────────────────────────────────
// Validate required fields for certificate settings.
// Returns an array of error messages, or empty array if valid.
const validateSettings = (data, isUpdate = false) => {
  const errors = [];

  // Organisation Name is always required
  if (!data.organisation_name || !String(data.organisation_name).trim()) {
    errors.push('Organisation Name is required.');
  }

  // PBO Number is required for Section 18A certificates
  if (!data.pbo_number || !String(data.pbo_number).trim()) {
    errors.push('PBO Number is required for Section 18A certification.');
  }

  // Section 18A Reference is required
  if (!data.section18a_reference || !String(data.section18a_reference).trim()) {
    errors.push('Section 18A Reference is required.');
  }

  // Contact Email validation (required, must be valid email)
  if (!data.contact_email || !String(data.contact_email).trim()) {
    errors.push('Contact Email is required.');
  } else if (!isValidEmail(data.contact_email)) {
    errors.push('Contact Email must be a valid email address.');
  }

  // Authorised Signatory (signature name) is required
  if (!data.signature_name || !String(data.signature_name).trim()) {
    errors.push('Authorised Signatory (Signature Name) is required.');
  }

  // Optional email validations
  if (data.reply_to_email && !isValidEmail(data.reply_to_email)) {
    errors.push('Reply-To Email must be a valid email address.');
  }

  return errors;
};

// ── Sanitisation ───────────────────────────────────────────────
// Sanitise and normalise the settings data.
// Trims whitespace, ensures consistent field names.
const sanitizeSettings = (data) => {
  const sanitized = {};

  // Map frontend camelCase to database snake_case
  const fieldMap = {
    organisationName: 'organisation_name',
    pboNumber: 'pbo_number',
    section18AReference: 'section18a_reference',
    physicalAddress: 'physical_address',
    postalAddress: 'postal_address',
    contactEmail: 'contact_email',
    contactPhone: 'contact_phone',
    senderDisplayName: 'sender_display_name',
    replyToEmail: 'reply_to_email',
    subjectTemplate: 'subject_template',
    footerText: 'footer_text',
    signatureName: 'signature_name',
    signatureTitle: 'signature_title',
    defaultAcknowledgementMessage: 'default_acknowledgement_message',
  };

  for (const [frontendKey, dbKey] of Object.entries(fieldMap)) {
    if (data[frontendKey] !== undefined) {
      sanitized[dbKey] = String(data[frontendKey] ?? '').trim();
    }
  }

  return sanitized;
};

const toFrontendFormat = (settings) => {
  if (!settings) return null;
  const reverseMap = {
    organisation_name: 'organisationName',
    pbo_number: 'pboNumber',
    section18a_reference: 'section18AReference',
    physical_address: 'physicalAddress',
    postal_address: 'postalAddress',
    contact_email: 'contactEmail',
    contact_phone: 'contactPhone',
    sender_display_name: 'senderDisplayName',
    reply_to_email: 'replyToEmail',
    subject_template: 'subjectTemplate',
    footer_text: 'footerText',
    signature_name: 'signatureName',
    signature_title: 'signatureTitle',
    default_acknowledgement_message: 'defaultAcknowledgementMessage',
  };
  const result = {};
  // Preserve the row id so the frontend can detect that settings exist
  if (settings.id !== undefined) {
    result.id = settings.id;
  }
  for (const [dbKey, frontendKey] of Object.entries(reverseMap)) {
    if (settings[dbKey] !== undefined) {
      result[frontendKey] = settings[dbKey];
    }
  }
  return result;
};

// ── getSettings ────────────────────────────────────────────────
// GET /api/certificate-settings
// Returns the current certificate settings.
// Required fields are organisation name, PBO number, Section 18A reference,
// email, and authorised signatory.
const getSettings = async () => {
  const settings = await certificateSettingsModel.getSettings();

  if (!settings) {
    fail(404, 'Certificate settings have not been configured yet.');
  }

  return toFrontendFormat(settings);
};

// ── createSettings ─────────────────────────────────────────────
// POST /api/certificate-settings
// Creates the singleton certificate settings record.
// If settings already exist, returns an error (singleton enforcement).
const createSettings = async (data) => {
  // Check if settings already exist (singleton enforcement)
  const exists = await certificateSettingsModel.settingsExist();
  if (exists) {
    fail(409, 'Certificate settings already exist. Use PUT to update existing settings.');
  }

  // Sanitise input
  const sanitized = sanitizeSettings(data);

  // Validate required fields (against sanitised snake_case keys)
  const errors = validateSettings(sanitized);
  if (errors.length > 0) {
    fail(400, errors.join(' '));
  }

  // Create in database
  const result = await certificateSettingsModel.createSettings(sanitized);

  return toFrontendFormat(result.settings);
};

// ── updateSettings ─────────────────────────────────────────────
// PUT /api/certificate-settings
// Updates the existing singleton certificate settings record.
// If no settings exist, returns an error (must create first).
const updateSettings = async (data) => {
  // Validate required fields (against sanitised snake_case keys)
  const sanitized = sanitizeSettings(data);
  const errors = validateSettings(sanitized);
  if (errors.length > 0) {
    fail(400, errors.join(' '));
  }

  // Update in database
  const result = await certificateSettingsModel.updateSettings(sanitized);

  if (!result) {
    fail(500, 'Failed to update certificate settings.');
  }

  return toFrontendFormat(result);
};

// ── deleteSettings ─────────────────────────────────────────────
// DELETE /api/certificate-settings
// Deletes the singleton certificate settings record.
// Only allowed in test environments or by admin override.
const deleteSettings = async () => {
  const result = await certificateSettingsModel.deleteSettings();

  if (!result) {
    fail(404, 'Certificate settings not found.');
  }

  return { success: true, message: 'Certificate settings deleted.' };
};

// ── initializeSettings ─────────────────────────────────────────
// Called at server startup to ensure the singleton row exists.
// Does not fail if settings already exist.
const initializeSettings = async () => {
  const result = await certificateSettingsModel.initializeSettings();
  return result;
};

export default {
  getSettings,
  createSettings,
  updateSettings,
  deleteSettings,
  initializeSettings,
  // Export validation helpers for use in tests
  validateSettings,
  sanitizeSettings,
  toFrontendFormat,
};
