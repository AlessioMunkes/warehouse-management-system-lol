// ─────────────────────────────────────────────────────────────
// client/src/features/assistant/screenPaths.js
//
// The one place that knows both halves of the assistant's screen
// vocabulary: the ids the server's help catalog uses, and the routes
// this app actually has.
//
// WHY THE SERVER DOES NOT JUST SEND URLS. It would work, right up
// until someone renames a route — and then the server would be
// handing out dead links with nothing to catch it, because a string
// that no longer matches anything is not an error. Here, a screen id
// with no entry resolves to null, the link is simply not rendered,
// and the answer still reads correctly without it. The test below
// this file's fold (AssistantScreenPaths.test.jsx) then fails, so it
// gets fixed rather than shipped.
//
// The reverse direction is what makes the panel screen-aware: it
// turns the URL the user is on into the id the catalog understands,
// so opening the assistant on Receiving offers receiving help.
// ─────────────────────────────────────────────────────────────
import { STAFF, ADMIN, PACKING, DONATIONS, VOLUNTEERS } from '../../routes/paths';

// Not in paths.js — the inventory route is declared inline in
// App.jsx and navSections.js. Written once here rather than a third
// time inline.
const INVENTORY = '/noc/inventory';

export const SCREEN_PATHS = {
  // `home` is role-dependent, so it has no single path. Everything
  // that needs one uses homeForRole; matchScreen below recognises
  // all three.
  home:               null,

  receiving:          STAFF.receiving,
  deliveries:         STAFF.deliveries,
  decanting:          STAFF.decanting,
  decantingRecords:   STAFF.decantingRecords,
  packing:            PACKING.board,
  dispatch:           STAFF.dispatch,
  dispatchHistory:    STAFF.dispatchHistory,
  donation:           DONATIONS.new,
  communityRequests:  STAFF.communityRequests,

  inventory:          INVENTORY,
  stockLedger:        STAFF.stockLedger,
  purchaseOrders:     STAFF.purchaseOrders,
  pickingSlips:       STAFF.pickingSlips,
  beneficiaries:      STAFF.beneficiaries,
  receipts:           STAFF.receipts,
  reporting:          STAFF.reporting,
  impactReport:       STAFF.impactReport,
  volunteers:         VOLUNTEERS.events,

  products:           ADMIN.products,
  suppliers:          ADMIN.suppliers,
  users:              ADMIN.users,
  donationManagement: ADMIN.donationManagement,
  section18a:         ADMIN.section18aManagement,
  emailIntegration:   ADMIN.emailIntegration,
};

/** Where a screen id points, or null if this build has no such route. */
export const pathForScreen = (id) => SCREEN_PATHS[id] ?? null;

// Longest first, so /noc/procurement/deliveries is not swallowed by
// /noc/procurement — and /noc, which is a prefix of nearly
// everything, is only ever matched exactly.
const MATCHABLE = Object.entries(SCREEN_PATHS)
  .filter(([, path]) => Boolean(path))
  .sort((a, b) => b[1].length - a[1].length);

const HOMES = ['/noc', '/manager', '/admin'];

/**
 * The URL the user is on → the screen id the catalog understands.
 * Returns 'home' for each role's own dashboard, and null for a route
 * the catalog has no topics about, which the panel treats as "ask me
 * anything" rather than guessing.
 */
export const matchScreen = (pathname) => {
  if (!pathname) return null;
  if (HOMES.includes(pathname)) return 'home';

  for (const [id, path] of MATCHABLE) {
    // Prefix, so a detail route (/noc/packing/42) still counts as
    // its parent screen — someone deep in a slip is still on
    // Packing, and that is what they will be asking about.
    if (pathname === path || pathname.startsWith(`${path}/`)) return id;
  }
  return null;
};

export default { SCREEN_PATHS, pathForScreen, matchScreen };
