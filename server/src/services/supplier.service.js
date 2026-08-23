// ─────────────────────────────────────────────────────────────
// server/src/services/supplier.service.js
//
// Validation and business rules for supplier registration and the
// prospect pad. The repository does SQL; this file decides what is
// allowed and what an error means.
//
// ERRORS CARRY .status
// picking.service.js established fail(status, message); stock.service.js
// did not, which is why stock.controller.js has a TODO saying every
// validation error there surfaces as a 500. This file follows picking,
// so supplier.controller.js's `err.status || 500` actually works.
//
// TWO DIFFERENT STANDARDS OF STRICTNESS, ON PURPOSE
// A supplier is validated hard: it is FK'd from purchase_orders and
// delivery_notes, it feeds every procurement metric, and a bad row is
// permanent. A prospect is validated barely at all — a name, and that
// is the lot. It is a notepad. Rejecting a half-remembered lead is how
// you get staff writing them on paper instead, which is exactly the
// failure the donation form already demonstrated (Warehouse Visit 5.1).
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/supplier.repository.js';
import { isPositiveInt } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// ── Value cleaning ────────────────────────────────────────────
// Trim, then treat empty as absent. A form posting "" for an optional
// field should store NULL, not an empty string: "" and NULL both mean
// "no phone number" but only one of them does so in every query.
const clean = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const capped = (value, max, label) => {
  const v = clean(value);
  if (v !== null && v.length > max) {
    throw fail(400, `${label} must be ${max} characters or fewer.`);
  }
  return v;
};

// Shape only, deliberately loose. The point is to catch a typed
// mistake ("orders@peninsulafresh" with no domain), not to adjudicate
// RFC 5322 — and a supplier whose address this rejects is a supplier
// nobody can register, which is worse than a slightly wrong string.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validEmail = (value, label = 'Email address') => {
  const v = clean(value);
  if (v === null) return null;
  if (v.length > 255) throw fail(400, `${label} must be 255 characters or fewer.`);
  if (!EMAIL_SHAPE.test(v)) throw fail(400, `${label} does not look like an email address.`);
  return v.toLowerCase();
};

const validLeadTime = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 365) {
    throw fail(400, 'Expected lead time must be a whole number of days between 0 and 365.');
  }
  return n;
};

const requireId = (id, label = 'Supplier') => {
  if (!isPositiveInt(id)) throw fail(400, `A valid ${label.toLowerCase()} ID is required.`);
  return Number(id);
};

// ── Supplier payload ──────────────────────────────────────────
const buildSupplierPayload = (body = {}) => {
  const name = clean(body.name);
  if (!name) throw fail(400, 'Supplier name is required.');
  if (name.length > 200) throw fail(400, 'Supplier name must be 200 characters or fewer.');

  return {
    name,
    contactName:          capped(body.contactName, 200, 'Contact name'),
    contactEmail:         validEmail(body.contactEmail),
    contactPhone:         capped(body.contactPhone, 50, 'Contact phone'),
    address:              clean(body.address),
    agreementRef:         capped(body.agreementRef, 100, 'Agreement reference'),
    paymentTerms:         capped(body.paymentTerms, 100, 'Payment terms'),
    expectedLeadTimeDays: validLeadTime(body.expectedLeadTimeDays),
    category:             capped(body.category, 60, 'Category'),
    notes:                clean(body.notes),
  };
};

// ── Suppliers ─────────────────────────────────────────────────
const listSuppliers = async ({ includeInactive, search } = {}) =>
  repo.listSuppliers({
    // Query strings arrive as strings, so `Boolean("false")` is true.
    includeInactive: includeInactive === true || includeInactive === 'true',
    search: clean(search),
  });

const getSupplier = async (rawId) => {
  const id = requireId(rawId);
  const supplier = await repo.getSupplierById(id);
  if (!supplier) throw fail(404, 'Supplier not found.');

  const [stats, purchaseOrders] = await Promise.all([
    repo.getSupplierStats(id),
    repo.getRecentPurchaseOrders(id),
  ]);
  return { ...supplier, stats, purchaseOrders };
};

const registerSupplier = async (body, userId) => {
  const payload = buildSupplierPayload(body);

  // Checked here as well as by the UNIQUE constraint, because the
  // constraint is case-sensitive and this check is not. Postgres
  // would accept "Bokomo Foods" alongside "bokomo foods" and split
  // that supplier's history across two ids.
  const clash = await repo.findSupplierByName(payload.name);
  if (clash) {
    throw fail(409, `A supplier named "${clash.name}" already exists${clash.is_active ? '' : ' (currently inactive)'}.`);
  }

  return repo.insertSupplier(payload, userId);
};

