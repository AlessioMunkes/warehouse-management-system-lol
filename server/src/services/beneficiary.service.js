// ─────────────────────────────────────────────────────────────
// server/src/services/beneficiary.service.js
//
// Validation and business rules for beneficiary centres. Same
// fail(status, message) convention as supplier/user/product
// services.
//
// STRICT, LIKE PRODUCTS. A centre is what picking.service.js's
// createSlip/generateSlips key off of directly (is_active,
// approved_at) — a bad row here either silently blocks a beneficiary
// from ever getting a pallet, or lets an unapproved one through.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/beneficiary.repository.js';
import { isPositiveInt } from '../utils/validation.js';

const COHORTS = ['week1', 'week2'];

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

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

const requireId = (id, label = 'Beneficiary') => {
  if (!isPositiveInt(id)) throw fail(400, `A valid ${label.toLowerCase()} ID is required.`);
  return Number(id);
};

// child_count is nullable on the live table (donation.repository.js's
// own read already treats a null child count as "excluded, not
// zero") — optional here for the same reason.
const validChildCount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw fail(400, 'Child count must be a whole number of zero or more, or left blank.');
  }
  return n;
};

const validCohort = (value) => {
  const v = clean(value);
  if (!COHORTS.includes(v)) throw fail(400, `Cohort must be one of: ${COHORTS.join(', ')}.`);
  return v;
};

// ── Beneficiary payload ─────────────────────────────────────────
const buildBeneficiaryPayload = (body = {}) => {
  const name = clean(body.name);
  if (!name) throw fail(400, 'Beneficiary name is required.');
  if (name.length > 150) throw fail(400, 'Beneficiary name must be 150 characters or fewer.');

  return {
    name,
    cohort:      validCohort(body.cohort),
    contactName: capped(body.contactName, 100, 'Contact name'),
    childCount:  validChildCount(body.childCount),
  };
};

// ── Reads ─────────────────────────────────────────────────────
const listBeneficiaries = async ({ includeInactive, search } = {}) =>
  repo.listBeneficiaries({
    includeInactive: includeInactive === true || includeInactive === 'true',
    search: clean(search),
  });

const getBeneficiary = async (rawId) => {
  const id = requireId(rawId);
  const beneficiary = await repo.getBeneficiaryById(id);
  if (!beneficiary) throw fail(404, 'Beneficiary not found.');
  return beneficiary;
};

// ── Create ────────────────────────────────────────────────────
// Created NOT approved — approveBeneficiary is the separate,
// deliberate step that actually unlocks picking-slip creation for
// this centre. A brand-new record should never silently be
// slip-eligible the moment it's typed in.
const createBeneficiary = async (body) => {
  const payload = buildBeneficiaryPayload(body);

  const clash = await repo.findByName(payload.name);
  if (clash) throw fail(409, `A beneficiary with that name already exists: "${clash.name}".`);

  return repo.insertBeneficiary(payload);
};

// ── Update ────────────────────────────────────────────────────
const updateBeneficiary = async (rawId, body) => {
  const id = requireId(rawId);

  const existing = await repo.getBeneficiaryById(id);
  if (!existing) throw fail(404, 'Beneficiary not found.');

  const patch = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('name')) {
    const name = clean(body.name);
    if (!name) throw fail(400, 'Beneficiary name is required.');
    if (name.length > 150) throw fail(400, 'Beneficiary name must be 150 characters or fewer.');
    patch.name = name;
  }
  if (has('cohort'))      patch.cohort      = validCohort(body.cohort);
  if (has('contactName')) patch.contactName = capped(body.contactName, 100, 'Contact name');
  if (has('childCount'))  patch.childCount  = validChildCount(body.childCount);

  if (has('name') && patch.name) {
    const clash = await repo.findByName(patch.name, { excludeId: id });
    if (clash) throw fail(409, `A beneficiary with that name already exists: "${clash.name}".`);
  }

  if (!Object.keys(patch).length) throw fail(400, 'No changes were supplied.');

  return repo.updateBeneficiary(id, patch);
};

// ── Activate / deactivate ────────────────────────────────────
const setBeneficiaryStatus = async (rawId, body) => {
  const id = requireId(rawId);
  if (typeof body?.isActive !== 'boolean') {
    throw fail(400, 'isActive must be true or false.');
  }

  const existing = await repo.getBeneficiaryById(id);
  if (!existing) throw fail(404, 'Beneficiary not found.');
  if (existing.is_active === body.isActive) return existing;

  return repo.setBeneficiaryActive(id, body.isActive);
};

// ── Approve ───────────────────────────────────────────────────
const approveBeneficiary = async (rawId) => {
  const id = requireId(rawId);

  const existing = await repo.getBeneficiaryById(id);
  if (!existing) throw fail(404, 'Beneficiary not found.');
  if (existing.approved_at) return existing;

  return repo.approveBeneficiary(id);
};

export default {
  listBeneficiaries,
  getBeneficiary,
  createBeneficiary,
  updateBeneficiary,
  setBeneficiaryStatus,
  approveBeneficiary,
};
