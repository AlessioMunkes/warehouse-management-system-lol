// ─────────────────────────────────────────────────────────────
// server/src/services/ftsDropPoint.service.js
//
// Feed the Soil drop-off sites (migration 069). People return their
// compost at pop-up stands and other sites, not only at the warehouse.
// Each site has a QR code hung there; it opens a public form where the
// person enters the weight and, if they want one, an email address for
// a thank-you. What they log counts in compost processed unless staff
// reject it.
//
// THE PUBLIC FORM has no account behind it, so it trusts nothing but
// the site's token: an unguessable uuid, rate limited at the route. The
// weight is bounded (more than 200 kg is not a bucket of compost), and
// the thank-you is sent only to an address the person typed for it,
// without waiting on it: a slow mail server never holds up the person
// standing at the stand.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/ftsDropPoint.repository.js';
import communications, { outcomeOf } from './communications.service.js';
import { emailStyles, escapeHtml, renderLadlesEmail } from '../utils/emailTemplate.js';
import { validateEmail } from '../utils/donationValidation.js';
import { isPositiveInt, isUuid } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const MAX_KG = 200;
const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const optional = (v, max, label) => {
  const s = clean(v);
  if (!s) return null;
  if (s.length > max) fail(400, `${label} is too long. Keep it under ${max} characters.`);
  return s;
};

// ── Sites (staff) ──────────────────────────────────────────────
const listDropPoints = (query = {}) =>
  repo.listDropPoints({ includeInactive: query.includeInactive === true || query.includeInactive === 'true' });

const createDropPoint = async (body = {}, userId = null) => {
  const name = clean(body.name);
  if (!name) fail(400, 'Name the drop-off site.');
  if (name.length > 120) fail(400, 'That name is too long. Keep it under 120 characters.');
  try {
    return await repo.createDropPoint({
      name,
      suburb: optional(body.suburb, 120, 'Suburb'),
      address: optional(body.address, 500, 'Address'),
      createdBy: userId,
    });
  } catch (err) {
    if (err?.code === '23505') fail(409, `A drop-off site called "${name}" already exists.`);
    throw err;
  }
};

const updateDropPoint = async (rawId, body = {}) => {
  if (!isPositiveInt(rawId)) fail(400, 'A valid site ID is required.');
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const patch = {};
  if (has('name')) {
    patch.name = clean(body.name);
    if (!patch.name) fail(400, 'Name the drop-off site.');
    if (patch.name.length > 120) fail(400, 'That name is too long. Keep it under 120 characters.');
  }
  if (has('suburb')) patch.suburb = optional(body.suburb, 120, 'Suburb');
  if (has('address')) patch.address = optional(body.address, 500, 'Address');
  if (has('isActive')) {
    if (typeof body.isActive !== 'boolean') fail(400, 'isActive must be true or false.');
    patch.isActive = body.isActive;
  }
  if (!Object.keys(patch).length) fail(400, 'Nothing to update.');
  try {
    const updated = await repo.updateDropPoint(Number(rawId), patch);
    if (!updated) fail(404, 'Drop-off site not found.');
    return updated;
  } catch (err) {
    if (err?.code === '23505') fail(409, `A drop-off site called "${patch.name}" already exists.`);
    throw err;
  }
};

// ── Drop-offs (staff) ──────────────────────────────────────────
const listDropoffs = () => repo.listDropoffs({ limit: 100 });

// Reject one that is not real (a test, a typo), or count it again.
const setDropoffStatus = async (rawId, body = {}, userId = null) => {
  if (!isPositiveInt(rawId)) fail(400, 'A valid drop-off ID is required.');
  if (!['logged', 'rejected'].includes(body.status)) fail(400, 'Status must be logged or rejected.');
  const updated = await repo.setDropoffStatus(Number(rawId), body.status, userId);
  if (!updated) fail(404, 'Drop-off not found.');
  return updated;
};

// ── The public form ─────────────────────────────────────────────
const siteFor = async (token) => {
  if (!isUuid(token)) fail(404, 'This drop-off code is not recognised. Ask at the stand for help.');
  const site = await repo.findActiveByToken(token);
  if (!site) fail(404, 'This drop-off code is not recognised, or the site is closed. Ask at the stand for help.');
  return site;
};

// What the form shows: the site's name, and nothing else of the system.
const getPublicSite = async (token) => {
  const site = await siteFor(token);
  return { name: site.name, suburb: site.suburb ?? null };
};

const composeThanks = ({ name, kg, site }) => {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  // A point, not en-ZA's decimal comma: "4.5 kg", as the scale shows it.
  const amount = `${Math.round(Number(kg) * 100) / 100} kg`;
  const text = [
    greeting,
    '',
    `Thank you for bringing ${amount} of compost to ${site} for Feed the Soil.`,
    'It goes back into the soil that grows food for the children Ladles of Love feeds.',
    '',
    'Warm regards,',
    'The Ladles of Love Team',
  ].join('\n');
  const html = renderLadlesEmail({
    title: 'Thank you for feeding the soil',
    preheader: `Thank you for your ${amount} of compost`,
    bodyHtml: `
      <p style="${emailStyles.paragraph}">${escapeHtml(greeting)}</p>
      <p style="${emailStyles.paragraph}">Thank you for bringing <strong>${escapeHtml(amount)}</strong> of compost to ${escapeHtml(site)} for Feed the Soil.</p>
      <p style="${emailStyles.paragraph}">It goes back into the soil that grows food for the children Ladles of Love feeds.</p>
    `,
  });
  return { subject: 'Thank you for feeding the soil', text, html };
};

const sendThanks = async (dropoff, { name, kg, site, email }) => {
  let status;
  try {
    const result = await communications.send({
      type: 'compost_thank_you',
      to: email,
      ...composeThanks({ name, kg, site }),
      related: { type: 'fts_dropoff', id: dropoff.id },
    });
    status = outcomeOf(result).status;
  } catch (err) {
    console.error('[ftsDropoff:thanks]', err.message);
    status = 'failed';
  }
  await repo.recordThanks(dropoff.id, status).catch((err) => console.error('[ftsDropoff:thanks]', err.message));
};

const submitDropoff = async (token, body = {}) => {
  const site = await siteFor(token);

  const kg = Number(body.kg);
  if (!Number.isFinite(kg) || kg <= 0) fail(400, 'Enter the weight of your compost in kilograms.');
  if (kg > MAX_KG) fail(400, `That is more than ${MAX_KG} kg. Check the weight, or ask at the stand.`);
  if (Math.round(kg * 100) !== kg * 100) fail(400, 'Enter the weight to two decimal places at most.');

  const name = optional(body.name, 120, 'Your name');
  const email = validateEmail(body.email);
  if (email.error) fail(400, email.error);

  const dropoff = await repo.createDropoff({
    dropPointId: site.id, kgCompost: kg, donorName: name, donorEmail: email.value || null,
  });

  // Not awaited: the person at the stand is thanked on screen now.
  if (email.value) {
    sendThanks(dropoff, { name, kg, site: site.name, email: email.value })
      .catch((err) => console.error('[ftsDropoff:thanks]', err.message));
  }

  return { site: site.name, kg, thanksEmailed: Boolean(email.value) };
};

export default {
  listDropPoints, createDropPoint, updateDropPoint, listDropoffs, setDropoffStatus,
  getPublicSite, submitDropoff,
};