const updateSupplier = async (rawId, body, _userId) => {
  const id = requireId(rawId);

  const existing = await repo.getSupplierById(id);
  if (!existing) throw fail(404, 'Supplier not found.');

  // Only fields actually present in the body are validated and sent.
  // A PATCH that omits contactPhone must not null it out.
  const patch = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('name')) {
    const name = clean(body.name);
    if (!name) throw fail(400, 'Supplier name is required.');
    if (name.length > 200) throw fail(400, 'Supplier name must be 200 characters or fewer.');
    const clash = await repo.findSupplierByName(name, { excludeId: id });
    if (clash) throw fail(409, `A supplier named "${clash.name}" already exists.`);
    patch.name = name;
  }
  if (has('contactName'))          patch.contactName          = capped(body.contactName, 200, 'Contact name');
  if (has('contactEmail'))         patch.contactEmail         = validEmail(body.contactEmail);
  if (has('contactPhone'))         patch.contactPhone         = capped(body.contactPhone, 50, 'Contact phone');
  if (has('address'))              patch.address              = clean(body.address);
  if (has('agreementRef'))         patch.agreementRef         = capped(body.agreementRef, 100, 'Agreement reference');
  if (has('paymentTerms'))         patch.paymentTerms         = capped(body.paymentTerms, 100, 'Payment terms');
  if (has('expectedLeadTimeDays')) patch.expectedLeadTimeDays = validLeadTime(body.expectedLeadTimeDays);
  if (has('category'))             patch.category             = capped(body.category, 60, 'Category');
  if (has('notes'))                patch.notes                = clean(body.notes);

  if (!Object.keys(patch).length) throw fail(400, 'No changes were supplied.');

  return repo.updateSupplier(id, patch);
};

// Deactivation is the delete. It is never blocked on outstanding
// purchase orders — same principle as the dispatch gate: the system
// records a state of affairs, it does not prevent one. The open-PO
// count is returned so the UI can warn before the user commits.
const setSupplierStatus = async (rawId, body, userId) => {
  const id = requireId(rawId);
  if (typeof body?.isActive !== 'boolean') {
    throw fail(400, 'isActive must be true or false.');
  }

  const existing = await repo.getSupplierById(id);
  if (!existing) throw fail(404, 'Supplier not found.');
  if (existing.is_active === body.isActive) return existing;

  return repo.setSupplierActive(id, body.isActive, userId);
};

// ── Prospects ─────────────────────────────────────────────────
const PROSPECT_STATUSES = ['open', 'contacted', 'rejected'];

const listProspects = async ({ status } = {}) => {
  const s = clean(status);
  // 'converted' is legitimate to filter by even though it cannot be
  // set through updateProspect — conversion sets it, not the user.
  if (s && ![...PROSPECT_STATUSES, 'converted'].includes(s)) {
    throw fail(400, `Status must be one of: ${[...PROSPECT_STATUSES, 'converted'].join(', ')}.`);
  }
  return repo.listProspects({ status: s });
};

// The only rule is a name. Everything else is optional and untrimmed
// beyond whitespace, because this is a scratch pad and a lead nobody
// can type in is a lead that ends up on a Post-it.
const addProspect = async (body, userId) => {
  const name = clean(body?.name);
  if (!name) throw fail(400, 'A name is required — everything else can wait.');
  if (name.length > 200) throw fail(400, 'Name must be 200 characters or fewer.');

  return repo.insertProspect({
    name,
    whatTheySupply: clean(body.whatTheySupply),
    leadSource:     capped(body.leadSource, 200, 'Lead source'),
    contactName:    capped(body.contactName, 200, 'Contact name'),
    contactEmail:   validEmail(body.contactEmail),
    contactPhone:   capped(body.contactPhone, 50, 'Contact phone'),
    notes:          clean(body.notes),
  }, userId);
};

