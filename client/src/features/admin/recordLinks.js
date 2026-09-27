// ─────────────────────────────────────────────────────────────
// client/src/features/admin/recordLinks.js
//
// Where "Open" goes from the Activity and Archive screens. The server
// names a screen and a record id; the paths live here, beside the
// route table, so the two cannot drift. Screens that take ?open=<id>
// (or ?id= for purchase orders) open the record and scroll to it.
// ─────────────────────────────────────────────────────────────
import { ADMIN, STAFF, VOLUNTEERS } from '../../routes/paths';

const withOpen = (path, id, param = 'open') => (id ? `${path}?${param}=${encodeURIComponent(id)}` : path);

export const linkFor = (link) => {
  if (!link?.screen) return null;
  const { screen, id } = link;
  switch (screen) {
    case 'pickingSlips':    return withOpen(STAFF.pickingSlips, id);
    case 'purchaseOrders':  return withOpen(STAFF.purchaseOrders, id, 'id');
    case 'beneficiaries':   return withOpen(STAFF.beneficiaries, id);
    case 'receipts':        return STAFF.receipts;
    case 'stockLedger':     return STAFF.stockLedger;
    case 'decantingRecords': return STAFF.decantingRecords;
    case 'feedTheSoil':     return STAFF.feedTheSoil;
    case 'volunteerEvent':  return id ? VOLUNTEERS.event(id) : null;
    case 'suppliers':       return withOpen(ADMIN.suppliers, id);
    case 'products':        return withOpen(ADMIN.products, id);
    case 'users':           return withOpen(ADMIN.users, id);
    default:                return null;
  }
};

// An archived item → the screen it lives on, opened at it.
const ARCHIVE_SCREEN = { user: 'users', product: 'products', supplier: 'suppliers', beneficiary: 'beneficiaries' };
export const archiveLinkFor = (item) => (ARCHIVE_SCREEN[item.kind] ? linkFor({ screen: ARCHIVE_SCREEN[item.kind], id: item.id }) : null);
