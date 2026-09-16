// ─────────────────────────────────────────────────────────────
// server/src/features/assistant/helpCatalog.js
//
// Everything the assistant is allowed to say, and every screen it is
// allowed to open.
//
// THE MODEL CHOOSES WHICH ANSWER, NEVER WHAT THE ANSWER SAYS. Gemini
// reads the ids below and picks one; the words that reach the user
// are the `body` written here. It cannot invent a business rule, get
// FEFO backwards, or send someone to a screen they cannot open —
// because it never writes prose and never names a path.
//
// WRITING RULES for anyone editing this file:
//   • SHORT. One or two sentences. The reader is holding something,
//     or a driver is waiting. Aim under 45 words; most are under 30.
//     If it needs more, it needs `steps`, or it is two topics.
//   • Plain language, no jargon (ACC-09). Say what to DO.
//   • `asks` are how real people phrase it, not keywords. They go in
//     the model's prompt and are what makes "the truck's here" find
//     receiving. More is better; this is the matching surface.
//   • `roles` on a topic, and `roles` on a SCREEN, are access
//     control — see the note on SCREENS below.
//   • `rules` cites the BR/NFR so an answer is traceable to the URS.
//     Never shown to the user.
//   • `general: true` marks a topic that applies on many screens, so
//     the on-screen suggestions rank it below what a screen is for.
//
// Adding a topic needs no other change: the tool schema, the system
// prompt and the suggestions are all generated from here.
// ─────────────────────────────────────────────────────────────

const WORKER  = 'warehouse_worker';
const MANAGER = 'manager';
const ADMIN   = 'admin';

const EVERYONE    = [WORKER, MANAGER, ADMIN];
const MANAGERS_UP = [MANAGER, ADMIN];
const ADMIN_ONLY  = [ADMIN];

// ── Screens ──────────────────────────────────────────────────
//
// The vocabulary shared with the client, which maps these ids to its
// own routes (client/src/features/assistant/screenPaths.js). The
// server ships ids, never URLs, so a renamed route degrades to "no
// link" instead of a dead one.
//
// `roles` HERE IS ACCESS CONTROL. The assistant can navigate, so
// this list decides where it will take someone, and it mirrors the
// role guards in App.jsx exactly — AssistantScreenRoles.test.js
// parses App.jsx and fails if the two ever disagree.
//
// It is the FIRST of three gates, not the only one. The model is
// only offered the screens this role may open; the service checks
// again; and ProtectedRoute plus the server's requireRole still
// stand behind both. Nothing here can grant access — it can only
// decline to offer it.
export const SCREENS = [
  { id: 'home',              label: 'Your home screen',   roles: EVERYONE },

  // The warehouse floor. <ProtectedRoute /> with no role list.
  { id: 'receiving',         label: 'Receiving',          roles: EVERYONE },
  { id: 'deliveries',        label: 'Past deliveries',    roles: EVERYONE },
  { id: 'decanting',         label: 'Decanting',          roles: EVERYONE },
  { id: 'decantingRecords',  label: 'Past decanting runs', roles: EVERYONE },
  { id: 'packing',           label: 'Packing',            roles: EVERYONE },
  { id: 'dispatch',          label: 'The dispatch gate',  roles: EVERYONE },
  { id: 'dispatchHistory',   label: 'Collection history', roles: EVERYONE },
  { id: 'donation',          label: 'Donation intake',    roles: EVERYONE },
  { id: 'communityRequests', label: 'Benevolent requests', roles: EVERYONE },

  // Manager and admin. roles={['manager','admin']} in App.jsx.
  { id: 'inventory',         label: 'Inventory',          roles: MANAGERS_UP },
  { id: 'stockLedger',       label: 'Stock ledger',       roles: MANAGERS_UP },
  { id: 'purchaseOrders',    label: 'Purchase orders',    roles: MANAGERS_UP },
  { id: 'pickingSlips',      label: 'Picking slips',      roles: MANAGERS_UP },
  { id: 'beneficiaries',     label: 'Beneficiaries',      roles: MANAGERS_UP },
  { id: 'receipts',          label: 'Receipts',           roles: MANAGERS_UP },
  { id: 'reporting',         label: 'Reporting',          roles: MANAGERS_UP },
  { id: 'impactReport',      label: 'Impact report',      roles: MANAGERS_UP },
  { id: 'volunteers',        label: 'Volunteer events',   roles: MANAGERS_UP },

  // Admin. roles={['admin']} in App.jsx.
  { id: 'products',          label: 'Product management',  roles: ADMIN_ONLY },
  { id: 'suppliers',         label: 'Supplier management', roles: ADMIN_ONLY },
  { id: 'users',             label: 'User management',     roles: ADMIN_ONLY },
  { id: 'donationManagement', label: 'Donation management', roles: ADMIN_ONLY },
  { id: 'section18a',        label: 'Section 18A certificates', roles: ADMIN_ONLY },
  { id: 'emailIntegration',  label: 'Email settings',      roles: ADMIN_ONLY },
];

export const SCREEN_IDS = SCREENS.map((s) => s.id);

/** The screens this role may be sent to. The navigation gate. */
export const screensForRole = (role) => SCREENS.filter((s) => s.roles.includes(role));

