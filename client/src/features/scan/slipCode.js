// ─────────────────────────────────────────────────────────────
// client/src/features/scan/slipCode.js
//
// What a scanned or typed pallet code means, and where each kind of
// signed-in person goes with it.
//
// A pallet's QR holds <origin>/slip/<token> (palletLabelPdf.js). The
// 6 characters printed under it are the last 6 of the same token. A
// camera, a keyboard or a pasted link can give us either, so both are
// accepted here, and anything else is "not a pallet code".
//
// The origin is deliberately not checked. A label printed against the
// staging site and scanned on production, or the other way round, still
// carries a real token: we only ever take the token out of it and ask
// OUR OWN server about it, so another site's address is never followed.
// ─────────────────────────────────────────────────────────────
import { PACKING, STAFF } from '../../routes/paths';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const BARE_TOKEN = new RegExp(`^${UUID}$`, 'i');
const SLIP_PATH = new RegExp(`^/slip/(${UUID})/?$`, 'i');
const SHORT_CODE = /^[0-9a-f]{6}$/i;

// { kind: 'token', token } | { kind: 'code', code } | null
export const parseSlipCode = (raw) => {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > 2048) return null;

  if (BARE_TOKEN.test(text)) return { kind: 'token', token: text.toLowerCase() };

  // Typed by hand: allow a stray space or hyphen in the 6 characters
  // ("b545 30"), which is how someone reads them off a sheet.
  if (text.length <= 8) {
    const squeezed = text.replace(/[\s-]/g, '');
    if (SHORT_CODE.test(squeezed)) return { kind: 'code', code: squeezed.toLowerCase() };
    return null;
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const match = SLIP_PATH.exec(url.pathname);
  return match ? { kind: 'token', token: match[1].toLowerCase() } : null;
};

// Where a signed-in staff member goes for a pallet, by role.
//   warehouse_worker  the worker packing screen for that slip, where the
//                     claim, the held-by and the finished messages live.
//   manager           Picking slips, opened on that slip: the packing
//                     screen is the floor's alone, and a manager would be
//                     sent home from it.
//   admin             nowhere: an admin has no screen for a single pallet.
export const staffDestination = (role, slipId) => {
  if (role === 'warehouse_worker') return PACKING.detail(slipId);
  if (role === 'manager') return `${STAFF.pickingSlips}?open=${encodeURIComponent(slipId)}`;
  return null;
};
