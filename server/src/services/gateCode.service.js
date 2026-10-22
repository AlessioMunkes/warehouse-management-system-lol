// ─────────────────────────────────────────────────────────────
// server/src/services/gateCode.service.js
//
// The day's gate code: six digits a volunteer types at sign-in to show
// they are at the warehouse.
//
// Sign-in used to need only a name, so anyone on the internet could
// open a guest session, list the day's pallets, claim one and mark it
// packed. The code is shown to managers on the Volunteers page and
// posted at the gate; it changes at midnight in Cape Town.
//
// Nothing is stored. The code is an HMAC of the date and the
// warehouse, keyed by GATE_CODE_SECRET (or, when that is unset, a key
// derived from JWT_SECRET), so every server works it out the same way
// and it cannot be worked out without the key.
//
// Scanning a pallet's QR code (or typing its short code) does not need
// it: holding the code printed on the pallet already shows the person
// is standing at it.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { currentWarehouse } from '../config/warehouseContext.js';

const key = () => {
  if (process.env.GATE_CODE_SECRET) return process.env.GATE_CODE_SECRET;
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set.');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update('wms-gate-code').digest();
};

// Today in Cape Town, 'YYYY-MM-DD'.
export const gateCodeDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

export const gateCodeFor = (date, warehouse = null) => {
  const digest = crypto.createHmac('sha256', key())
    .update(`gate:${warehouse ?? ''}:${date}`)
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
};

// For the warehouse this request is in.
export const todayGateCode = (now = new Date()) => ({
  code: gateCodeFor(gateCodeDate(now), currentWarehouse()),
  date: gateCodeDate(now),
});

// Spaces and dashes are forgiven: "123 456" is how it reads off a sign.
export const isTodayGateCode = (input, now = new Date()) => {
  const typed = String(input ?? '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(typed)) return false;
  const expected = todayGateCode(now).code;
  return crypto.timingSafeEqual(Buffer.from(typed), Buffer.from(expected));
};

export default { gateCodeDate, gateCodeFor, todayGateCode, isTodayGateCode };