// ── Topics ───────────────────────────────────────────────────
export const TOPICS = [
  // ═══ About the assistant itself ═══════════════════════════
  {
    id: 'assistant-what-i-do',
    title: 'What I can help with',
    roles: EVERYONE,
    screens: ['home'],
    general: true,
    asks: [
      'what can you do', 'what are you able to do', 'who are you', 'what are you',
      'how do you work', 'what do you know', 'help me', 'what can I ask you',
      'are you an ai', 'can you help',
    ],
    body:
      'I explain how to do things in this system, and I can open a screen for you — ' +
      'say "take me to inventory".\n\n' +
      'Ask in your own words: "the truck is here", "the driver won’t sign". ' +
      'I only know this warehouse system, and I say so when I do not know.',
    related: ['assistant-take-me-there', 'find-my-way'],
  },
  {
    id: 'assistant-take-me-there',
    title: 'Getting me to open a screen',
    roles: EVERYONE,
    screens: ['home'],
    general: true,
    asks: [
      'can you open a screen', 'take me somewhere', 'can you navigate',
      'open a page for me', 'go to a screen',
    ],
    body:
      'Say "take me to inventory", "open purchase orders", "go to the dispatch gate". ' +
      'I only offer screens your job allows — if it is not yours, I will say so rather ' +
      'than send you to a locked door.',
    rules: ['BR-01'],
    related: ['who-can-do-what'],
  },

  // ═══ Getting around ═══════════════════════════════════════
  {
    id: 'what-is-this',
    title: 'What this system is for',
    roles: EVERYONE,
    screens: ['home'],
    asks: ['what is this app', 'what does this system do', 'what am I looking at', 'what is this for'],
    body:
      'It tracks food coming in, being sorted and packed, and going out to the centres ' +
      'that collect it — so the same information stops living on paper, in a spreadsheet ' +
      'and in somebody’s head at once.',
    rules: ['BR-01'],
    related: ['who-can-do-what', 'find-my-way'],
  },
  {
    id: 'find-my-way',
    title: 'Finding your way around',
    roles: EVERYONE,
    screens: ['home'],
    asks: ['where is everything', 'how do I get to', 'I am lost', 'how do I navigate', 'where do I find'],
    body:
      'On a computer, the list on the left is everything you can open. On a phone, tap the ' +
      'menu button top left, and use the icons along the bottom for the job you are on.\n\n' +
      'Or just ask me to take you there.',
    related: ['assistant-take-me-there', 'who-can-do-what'],
  },
  {
    id: 'who-can-do-what',
    title: 'Who can do what',
    roles: EVERYONE,
    screens: ['home', 'users'],
    asks: [
      'why can I not see', 'why is this greyed out', 'what are the roles', 'permissions',
      'access denied', 'I cannot open that page', 'why is it locked', 'no permission',
    ],
    body:
      'Warehouse staff do the floor work. Managers add stock, orders, beneficiaries and ' +
      'reports. Admins look after products, suppliers and accounts. Guests are volunteers ' +
      'signed in for one event.\n\n' +
      'A screen that will not open is not broken — it belongs to another job.',
    rules: ['BR-01', 'NFR-08'],
    related: ['what-is-this', 'signing-in'],
  },
  {
    id: 'signing-in',
    title: 'Signing in',
    roles: EVERYONE,
    screens: ['home'],
    asks: ['how do I log in', 'I forgot my password', 'it logged me out', 'sign in problem', 'cannot log in'],
    body:
      'Use the username and password your admin set up. Nobody can look yours up — an ' +
      'admin sets a new one if you lose it. Signed out mid-task? Sign back in; saved work ' +
      'is still there.',
    rules: ['NFR-09'],
    related: ['unfinished-work', 'signing-out'],
  },
  {
    id: 'signing-out',
    title: 'Signing out',
    roles: EVERYONE,
    screens: ['home'],
    general: true,
    asks: ['how do I log out', 'sign out', 'someone else needs the tablet', 'end my shift'],
    body:
      'Log out is in the top bar. Do it before handing a shared tablet on — everything ' +
      'recorded after that goes down under your name.',
    related: ['signing-in'],
  },
  {
    id: 'notifications',
    title: 'The bell, and what it is telling you',
    roles: EVERYONE,
    screens: ['home'],
    general: true,
    asks: [
      'what is the bell', 'notifications', 'red number', 'badge', 'what is the number next to the bell',
      'alerts',
    ],
    body:
      'The bell carries things that need someone — a flagged delivery, a centre that did ' +
      'not collect, stock gone low. The number is how many are unread. Tap one to go ' +
      'straight to it.',
    related: ['something-looks-wrong'],
  },
  {
    id: 'accessibility-options',
    title: 'Making the screen easier to use',
    roles: EVERYONE,
    screens: ['home'],
    general: true,
    asks: [
      'the screen moves too much', 'hard to read', 'text too small', 'turn off animation',
      'motion makes me dizzy', 'accessibility', 'make it bigger', 'zoom',
    ],
    body:
      'The button in the top bar stops the sliding and fading. For bigger text use your ' +
      'browser zoom (Ctrl and +) or your phone’s text size — the screens reflow rather ' +
      'than break.',
    rules: ['ACC-04', 'ACC-08', 'NFR-04'],
  },
  {
    id: 'working-offline',
    title: 'When the signal drops',
    roles: EVERYONE,
    screens: ['dispatch', 'receiving', 'decanting', 'packing'],
    general: true,
    asks: [
      'no signal', 'it says offline', 'wifi is down', 'no internet', 'will I lose my work',
      'does it work without signal', 'connection lost',
    ],
    body:
      'Keep working. It saves to the device and sends everything up when the signal ' +
      'returns. Just do not close the app while it still says work is waiting to send.',
    rules: ['NFR-10', 'NFR-17'],
    related: ['unfinished-work'],
  },
  {
    id: 'unfinished-work',
    title: 'Picking up where you stopped',
    roles: EVERYONE,
    screens: ['receiving', 'decanting', 'dispatch', 'packing'],
    general: true,
    asks: [
      'I lost my work', 'my tablet died', 'carry on from before', 'where did my counting go',
      'resume', 'start again',
    ],
    body:
      'It saves as you go and offers the half-finished task back next time you open it. ' +
      'Carry on, or throw it away and start clean.',
    related: ['working-offline'],
  },
  {
    id: 'undo-a-mistake',
    title: 'Undoing something',
    roles: EVERYONE,
    screens: ['inventory', 'receiving', 'decanting'],
    general: true,
    asks: ['I made a mistake', 'how do I undo', 'wrong number', 'I typed the wrong thing', 'take it back'],
    body:
      'A message appears at the bottom with Undo. Tap it.\n\n' +
      'Once it has gone, tell your manager — do not enter an opposite number to cancel it ' +
      'out. That hides the mistake instead of fixing it.',
    related: ['stock-adjustment', 'something-looks-wrong'],
  },
  {
    id: 'something-looks-wrong',
    title: 'Something looks wrong',
    roles: EVERYONE,
    screens: ['home'],
    general: true,
    asks: [
      'this looks wrong', 'the number is off', 'who do I tell', 'report a problem',
      'it is broken', 'the system is wrong', 'I think there is a bug',
    ],
    body:
      'Tell the warehouse manager, and say what screen you were on. Do not work around it ' +
      'by entering something you know is untrue — a wrong figure nobody flagged is much ' +
      'harder to find later than one somebody mentioned.',
    related: ['undo-a-mistake', 'stock-adjustment'],
  },

  // ═══ Receiving ════════════════════════════════════════════
  {
    id: 'receiving-record',
    title: 'Recording a delivery',
    roles: EVERYONE,
    screens: ['receiving'],
    asks: [
      'a truck arrived', 'how do I receive stock', 'goods came in', 'delivery arrived',
      'book in a delivery', 'the driver is here', 'stock came in', 'receive goods',
    ],
    body: 'Find the order it is against — the system shows what was expected, so you are checking a list, not writing one.',
    steps: [
      'Open Receiving, choose the order.',
      'Count and weigh; enter what actually arrived.',
      'Say where it goes — cold room or dry store.',
      'For fresh food, enter the date it goes off.',
      'Submit. Stock goes up straight away.',
    ],
    rules: ['BR-05', 'BR-07', 'BR-08'],
    related: ['receiving-discrepancy', 'receiving-partial', 'receiving-expiry'],
  },
  {
    id: 'receiving-discrepancy',
    title: 'The count does not match',
    roles: EVERYONE,
    screens: ['receiving'],
    asks: [
      'short delivery', 'wrong quantity', 'less than ordered', 'more than expected',
      'numbers do not match', 'damaged goods', 'discrepancy', 'they sent the wrong thing',
    ],
    body:
      'Enter what actually arrived. The system flags the gap for the warehouse manager and ' +
      'holds the task open until they look.\n\n' +
      'Never adjust it to match — the gap is the thing worth seeing.',
    rules: ['BR-08'],
    related: ['receiving-record', 'something-looks-wrong'],
  },
  {
    id: 'receiving-partial',
    title: 'Only part of the order came',
    roles: EVERYONE,
    screens: ['receiving', 'purchaseOrders'],
    asks: [
      'only part of the order came', 'rest is coming later', 'second delivery',
      'split delivery', 'partial delivery', 'half the order',
    ],
    body:
      'Normal, and expected. Receive what is in front of you; the order stays open for the ' +
      'balance and you receive the next load against the same one.',
    rules: ['BR-07A'],
    related: ['receiving-record', 'po-status'],
  },
  {
    id: 'receiving-expiry',
    title: 'Dates and storage',
    roles: EVERYONE,
    screens: ['receiving'],
    asks: [
      'expiry date', 'sell by date', 'cold room or dry store', 'where do I put it',
      'storage location', 'fresh produce', 'does it need a date',
    ],
    body:
      'Every item needs a place before the task closes; fresh food also needs its date. ' +
      'Those two answers are what tells packing to use the oldest stock first. Ask someone ' +
      'rather than guess.',
    rules: ['BR-06', 'BR-07'],
    related: ['receiving-record', 'fifo-fefo'],
  },
  {
    id: 'receiving-no-order',
    title: 'Goods with no order',
    roles: EVERYONE,
    screens: ['receiving', 'donation'],
    asks: [
      'there is no order for this', 'nothing to receive against', 'no purchase order',
      'it is not on the list', 'unexpected delivery',
    ],
    body:
      'If nobody bought it, it is a donation — use Donation intake instead. If it was ' +
      'bought and the order is missing, call the warehouse manager before unloading. Do ' +
      'not invent an order.',
    related: ['donation-intake', 'receiving-record'],
  },
  {
    id: 'deliveries-past',
    title: 'Looking up an old delivery',
    roles: EVERYONE,
    screens: ['deliveries', 'receipts'],
    asks: [
      'past deliveries', 'what came in last week', 'old delivery note', 'find a delivery',
      'delivery history', 'what did we receive',
    ],
    body:
      'Past deliveries is reached from the first Receiving screen. It lists what came in, ' +
      'when, and against which order, and you can open the note for any of them.',
    related: ['delivery-note', 'receiving-record'],
  },
  {
    id: 'delivery-note',
    title: 'The delivery note',
    roles: EVERYONE,
    screens: ['deliveries', 'receipts'],
    asks: [
      'delivery note', 'print a note', 'proof of what came in', 'pdf of the delivery',
      'paperwork for a delivery',
    ],
    body:
      'Open a past delivery and choose View note. It shows what was ordered, what actually ' +
      'arrived and the difference, so a short delivery is visible on the paperwork rather ' +
      'than only in the system.',
    rules: ['BR-08', 'BR-17'],
    related: ['deliveries-past', 'receiving-discrepancy'],
  },

  // ═══ Donations ════════════════════════════════════════════
  {
    id: 'donation-intake',
    title: 'Taking in a donation',
    roles: EVERYONE,
    screens: ['donation'],
    asks: [
      'someone donated food', 'how do I log a donation', 'record a donation',
      'a member of the public brought', 'donation came in', 'someone dropped off',
    ],
    body:
      'Three things, under a minute — what came in, roughly what it is worth, who brought ' +
      'it. Fill it in while they are standing there, not from memory afterwards. A rough ' +
      'value beats a blank.',
    rules: ['BR-09', 'NFR-05'],
    related: ['donation-18a', 'donation-what-we-take'],
  },
  {
    id: 'donation-18a',
    title: 'Why a donation needs a value',
    roles: EVERYONE,
    screens: ['donation'],
    asks: [
      'section 18a', 'tax certificate', 'why does it want a value', 'what is it worth',
      'donation receipt for the donor', '18a',
    ],
    body:
      'Donors can claim the donation against tax, and SARS needs a value and a record. ' +
      'No value, no certificate, and the donor loses the claim.',
    rules: ['BR-09', 'NFR-16'],
    related: ['donation-intake', 'section18a-certificates'],
  },
  {
    id: 'donation-what-we-take',
    title: 'What we can accept',
    roles: EVERYONE,
    screens: ['donation'],
    asks: [
      'can we accept this', 'is this ok to take', 'expired donation', 'opened packet',
      'should I take it', 'what can we accept',
    ],
    body:
      'Nothing expired, opened or unfit — it cannot go on a pallet, so taking it just moves ' +
      'the problem indoors. If you are unsure, log it and flag it for the manager rather ' +
      'than turning someone away at the gate.',
    rules: ['BR-15'],
    related: ['donation-intake', 'packing-shortage'],
  },
  {
    id: 'donation-donor-details',
    title: 'Donor details',
    roles: EVERYONE,
    screens: ['donation'],
    asks: [
      'do I need their name', 'donor details', 'anonymous donation', 'personal information',
      'do we have to ask', 'privacy',
    ],
    body:
      'Name and contact are needed for a tax certificate, and only for that. Anonymous is ' +
      'fine — record the donation without them. Do not record more than was offered.',
    rules: ['BR-09'],
    related: ['donation-18a'],
  },

  // ═══ Decanting ════════════════════════════════════════════
  {
    id: 'decanting-record',
    title: 'Recording a decanting run',
    roles: EVERYONE,
    screens: ['decanting'],
    asks: [
      'how do I record decanting', 'splitting bags', 'decanting sheet', 'we split a sack',
      'bagging up', 'repacking',
    ],
    body: 'This replaces the paper sheet. It works out how many bags a sack should give; you record what you actually got.',
    steps: [
      'Open Decanting, choose what you are splitting.',
      'Bag up.',
      'Enter the number you actually filled.',
      'Enter anything spoiled or spilled as wastage.',
      'Submit.',
    ],
    rules: ['BR-06'],
    related: ['decanting-wastage', 'decanting-records'],
  },
  {
    id: 'decanting-wastage',
    title: 'Recording wastage',
    roles: EVERYONE,
    screens: ['decanting'],
    asks: [
      'we lost some', 'spoiled', 'spilled', 'wastage', 'fewer bags than expected',
      'will I get in trouble', 'short on bags',
    ],
    body:
      'Record the real number and put the difference in as wastage. It counts against the ' +
      'sack and the supplier, not against you — and it is how a supplier whose sacks run ' +
      'light gets spotted.',
    related: ['decanting-record'],
  },
  {
    id: 'decanting-records',
    title: 'Past decanting runs',
    roles: EVERYONE,
    screens: ['decantingRecords'],
    asks: [
      'past decanting', 'old decanting sheet', 'what did we decant', 'decanting history',
    ],
    body: 'Reached from the crumb bar on Decanting. Every past run with its expected and actual bag counts, and what was wasted.',
    related: ['decanting-record'],
  },

  // ═══ Packing ══════════════════════════════════════════════
  {
    id: 'packing-pallet',
    title: 'Packing a pallet',
    roles: EVERYONE,
    screens: ['packing'],
    asks: ['how do I pack', 'what goes on this pallet', 'packing a slip', 'pack an order', 'make up a pallet'],
    body: 'The picking slip is the authority on what that centre gets, not a starting point.',
    steps: [
      'Open the next slip on the packing board.',
      'Pack to the list, oldest stock first.',
      'Mark the pallet packed.',
      'Move it to staging.',
    ],
    rules: ['BR-15'],
    related: ['fifo-fefo', 'packing-shortage', 'packing-claim'],
  },
  {
    id: 'fifo-fefo',
    title: 'Why oldest stock first',
    roles: EVERYONE,
    screens: ['packing', 'inventory'],
    asks: [
      'which one do I take', 'oldest first', 'fifo', 'fefo', 'why that box',
      'what order do I use stock', 'which box',
    ],
    body:
      'Take what goes off soonest; where nothing has a date, what arrived first. Taking ' +
      'from the front because it is easier leaves the old stock at the back until it is no ' +
      'good to anyone.',
    rules: ['BR-06'],
    related: ['packing-pallet', 'receiving-expiry'],
  },
  {
    id: 'packing-shortage',
    title: 'You cannot finish a pallet',
    roles: EVERYONE,
    screens: ['packing'],
    asks: [
      'not enough stock', 'item is expired', 'damaged item', 'short on the pallet',
      'cannot complete the pallet', 'something is missing', 'ran out',
    ],
    body:
      'Never pack expired or damaged stock to make a pallet look complete — the system will ' +
      'not let you, and there is a family at the other end.\n\n' +
      'Mark it incomplete. The manager decides whether to substitute, part-send or hold.',
    rules: ['BR-15'],
    related: ['packing-pallet', 'something-looks-wrong'],
  },
  {
    id: 'packing-claim',
    title: 'Taking a slip off the board',
    roles: EVERYONE,
    screens: ['packing'],
    asks: [
      'how do I claim a slip', 'whose pallet is this', 'someone else is on it',
      'take a job', 'assign to me', 'packing board',
    ],
    body:
      'Claim it and it shows as yours, so two people do not pack the same pallet. A ' +
      'manager can also assign one to you directly — that one is already yours when you ' +
      'open the board.',
    related: ['packing-pallet', 'picking-slip-assign'],
  },

  // ═══ Dispatch ═════════════════════════════════════════════
  {
    id: 'dispatch-collection',
    title: 'A collection at the gate',
    roles: EVERYONE,
    screens: ['dispatch'],
    asks: [
      'a driver is here', 'someone came to collect', 'how do I dispatch',
      'handing over a pallet', 'collection', 'they are here for their food',
    ],
    body: 'Check the pallet against the slip in front of the driver. Stock comes off the moment you complete it.',
    steps: [
      'Choose the centre that has arrived.',
      'Check the pallet against the slip, driver watching.',
      'Driver signs on the screen.',
      'Complete the collection.',
    ],
    rules: ['BR-06', 'BR-11', 'BR-13'],
    related: ['dispatch-signature', 'dispatch-non-collection', 'working-offline'],
  },
  {
    id: 'dispatch-signature',
    title: 'The driver has to sign',
    roles: EVERYONE,
    screens: ['dispatch'],
    asks: [
      'do they have to sign', 'can I skip the signature', 'driver will not sign',
      'proof of delivery', 'signature', 'they refuse to sign',
    ],
    body:
      'It replaces the paper collection book and cannot be skipped. If a driver will not or ' +
      'cannot sign, do not complete it — call the warehouse manager. An unsigned pallet ' +
      'lands on whoever was at the gate.',
    rules: ['BR-13'],
    related: ['dispatch-collection'],
  },
  {
    id: 'dispatch-non-collection',
    title: 'A centre did not collect',
    roles: EVERYONE,
    screens: ['dispatch', 'dispatchHistory'],
    asks: [
      'they did not come', 'nobody collected', 'no show', 'missed collection', '16:00',
      'four o clock', 'non collection', 'still not here',
    ],
    body:
      'Nothing to do. Anything uncollected by 16:00 is flagged automatically and goes on ' +
      'that centre’s record — which is what makes a pattern visible over months.',
    rules: ['BR-14', 'BR-26', 'BR-27'],
    related: ['dispatch-history', 'dispatch-collection'],
  },
  {
    id: 'dispatch-history',
    title: 'Who collected, and when',
    roles: EVERYONE,
    screens: ['dispatchHistory'],
    asks: [
      'collection history', 'did they collect', 'past collections', 'who came',
      'check a collection', 'dispatch history',
    ],
    body:
      'Reached from the crumb bar at the gate. Every past collection with its signature, ' +
      'and every one that was missed.',
    rules: ['BR-26', 'BR-27'],
    related: ['dispatch-non-collection', 'dispatch-note'],
  },
  {
    id: 'dispatch-note',
    title: 'The dispatch note',
    roles: EVERYONE,
    screens: ['dispatchHistory', 'receipts'],
    asks: ['dispatch note', 'print the collection', 'proof they took it', 'collection paperwork'],
    body: 'Open a past collection and choose View note — what went out, to whom, and the driver’s signature.',
    rules: ['BR-13'],
    related: ['dispatch-history'],
  },
  {
    id: 'picking-slip-qr',
    title: 'The QR code on a slip',
    roles: EVERYONE,
    screens: ['pickingSlips', 'dispatch'],
    asks: ['qr code', 'scan the slip', 'what is the square code', 'barcode on the slip'],
    body:
      'It opens that slip without signing in, so a driver or a centre can see exactly what ' +
      'they are collecting. It shows the slip only — nothing else in the system.',
    rules: ['BR-22'],
    related: ['picking-slip-types'],
  },

  // ═══ Inventory (manager+) ═════════════════════════════════
  {
    id: 'inventory-columns',
    title: 'Reading the inventory screen',
    roles: MANAGERS_UP,
    screens: ['inventory'],
    asks: [
      'what does on hand mean', 'committed', 'available', 'reorder level',
      'what do the columns mean', 'how much do we have', 'stock levels',
    ],
    body:
      'On hand is what is in the building. Committed is already promised to slips that have ' +
      'not gone out. Available is what is left to promise — the one to trust.\n\n' +
      'Below reorder level, an item shows as low.',
    related: ['inventory-item-summary', 'inventory-low-stock'],
  },
  {
    id: 'inventory-item-summary',
    title: 'One item in detail',
    roles: MANAGERS_UP,
    screens: ['inventory'],
    asks: [
      'see one product', 'history of an item', 'trend', 'graph', 'stock over time',
      'click on a row', 'details of an item',
    ],
    body:
      'Click any row. Everything about that item in one place, plus a chart of how the ' +
      'quantity has moved — worked out from the real movements in and out.',
    related: ['inventory-columns', 'stock-ledger'],
  },
  {
    id: 'stock-adjustment',
    title: 'Correcting a stock figure',
    roles: MANAGERS_UP,
    screens: ['inventory'],
    asks: [
      'the number is wrong', 'stock does not match', 'how do I correct stock',
      'stock adjustment', 'count is off', 'shelf does not match the screen', 'fix stock',
    ],
    body:
      'Use a stock adjustment — it asks for the figure and the reason, and records who and ' +
      'when. Count it again first if you are unsure.\n\n' +
      'Never correct it with an opposite movement; that looks like real stock moving.',
    related: ['inventory-columns', 'undo-a-mistake'],
  },
  {
    id: 'inventory-low-stock',
    title: 'What counts as low',
    roles: MANAGERS_UP,
    screens: ['inventory'],
    asks: [
      'low stock', 'running out', 'what is low', 'reorder', 'shortfall', 'we need more',
      'what should I order',
    ],
    body:
      'Below its reorder level, an item is marked low and appears on your dashboard. ' +
      'Purchase Orders will offer to start an order from everything currently low.',
    related: ['po-create', 'product-fields'],
  },
  {
    id: 'stock-ledger',
    title: 'The stock ledger',
    roles: MANAGERS_UP,
    screens: ['stockLedger'],
    asks: [
      'stock ledger', 'every movement', 'where did the stock go', 'audit stock',
      'why did the number change', 'stock movements',
    ],
    body:
      'Every movement in and out, warehouse-wide, with who did it. This is where to look ' +
      'when a figure changed and nobody knows why.',
    related: ['inventory-item-summary', 'stock-adjustment'],
  },
  {
    id: 'expired-stock',
    title: 'Stock that has gone off',
    roles: MANAGERS_UP,
    screens: ['inventory'],
    asks: [
      'expired stock', 'it went off', 'out of date', 'write off', 'throw away',
      'spoiled stock', 'past its date',
    ],
    body:
      'Take it out with a stock adjustment and say why. It must leave the figures, or the ' +
      'next picking slip promises food that is not fit to send.',
    rules: ['BR-15'],
    related: ['stock-adjustment', 'fifo-fefo'],
  },

  // ═══ Purchase orders (manager+) ═══════════════════════════
  {
    id: 'po-create',
    title: 'Raising a purchase order',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders'],
    asks: [
      'order more stock', 'how do I make a purchase order', 'new po', 'buy stock',
      'we are running low', 'create an order', 'order from a supplier',
    ],
    body: 'If things are already below reorder level it offers to start from those, with a suggested quantity you should overwrite freely.',
    steps: [
      'Purchase Orders, then New.',
      'Pick the supplier.',
      'A line per item; set the quantity.',
      'Check the estimate and send.',
    ],
    related: ['po-line-numbers', 'po-status', 'inventory-low-stock'],
  },
  {
    id: 'po-line-numbers',
    title: 'Quantity, weight and cost',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders'],
    asks: [
      'the weight changed by itself', 'why did the price change', 'unit price', 'line cost',
      'the numbers move together', 'quantity and weight', 'it changed my number',
    ],
    body:
      'Three ways of saying one thing, kept in step from the product’s recorded weight and ' +
      'cost. Change any one and the others follow. Nothing recorded means that box is left ' +
      'alone rather than filled with a confident zero.',
    related: ['po-create', 'product-fields'],
  },
  {
    id: 'po-status',
    title: 'What an order’s status means',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders'],
    asks: [
      'what does returned mean', 'follow up required', 'order status', 'open order',
      'who can change the status', 'close an order', 'is the order done',
    ],
    body:
      'Raised, then received in full or in part; returned or follow-up when the supplier ' +
      'has gone wrong. Only the warehouse manager changes it — receiving staff record what ' +
      'arrived and the order follows.',
    rules: ['BR-07B'],
    related: ['receiving-partial', 'po-create'],
  },
  {
    id: 'receipts-screen',
    title: 'The receipts archive',
    roles: MANAGERS_UP,
    screens: ['receipts'],
    asks: [
      'receipts', 'where are the notes', 'find paperwork', 'old notes', 'archive',
      'delivery and dispatch notes',
    ],
    body: 'Every delivery note and dispatch note in one place, searchable. The place to look when someone asks what happened on a date.',
    related: ['delivery-note', 'dispatch-note'],
  },

  // ═══ Picking slips (manager+) ═════════════════════════════
  {
    id: 'picking-slip-create',
    title: 'Creating a picking slip',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'how do I make a picking slip', 'new slip', 'what a centre gets', 'create a slip',
      'order for a centre', 'set up a collection',
    ],
    body:
      'Kind of beneficiary, then the centre, then items and quantities. What you put on the ' +
      'slip is what goes out — packing works to it exactly.',
    rules: ['BR-18', 'BR-19', 'BR-20', 'BR-21'],
    related: ['picking-slip-types', 'picking-slip-assign'],
  },
  {
    id: 'picking-slip-types',
    title: 'The three kinds of slip',
    roles: EVERYONE,
    screens: ['pickingSlips', 'packing'],
    asks: [
      'ecd', 'dignity kitchen', 'soup kitchen', 'types of slip', 'what is an ecd centre',
      'different beneficiaries', 'what is a creche slip',
    ],
    body:
      'ECD centres are crèches, collecting on a cycle with quantities based on child ' +
      'numbers. Soup kitchens serve meals. Dignity kitchens work differently again — which ' +
      'is why the slip asks first.',
    rules: ['BR-18', 'BR-19', 'BR-20', 'BR-21', 'NFR-20'],
    related: ['picking-slip-create', 'beneficiary-manage'],
  },
  {
    id: 'picking-slip-assign',
    title: 'Giving a slip to someone',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'assign a slip', 'give it to someone', 'who is packing this', 'allocate work',
      'hand it to a packer',
    ],
    body:
      'Assign it to a person, or leave it on the packing board for whoever is free to ' +
      'claim. Assigning is worth it when it has to be someone in particular.',
    related: ['picking-slip-create', 'packing-claim'],
  },
  {
    id: 'picking-slip-generate',
    title: 'Slips for a whole cycle',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'generate slips', 'all the centres at once', 'bulk create slips', 'do them all',
      'slips for the week',
    ],
    body:
      'Generate builds a slip for every active centre due in the cycle, from their recorded ' +
      'quantities. Check them before packing starts — it is a starting point, not a decision.',
    rules: ['BR-12'],
    related: ['picking-slip-create', 'beneficiary-ecd-numbers'],
  },

  // ═══ Beneficiaries (manager+) ═════════════════════════════
  {
    id: 'beneficiary-manage',
    title: 'Beneficiaries',
    roles: MANAGERS_UP,
    screens: ['beneficiaries'],
    asks: [
      'add a centre', 'new ecd', 'onboard a centre', 'beneficiary details',
      'a centre closed', 'change a centre', 'contact for a centre',
    ],
    body:
      'The centres that collect from us: what kind each is, who to contact, and for ECDs ' +
      'the number of children. Onboarding and offboarding happen roughly quarterly.',
    rules: ['BR-11', 'BR-27'],
    related: ['beneficiary-ecd-numbers', 'beneficiary-inactive', 'picking-slip-types'],
  },
  {
    id: 'beneficiary-ecd-numbers',
    title: 'How many children a centre has',
    roles: MANAGERS_UP,
    screens: ['beneficiaries'],
    asks: [
      'number of children', 'how many kids', 'child numbers', 'headcount',
      'why does it ask how many children', 'they have more children now',
    ],
    body:
      'It is what an ECD centre’s quantities are worked out from, so it is worth keeping ' +
      'honest — and worth updating when a centre tells you it has changed.',
    rules: ['BR-11'],
    related: ['beneficiary-manage', 'picking-slip-generate', 'reporting-impact'],
  },
  {
    id: 'beneficiary-inactive',
    title: 'A centre that has stopped',
    roles: MANAGERS_UP,
    screens: ['beneficiaries'],
    asks: [
      'centre closed', 'they stopped collecting', 'remove a beneficiary', 'offboard',
      'delete a centre', 'they are not coming anymore',
    ],
    body:
      'Mark it inactive rather than deleting. It stops appearing on new slips, and its ' +
      'history stays intact for reporting.',
    rules: ['BR-27'],
    related: ['beneficiary-manage', 'archive-not-delete'],
  },
  {
    id: 'benevolent-requests',
    title: 'Benevolent package requests',
    roles: EVERYONE,
    screens: ['communityRequests'],
    asks: [
      'someone phoned asking for food', 'call in request', 'benevolent package',
      'a person needs help', 'community request', 'walk in asking for food',
    ],
    body:
      'Log a phoned-in request here rather than on a note — who asked, what for, and what ' +
      'happened about it. These used to go untracked entirely.',
    rules: ['BR-28'],
    related: ['something-looks-wrong'],
  },

  // ═══ Reporting (manager+) ═════════════════════════════════
  {
    id: 'reporting-ask',
    title: 'Getting a report',
    roles: MANAGERS_UP,
    screens: ['reporting'],
    asks: [
      'how do I get a report', 'run a report', 'ask a question about the data',
      'how much went out', 'numbers for the month', 'statistics', 'figures',
    ],
    body:
      'Type the question in plain English — "how much food went out in July". It only runs ' +
      'reports that already exist, so it cannot invent a figure. The builder underneath ' +
      'does the same with dropdowns.',
    related: ['reporting-impact', 'reporting-export'],
  },
  {
    id: 'reporting-impact',
    title: 'Impact reports',
    roles: MANAGERS_UP,
    screens: ['impactReport', 'reporting'],
    asks: [
      'impact report', 'how many children fed', 'report for a donor', 'our impact',
      'meals served', 'report for the board',
    ],
    body:
      'ECD centres and soup kitchens only — Dignity Kitchen is deliberately left out. ' +
      'Children are counted once a period however many times a centre collects.',
    rules: ['NFR-20'],
    related: ['reporting-ask', 'beneficiary-ecd-numbers'],
  },
  {
    id: 'reporting-export',
    title: 'Getting a report out',
    roles: MANAGERS_UP,
    screens: ['reporting', 'impactReport'],
    asks: [
      'export a report', 'download', 'pdf', 'send it to someone', 'print a report',
      'give it to the board', 'spreadsheet',
    ],
    body: 'Use the download on the report itself. Check the date range on the report before sending it anywhere — it is the thing people misread.',
    related: ['reporting-ask'],
  },

  // ═══ Volunteers (manager+) ════════════════════════════════
  {
    id: 'volunteer-log',
    title: 'Who is signed in',
    roles: MANAGERS_UP,
    screens: ['volunteers'],
    asks: [
      'volunteers', 'who signed in today', 'volunteer log', 'who is in the building',
      'volunteer hours', 'who is here',
    ],
    body: 'Volunteers sign in with a first name on arrival. The log shows who is in now, who has been before, and when they signed out.',
    related: ['volunteer-events', 'guest-sign-in'],
  },
  {
    id: 'volunteer-events',
    title: 'Volunteer events',
    roles: MANAGERS_UP,
    screens: ['volunteers'],
    asks: [
      'volunteer event', 'set up a session', 'group coming in', 'corporate volunteers',
      'book volunteers', 'schedule volunteers',
    ],
    body: 'Create the event and its time slots, and volunteers sign in against it on the day. That is what turns a sign-in into a countable hour.',
    related: ['volunteer-log'],
  },
  {
    id: 'guest-sign-in',
    title: 'Guest sign-in',
    roles: EVERYONE,
    screens: ['home', 'volunteers'],
    asks: [
      'guest login', 'volunteer cannot log in', 'first name only', 'they have no account',
      'sign in a visitor',
    ],
    body:
      'Volunteers use Log in as guest and give a first name — no account needed. They see ' +
      'only their own event screen.',
    related: ['volunteer-log', 'who-can-do-what'],
  },

  // ═══ Master data (admin) ══════════════════════════════════
  {
    id: 'product-fields',
    title: 'Adding or editing a product',
    roles: ADMIN_ONLY,
    screens: ['products'],
    asks: [
      'add a product', 'new item in the catalogue', 'edit a product', 'product code',
      'cost per item', 'weight per item', 'reorder level', 'change a product',
    ],
    body:
      'Name and stock code are required; weight, cost and reorder level are optional but ' +
      'do real work — they fill in order lines and decide what shows as low. A wrong ' +
      'number here becomes a wrong number on every order.',
    rules: ['BR-05'],
    related: ['po-line-numbers', 'archive-not-delete', 'inventory-low-stock'],
  },
  {
    id: 'master-data-admin-only',
    title: 'Why only an admin edits products',
    roles: EVERYONE,
    screens: ['products', 'inventory', 'suppliers'],
    general: true,
    asks: [
      'why can I not edit a product', 'manager cannot edit products', 'who edits the catalogue',
      'why is product management missing', 'I want to change a product',
    ],
    body:
      'Products and suppliers are what everything else is built on — changing a weight ' +
      'changes every order estimate. Managers still do everything operational, including ' +
      'stock adjustments. Ask an admin for a catalogue change.',
    rules: ['BR-01'],
    related: ['stock-adjustment', 'who-can-do-what'],
  },
  {
    id: 'supplier-manage',
    title: 'Suppliers',
    roles: ADMIN_ONLY,
    screens: ['suppliers'],
    asks: [
      'add a supplier', 'new supplier', 'supplier details', 'change a supplier',
      'supplier contact', 'we stopped using them',
    ],
    body: 'Who we buy from, and their contact details. A supplier you no longer use is deactivated, not deleted — past orders still name them.',
    related: ['archive-not-delete', 'po-create'],
  },
  {
    id: 'archive-not-delete',
    title: 'Removing something safely',
    roles: ADMIN_ONLY,
    screens: ['products', 'suppliers', 'users'],
    asks: [
      'delete a product', 'remove a supplier', 'how do I delete', 'archive',
      'it is still showing', 'get rid of an old item', 'deactivate',
    ],
    body:
      'Deactivate takes it out of the lists people pick from. Remove goes further — gone as ' +
      'a choice, but past orders and reports still read correctly.\n\n' +
      'Nothing is truly erased; that would rewrite last year’s figures.',
    rules: ['BR-27', 'NFR-16'],
    related: ['product-fields', 'beneficiary-inactive'],
  },
  {
    id: 'users-and-accounts',
    title: 'Setting up a user',
    roles: ADMIN_ONLY,
    screens: ['users'],
    asks: [
      'add a user', 'new staff member', 'reset a password', 'change someone role',
      'someone left', 'create an account', 'give someone access',
    ],
    body:
      'Create the account, choose the role, set the first password. Give the narrowest role ' +
      'that lets them work and widen it later.\n\n' +
      'When someone leaves, deactivate rather than remove — their recorded work stays ' +
      'attributable.',
    rules: ['BR-01', 'NFR-08'],
    related: ['who-can-do-what', 'archive-not-delete'],
  },
  {
    id: 'donation-management-screen',
    title: 'Reviewing donations',
    roles: ADMIN_ONLY,
    screens: ['donationManagement'],
    asks: [
      'donation management', 'review donations', 'pending donations', 'check a donation',
      'donation value is wrong', 'approve donations',
    ],
    body: 'Where donations taken in at the gate get checked, valued properly and classified. The place to correct a rough value entered in a hurry.',
    rules: ['BR-09'],
    related: ['donation-intake', 'section18a-certificates'],
  },
  {
    id: 'section18a-certificates',
    title: 'Section 18A certificates',
    roles: ADMIN_ONLY,
    screens: ['section18a'],
    asks: [
      'section 18a certificate', 'issue a certificate', 'tax certificate for a donor',
      'certificate queue', '18a management', 'send a certificate',
    ],
    body:
      'Donations flagged at receipt queue up here to be issued. Every action is recorded, ' +
      'because SARS needs the trail as much as the certificate.',
    rules: ['BR-09', 'BR-04', 'NFR-16'],
    related: ['donation-18a', 'donation-management-screen'],
  },
  {
    id: 'email-settings',
    title: 'Email settings',
    roles: ADMIN_ONLY,
    screens: ['emailIntegration'],
    asks: [
      'email settings', 'gmail', 'emails are not sending', 'connect email',
      'who do emails come from', 'certificate emails',
    ],
    body: 'Where the account that sends certificates and notifications is connected. If emails have stopped, check the connection here first.',
    related: ['section18a-certificates'],
  },
];

