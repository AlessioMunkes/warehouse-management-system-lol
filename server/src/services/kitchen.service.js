// ─────────────────────────────────────────────────────────────
// server/src/services/kitchen.service.js
//
// Soup kitchens and Dignity Kitchens (migration 068). A kitchen's
// adults per collection is what adults served counts: one meal for each
// adult, every time one of its pallets is collected.
// ─────────────────────────────────────────────────────────────
import kitchenRepo from '../repositories/kitchen.repository.js';
import { isPositiveInt } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const KINDS = ['soup_kitchen', 'dignity_kitchen'];
const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const optional = (v, max, label) => {
  const s = clean(v);
  if (!s) return null;
  if (s.length > max) fail(400, `${label} is too long. Keep it under ${max} characters.`);
  return s;
};

const parseName = (v) => {
  const name = clean(v);
  if (!name) fail(400, 'Name the kitchen.');
  if (name.length > 120) fail(400, 'That name is too long. Keep it under 120 characters.');
  return name;
};

const parseAdults = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100000) fail(400, 'Adults fed per collection must be a whole number, 0 or more.');
  return n;
};

const isNameClash = (err) => err?.code === '23505';
const nameTaken = (name) => fail(409, `A kitchen called "${name}" is already registered.`);

const listKitchens = (query = {}) =>
  kitchenRepo.listKitchens({ includeInactive: query.includeInactive === true || query.includeInactive === 'true' });

const createKitchen = async (body = {}) => {
  if (!KINDS.includes(body.kind)) fail(400, 'Choose a soup kitchen or the Dignity Kitchen.');
  const kitchen = {
    kind: body.kind,
    name: parseName(body.name),
    adultCount: parseAdults(body.adultCount),
    contactName: optional(body.contactName, 120, 'Contact name'),
    contactPhone: optional(body.contactPhone, 40, 'Contact number'),
    address: optional(body.address, 500, 'Address'),
  };
  try {
    return await kitchenRepo.createKitchen(kitchen);
  } catch (err) {
    if (isNameClash(err)) throw nameTaken(kitchen.name);
    throw err;
  }
};

const updateKitchen = async (rawId, body = {}) => {
  if (!isPositiveInt(rawId)) fail(400, 'A valid kitchen ID is required.');
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const patch = {};
  if (has('name')) patch.name = parseName(body.name);
  if (has('adultCount')) patch.adultCount = parseAdults(body.adultCount);
  if (has('contactName')) patch.contactName = optional(body.contactName, 120, 'Contact name');
  if (has('contactPhone')) patch.contactPhone = optional(body.contactPhone, 40, 'Contact number');
  if (has('address')) patch.address = optional(body.address, 500, 'Address');
  if (has('isActive')) {
    if (typeof body.isActive !== 'boolean') fail(400, 'isActive must be true or false.');
    patch.isActive = body.isActive;
  }
  if (!Object.keys(patch).length) fail(400, 'Nothing to update.');
  try {
    const updated = await kitchenRepo.updateKitchen(Number(rawId), patch);
    if (!updated) fail(404, 'Kitchen not found.');
    return updated;
  } catch (err) {
    if (isNameClash(err)) throw nameTaken(patch.name);
    throw err;
  }
};

export default { listKitchens, createKitchen, updateKitchen };