const updateProspect = async (rawId, body) => {
  const id = requireId(rawId, 'Prospect');

  const existing = await repo.getProspectById(id);
  if (!existing) throw fail(404, 'Prospect not found.');
  if (existing.status === 'converted') {
    throw fail(409, 'This prospect has already been converted into a supplier. Edit the supplier instead.');
  }

  const patch = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('name')) {
    const name = clean(body.name);
    if (!name) throw fail(400, 'A name is required.');
    patch.name = name;
  }
  if (has('whatTheySupply')) patch.whatTheySupply = clean(body.whatTheySupply);
  if (has('leadSource'))     patch.leadSource     = capped(body.leadSource, 200, 'Lead source');
  if (has('contactName'))    patch.contactName    = capped(body.contactName, 200, 'Contact name');
  if (has('contactEmail'))   patch.contactEmail   = validEmail(body.contactEmail);
  if (has('contactPhone'))   patch.contactPhone   = capped(body.contactPhone, 50, 'Contact phone');
  if (has('notes'))          patch.notes          = clean(body.notes);
  if (has('status')) {
    // 'converted' is deliberately absent: it is set by convertProspect
    // inside a transaction alongside the supplier insert, and letting
    // a PATCH set it would produce a prospect claiming a conversion
    // that never happened. The database CHECK would reject it anyway;
    // this returns a sentence instead of a constraint violation.
    if (!PROSPECT_STATUSES.includes(body.status)) {
      throw fail(400, `Status must be one of: ${PROSPECT_STATUSES.join(', ')}.`);
    }
    patch.status = body.status;
  }

  if (!Object.keys(patch).length) throw fail(400, 'No changes were supplied.');
  return repo.updateProspect(id, patch);
};

const removeProspect = async (rawId) => {
  const id = requireId(rawId, 'Prospect');
  const existing = await repo.getProspectById(id);
  if (!existing) throw fail(404, 'Prospect not found.');
  if (existing.status === 'converted') {
    throw fail(409, 'A converted prospect cannot be deleted — it is the record of where this supplier came from.');
  }
  await repo.deleteProspect(id);
  return { id, deleted: true };
};

// "Who told us about these people" is exactly what nobody can
// remember two years later, so the lead's provenance follows it onto
// the supplier record rather than being left behind on the prospect.
//
// Written as a named helper rather than inline: the inline version
// mixed ?? with || in one expression, which is a SyntaxError that
// node --check happily accepted and module-loads.test.js caught.
const carriedNotes = (prospect) => {
  const parts = [
    prospect.notes,
    prospect.lead_source ? `Lead source: ${prospect.lead_source}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join('\n\n') : null;
};

// Promotion. The prospect's own fields are the defaults; anything in
// the body overrides them, because the registration form is where the
// missing details finally get filled in.
const convertProspect = async (rawId, body = {}, userId) => {
  const id = requireId(rawId, 'Prospect');

  const prospect = await repo.getProspectById(id);
  if (!prospect) throw fail(404, 'Prospect not found.');
  if (prospect.status === 'converted') {
    throw fail(409, 'This prospect has already been converted into a supplier.');
  }

  const merged = {
    name:                 body.name                 ?? prospect.name,
    contactName:          body.contactName          ?? prospect.contact_name,
    contactEmail:         body.contactEmail         ?? prospect.contact_email,
    contactPhone:         body.contactPhone         ?? prospect.contact_phone,
    address:              body.address              ?? null,
    agreementRef:         body.agreementRef         ?? null,
    paymentTerms:         body.paymentTerms         ?? null,
    expectedLeadTimeDays: body.expectedLeadTimeDays ?? null,
    category:             body.category             ?? prospect.what_they_supply,
    // The lead's provenance is worth keeping once it becomes a real
    // supplier — see carriedNotes above.
    notes: body.notes ?? carriedNotes(prospect),
  };

  const payload = buildSupplierPayload(merged);

  const clash = await repo.findSupplierByName(payload.name);
  if (clash) {
    throw fail(409, `A supplier named "${clash.name}" already exists. Link the prospect to it manually, or rename before converting.`);
  }

  const result = await repo.convertProspect(id, payload, userId);
  if (!result.ok) {
    // Lost the race against another manager converting the same lead.
    if (result.code === 'already_converted') {
      throw fail(409, 'This prospect has already been converted into a supplier.');
    }
    throw fail(404, 'Prospect not found.');
  }
  return result;
};

export default {
  listSuppliers,
  getSupplier,
  registerSupplier,
  updateSupplier,
  setSupplierStatus,
  listProspects,
  addProspect,
  updateProspect,
  removeProspect,
  convertProspect,
};
