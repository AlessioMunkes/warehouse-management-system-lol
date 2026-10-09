// ─────────────────────────────────────────────────────────────
// client/src/components/layout/shortcuts.js
//
// The keyboard shortcuts, once: useKeyboardShortcuts.js acts on this
// list and the Shortcuts window in the account menu prints it, so what
// is shown is always what works.
//
// "G then a letter" goes to a screen. Each role has its own letters,
// for its own screens only (routes/routeTable.js keeps the roles apart,
// and a shortcut to a screen that bounces you is worse than none).
// ─────────────────────────────────────────────────────────────
import { STAFF, ADMIN, VOLUNTEERS } from '../../routes/paths';

// [letter, path, name of the screen as its menu calls it]
const GO_TO = {
  warehouse_worker: [
    ['h', STAFF.home, 'Home'],
    ['r', STAFF.receiving, 'Receiving'],
    ['p', STAFF.packing, 'Packing'],
    ['d', STAFF.decanting, 'Decanting'],
    ['g', STAFF.dispatch, 'Dispatch'],
    ['n', STAFF.donation, 'Donation intake'],
    ['b', STAFF.floorRequests, 'Benevolent requests'],
    ['f', STAFF.floorFeedTheSoil, 'Feed the Soil'],
  ],
  manager: [
    ['h', '/manager', 'Dashboard'],
    ['o', STAFF.purchaseOrders, 'Purchase orders'],
    ['c', STAFF.receipts, 'Receipts'],
    ['i', STAFF.inventory, 'Inventory'],
    ['l', STAFF.stockLedger, 'Stock ledger'],
    ['s', STAFF.pickingSlips, 'Picking slips'],
    ['b', STAFF.beneficiaries, 'Beneficiaries'],
    ['m', STAFF.collectionReminders, 'Collection reminders'],
    ['k', STAFF.operatingCalendar, 'Operating calendar'],
    ['q', STAFF.communityRequests, 'Benevolent requests'],
    ['f', STAFF.feedTheSoil, 'Feed the Soil'],
    ['v', VOLUNTEERS.events, 'Volunteer events'],
    ['r', STAFF.reporting, 'Operations reports'],
    ['p', STAFF.impactReport, 'Impact report'],
    ['d', ADMIN.donationManagement, 'Classification queue'],
    ['a', ADMIN.section18aManagement, 'Section 18A'],
  ],
  admin: [
    ['h', ADMIN.dashboard, 'Dashboard'],
    ['f', ADMIN.financeReport, 'Finance report'],
    ['u', ADMIN.users, 'Users'],
    ['p', ADMIN.products, 'Products'],
    ['s', ADMIN.suppliers, 'Suppliers'],
    ['l', ADMIN.activityLog, 'Activity log'],
    ['x', ADMIN.archive, 'Archive'],
    ['m', ADMIN.messageHistory, 'Message history'],
    ['d', ADMIN.donationManagement, 'Classification queue'],
    ['a', ADMIN.section18aManagement, 'Section 18A'],
    ['t', ADMIN.settings, 'Settings'],
  ],
};

export const goToFor = (role) => (GO_TO[role] ?? []).filter(([, path]) => Boolean(path));

// What the Shortcuts window lists, in groups. `keys` is how the keys are
// drawn: each inner list is pressed together, the lists one after another.
export const shortcutGroups = (role) => [
  {
    title: 'Anywhere',
    items: [
      { keys: [['?']], does: 'Open this list of shortcuts' },
      { keys: [['/']], does: 'Go to the search box on the screen' },
      { keys: [['Ctrl', 'B']], does: 'Open or close the side menu' },
      { keys: [['Esc']], does: 'Close the window, panel or menu that is open' },
    ],
  },
  {
    title: 'Moving around a screen',
    items: [
      { keys: [['Tab']], does: 'Move to the next button, field or row' },
      { keys: [['Shift', 'Tab']], does: 'Move back to the one before' },
      { keys: [['Enter']], does: 'Press the button, or open the row, you are on' },
      { keys: [['Space']], does: 'Tick a box, or press the button you are on' },
      { keys: [['↑'], ['↓']], does: 'Move through the choices in a drop-down' },
    ],
  },
  {
    title: 'Go to a screen: press G, then the letter',
    items: goToFor(role).map(([letter, , name]) => ({ keys: [['G'], [letter.toUpperCase()]], does: name })),
  },
];
