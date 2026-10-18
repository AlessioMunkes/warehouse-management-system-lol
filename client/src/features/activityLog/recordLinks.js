// ─────────────────────────────────────────────────────────────
// client/src/features/activityLog/recordLinks.js
//
// Where "Open" goes from the Activity and Archive screens. The server
// names a screen and a record id; the paths live here, beside the
// route table, so the two cannot drift. Screens that take ?open=<id>
// open the record and scroll to it.
//
// Both screens are the admin's, so only the admin's own screens are
// linked. A record that lives on a manager screen (a picking slip, a
// purchase order, a beneficiary) is listed with no link: an admin
// cannot open that screen.
// ─────────────────────────────────────────────────────────────
import { ADMIN } from '../../routes/paths';

const withOpen = (path, id, param = 'open') => (id ? `${path}?${param}=${encodeURIComponent(id)}` : path);

export const linkFor = (link) => {
  if (!link?.screen) return null;
  const { screen, id } = link;
  switch (screen) {
    case 'suppliers':       return withOpen(ADMIN.suppliers, id);
    case 'products':        return withOpen(ADMIN.products, id);
    case 'users':           return withOpen(ADMIN.users, id);
    default:                return null;
  }
};

// An archived item → the screen it lives on, opened at it.
const ARCHIVE_SCREEN = { user: 'users', product: 'products', supplier: 'suppliers', beneficiary: 'beneficiaries' };
export const archiveLinkFor = (item) => (ARCHIVE_SCREEN[item.kind] ? linkFor({ screen: ARCHIVE_SCREEN[item.kind], id: item.id }) : null);