export const TOPIC_IDS = TOPICS.map((t) => t.id);

// ── Lookups used by the tool schema and the service ──────────
const byId = new Map(TOPICS.map((t) => [t.id, t]));

export const getTopic = (id) => byId.get(id) ?? null;

/** Topics this role is allowed to be told about. */
export const topicsForRole = (role) => TOPICS.filter((t) => t.roles.includes(role));

/** A screen by id, only if this role may be sent there. */
export const screenForRole = (id, role) =>
  SCREENS.find((s) => s.id === id && s.roles.includes(role)) ?? null;

/**
 * The starter chips shown when the panel opens on a given screen:
 * topics tied to that screen, narrowed to what this role may see.
 * No model call and no cost — a read of the catalogue.
 *
 * ORDER MATTERS MORE THAN IT LOOKS. These four chips are the whole
 * interface for someone who does not know what to type, so the job
 * this screen is FOR has to come first. `general: true` marks the
 * topics that apply on many screens — offline, undo, resuming work —
 * and ranks them below. Within what is left, a topic whose FIRST
 * screen is this one wins: "why oldest stock first" belongs on both
 * Packing and Inventory, and is why you are on Packing.
 *
 * Falls back to the general topics, so the panel is never empty on a
 * screen nobody has written topics for yet.
 */
export const suggestionsFor = (screenId, role, limit = 4) => {
  const allowed  = topicsForRole(role);
  const onScreen = allowed.filter((t) => t.screens?.includes(screenId));
  const source   = onScreen.length > 0
    ? onScreen
    : allowed.filter((t) => t.screens?.includes('home'));

  // Stable: equal ranks keep catalogue order, so the file reads in
  // the order the chips appear.
  const rank = (t) => (t.general ? 2 : 0) + (t.screens?.[0] === screenId ? 0 : 1);

  return source
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .slice(0, limit)
    .map(({ t }) => ({ id: t.id, title: t.title }));
};

/** What crosses the wire. `asks` and `rules` stay on the server. */
export const publicTopic = (topic) => ({
  id:      topic.id,
  title:   topic.title,
  body:    topic.body,
  steps:   topic.steps ?? null,
  screens: topic.screens ?? [],
  related: (topic.related ?? [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((t) => ({ id: t.id, title: t.title })),
});

export default {
  SCREENS, SCREEN_IDS, TOPICS, TOPIC_IDS,
  getTopic, topicsForRole, screensForRole, screenForRole,
  suggestionsFor, publicTopic,
};
