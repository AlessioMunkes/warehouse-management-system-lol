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
//
// `about` is one line on what the screen is FOR. It goes in the
// model's prompt, so "where do I log compost" can find Feed the Soil
// without a topic having to say so, and it comes back with a
// navigate answer so the person knows what they have landed on.
//
// `aka` is what else people call it — above all the sidebar's own
// wording, which is not always the label here ("Classification
// Queue" is Donation management). Prompt only; never shown.
export const SCREENS = [
  { id: 'home', label: 'Your home screen', roles: EVERYONE,
    about: 'Your dashboard: the jobs you do, and what needs attention today.',
    aka: ['dashboard', 'home', 'start page', 'main menu', 'task dashboard'] },

  // The warehouse floor. <ProtectedRoute /> with no role list.
  { id: 'receiving', label: 'Receiving', roles: EVERYONE,
    about: 'Book in a delivery against its purchase order: count, weigh, place, date.',
    aka: ['procurement', 'goods in', 'book in stock', 'unloading'] },
  { id: 'deliveries', label: 'Past deliveries', roles: EVERYONE,
    about: 'Every delivery already received, with its delivery note.',
    aka: ['delivery history', 'old deliveries', 'delivery notes'] },
  { id: 'decanting', label: 'Decanting', roles: EVERYONE,
    about: 'Split bulk sacks into bags and record what you actually got, plus wastage.',
    aka: ['bagging', 'repacking', 'splitting sacks', 'decanting sheet'] },
  { id: 'decantingRecords', label: 'Past decanting runs', roles: EVERYONE,
    about: 'Every past decanting run with expected and actual bags.',
    aka: ['decanting sheets', 'decanting history'] },
  { id: 'packing', label: 'Packing', roles: EVERYONE,
    about: 'The packing board: claim a picking slip and pack its pallet.',
    aka: ['packing board', 'pallets', 'pack an order'] },
  { id: 'dispatch', label: 'The dispatch gate', roles: EVERYONE,
    about: 'Hand pallets over to collecting centres, with the driver signing on screen.',
    aka: ['dispatch', 'gate', 'collections', 'hand over'] },
  { id: 'dispatchHistory', label: 'Collection history', roles: EVERYONE,
    about: 'Every past collection with its signature, and every missed one.',
    aka: ['dispatch history', 'past collections', 'dispatch notes'] },
  { id: 'donation', label: 'Donation intake', roles: EVERYONE,
    about: 'Log food someone has donated: what, rough value, who brought it.',
    aka: ['donations', 'log a donation', 'new donation'] },
  { id: 'communityRequests', label: 'Benevolent requests', roles: EVERYONE,
    about: 'Log phoned-in or walk-in requests for a food parcel, and what happened.',
    aka: ['community requests', 'call-in requests', 'benevolent packages', 'food parcel requests'] },
  { id: 'feedTheSoil', label: 'Feed the Soil', roles: EVERYONE,
    about: 'Compost collection kits: assign a kit to a household, log compost weighed in, mark it sent to a farm.',
    aka: ['compost', 'collection kits', 'food waste', 'compost kits', 'soil'] },

  // Manager and admin. roles={['manager','admin']} in App.jsx.
  { id: 'inventory', label: 'Inventory', roles: MANAGERS_UP,
    about: 'Stock levels per item: on hand, committed, available, and what is low.',
    aka: ['stock', 'stock levels', 'what we have'] },
  { id: 'stockLedger', label: 'Stock ledger', roles: MANAGERS_UP,
    about: 'Every stock movement in and out, warehouse-wide, with who did it.',
    aka: ['stock movements', 'audit trail', 'ledger'] },
  { id: 'purchaseOrders', label: 'Purchase orders', roles: MANAGERS_UP,
    about: 'Raise and track orders to suppliers. New orders are emailed to Finance.',
    aka: ['POs', 'orders', 'buying', 'procurement orders'] },
  { id: 'pickingSlips', label: 'Picking slips', roles: MANAGERS_UP,
    about: 'Create, generate and assign the slips that say what each centre gets.',
    aka: ['slips', 'picking list', 'centre orders'] },
  { id: 'beneficiaries', label: 'Beneficiaries', roles: MANAGERS_UP,
    about: 'The centres that collect from us, their contacts and child numbers.',
    aka: ['centres', 'ECDs', 'soup kitchens', 'beneficiary directory'] },
  { id: 'collectionReminders', label: 'Collection reminders', roles: MANAGERS_UP,
    about: 'Tomorrow’s ECD collection reminders: email status, and WhatsApp messages to send.',
    aka: ['reminders', 'whatsapp reminders', 'ecd reminders', 'collection messages'] },
  { id: 'receipts', label: 'Receipts', roles: MANAGERS_UP,
    about: 'The archive of delivery notes and dispatch notes.',
    aka: ['paperwork', 'notes archive', 'documents'] },
  { id: 'reporting', label: 'Operations reports', roles: MANAGERS_UP,
    about: 'Ask a question about the figures, or browse reports by area, with charts and who to act on.',
    aka: ['reporting', 'reports', 'analytics', 'operations analytics', 'statistics'] },
  { id: 'impactReport', label: 'Impact reports', roles: MANAGERS_UP,
    about: 'The Impact Calculator: meals, children and adults served, compost processed, poster PDF.',
    aka: ['impact calculator', 'impact report', 'donor report', 'meals served'] },
  { id: 'volunteers', label: 'Volunteer events', roles: MANAGERS_UP,
    about: 'Set up volunteer events and time slots, and see who signed in to each.',
    aka: ['volunteer events', 'volunteer sessions', 'corporate groups'] },

  // Admin. roles={['admin']} in App.jsx.
  { id: 'products', label: 'Product management', roles: ADMIN_ONLY,
    about: 'The product catalogue: names, codes, weights, costs, reorder levels.',
    aka: ['products', 'catalogue', 'items'] },
  { id: 'suppliers', label: 'Supplier management', roles: ADMIN_ONLY,
    about: 'Who we buy from, and their contact details.',
    aka: ['suppliers', 'vendors'] },
  { id: 'users', label: 'User management', roles: ADMIN_ONLY,
    about: 'Staff accounts, roles and passwords.',
    aka: ['users', 'accounts', 'staff accounts', 'logins'] },
  { id: 'donationManagement', label: 'Donation management', roles: ADMIN_ONLY,
    about: 'Check, value and classify donations taken in at the gate.',
    aka: ['classification queue', 'review donations', 'flagged donations'] },
  { id: 'section18a', label: 'Section 18A certificates', roles: ADMIN_ONLY,
    about: 'Issue and track tax certificates for donors.',
    aka: ['18a', 'tax certificates', 'certificate queue'] },
  { id: 'emailIntegration', label: 'Email settings', roles: ADMIN_ONLY,
    about: 'The Gmail account the system sends from, and the Finance recipient for orders and reports.',
    aka: ['email integration', 'gmail', 'finance email', 'finance recipient'] },
  { id: 'financeReport', label: 'Finance report', roles: ADMIN_ONLY,
    about: 'Warehouse Movement Report: purchase orders, donations and dispatches for a period, with exports.',
    aka: ['warehouse movement report', 'finance', 'movement report', 'quickbooks report'] },
  { id: 'volunteerLog', label: 'Volunteer log', roles: ADMIN_ONLY,
    about: 'Every guest sign-in at the door; sign out a visit so its hours count.',
    aka: ['guest log', 'sign-in log', 'visitor log', 'who was on site'] },
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
      'and in somebody’s head at once. It also logs donations, food parcel requests and ' +
      'Feed the Soil compost.',
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
    id: 'which-warehouse',
    title: 'Which warehouse you are in',
    roles: EVERYONE,
    screens: ['home'],
    general: true,
    asks: [
      'switch warehouse', 'change warehouse', 'wrong warehouse', 'other site',
      'which warehouse am I in', 'the other branch', 'I cannot see the other warehouse',
    ],
    body:
      'The warehouse name is in the top bar next to the bell. If you work at more than ' +
      'one, tap it to switch — you go to that site’s home screen, and your role there ' +
      'may differ. Not there? Your account has one warehouse.\n\n' +
      'Check it before recording a delivery. Stock booked to the wrong site is hard to spot.',
    related: ['who-can-do-what', 'find-my-way'],
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
    id: 'po-finance-email',
    title: 'Orders and Finance',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders', 'emailIntegration'],
    asks: [
      'does finance know about the order', 'quickbooks', 'send the po to finance',
      'finance email', 'did finance get it', 'accounts need the order', 'capture in quickbooks',
    ],
    body:
      'Every new purchase order is emailed to Finance automatically, with its lines and ' +
      'total, so they can capture it in QuickBooks. Nothing to do — but if Finance says it ' +
      'never arrived, ask an admin to check the Finance recipient in Email settings.',
    related: ['po-create', 'finance-recipient'],
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
      'the number of children and a mobile number for reminders. Onboarding and ' +
      'offboarding happen roughly quarterly.',
    rules: ['BR-11', 'BR-27'],
    related: ['beneficiary-ecd-numbers', 'beneficiary-inactive', 'collection-reminders'],
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
    id: 'collection-reminders',
    title: 'Collection reminders',
    roles: MANAGERS_UP,
    screens: ['collectionReminders', 'beneficiaries'],
    asks: [
      'remind a centre', 'collection reminder', 'do centres get reminded', 'ecd reminder',
      'remind them to collect tomorrow', 'reminder messages', 'did the reminder go',
    ],
    body:
      'ECD centres collecting tomorrow are emailed a reminder automatically at 8:00. ' +
      'Collection reminders shows each one’s email status, and a WhatsApp message ready ' +
      'to send by hand.',
    related: ['collection-reminder-whatsapp', 'collection-reminder-failed'],
  },
  {
    id: 'collection-reminder-whatsapp',
    title: 'Sending a WhatsApp reminder',
    roles: MANAGERS_UP,
    screens: ['collectionReminders'],
    asks: [
      'whatsapp', 'send a whatsapp', 'message the centre', 'whatsapp reminder',
      'text the ecd', 'open whatsapp',
    ],
    body: 'The system writes the message; you send it from the WhatsApp signed in on this device.',
    steps: [
      'Open Collection reminders.',
      'Choose Open WhatsApp on the centre’s row.',
      'Send the prefilled message in WhatsApp.',
      'Come back and choose Mark sent.',
    ],
    related: ['collection-reminders', 'collection-reminder-failed'],
  },
  {
    id: 'collection-reminder-failed',
    title: 'A reminder did not go',
    roles: MANAGERS_UP,
    screens: ['collectionReminders', 'beneficiaries'],
    asks: [
      'reminder failed', 'email failed', 'whatsapp button is greyed out', 'no reminder sent',
      'centre did not get the reminder', 'retry the email', 'missing phone number',
    ],
    body:
      'A failed email has Retry email on its row. A greyed-out Open WhatsApp means the ' +
      'centre has no mobile number — add it on Beneficiaries so next time works.',
    related: ['collection-reminders', 'beneficiary-manage', 'email-settings'],
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

  // ═══ Feed the Soil ════════════════════════════════════════
  {
    id: 'feed-the-soil',
    title: 'What Feed the Soil is',
    roles: EVERYONE,
    screens: ['feedTheSoil'],
    asks: [
      'what is feed the soil', 'compost programme', 'collection kit', 'food waste for compost',
      'what are the kits', 'compost',
    ],
    body:
      'Households get a collection kit for food waste. What they bring back is weighed in ' +
      'as compost and sent on to a farm. The compost figure on the Impact Calculator comes ' +
      'only from what is logged here.',
    related: ['feed-the-soil-assign', 'feed-the-soil-log', 'feed-the-soil-dispatch'],
  },
  {
    id: 'feed-the-soil-assign',
    title: 'Giving someone a kit',
    roles: EVERYONE,
    screens: ['feedTheSoil'],
    asks: [
      'assign a kit', 'new kit', 'someone wants a kit', 'give out a kit',
      'sign up for compost', 'register a household',
    ],
    body:
      'Feed the Soil, Kits, then Assign a kit. Owner’s name is required; suburb is ' +
      'optional but it is what the compost-by-region figure is built from.',
    related: ['feed-the-soil', 'feed-the-soil-log'],
  },
  {
    id: 'feed-the-soil-log',
    title: 'Logging compost that came in',
    roles: EVERYONE,
    screens: ['feedTheSoil'],
    asks: [
      'log compost', 'weigh the compost', 'someone brought their bucket', 'compost came in',
      'record kilograms', 'kit came back',
    ],
    body: 'Weigh it before you record it — the kilograms are the whole point.',
    steps: [
      'Feed the Soil, then Log a collection.',
      'Find the kit by owner or suburb.',
      'Enter the kilograms and the date.',
      'Log compost.',
    ],
    related: ['feed-the-soil', 'feed-the-soil-dispatch'],
  },
  {
    id: 'feed-the-soil-dispatch',
    title: 'Sending compost to a farm',
    roles: EVERYONE,
    screens: ['feedTheSoil'],
    asks: [
      'compost to the farm', 'mark dispatched', 'compost collected by farmer',
      'where did the compost go', 'send compost',
    ],
    body:
      'Open the compost record and choose Mark dispatched, then name the farmer or drop-off ' +
      'point. Dispatched records sink to the bottom of the list.',
    related: ['feed-the-soil-log'],
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
      'The Impact Calculator turns food sent out into people served — children at ECDs, ' +
      'adults at soup kitchens, dignity kitchen guests and households — plus compost ' +
      'processed. Children are counted once a period however many times a centre collects.',
    rules: ['NFR-20'],
    related: ['impact-conversions', 'reporting-export', 'beneficiary-ecd-numbers'],
  },
  {
    id: 'impact-conversions',
    title: 'How kilograms become meals',
    roles: MANAGERS_UP,
    screens: ['impactReport'],
    asks: [
      'how many meals does a kg make', 'where does the meals number come from',
      'conversion rate', 'kg to meals', 'is the meals figure real', 'change the meal rate',
    ],
    body:
      'Meals and people served are worked out from kilograms dispatched, using the rates ' +
      'shown on the calculator ("how many meals does 1 kg feed?"). Change a rate and every ' +
      'figure follows — so agree it before a report goes out, and say which rate you used.',
    related: ['reporting-impact'],
  },
  {
    id: 'impact-poster',
    title: 'The impact poster',
    roles: MANAGERS_UP,
    screens: ['impactReport'],
    asks: [
      'impact poster', 'pdf for donors', 'print the impact', 'one page summary',
      'something to show the board', 'export impact',
    ],
    body:
      'Export the calculator as a PDF poster — the headline figures in a grid, ready to ' +
      'print or send. Set the period first; the poster shows whatever the screen shows.',
    related: ['reporting-impact', 'reporting-export'],
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
  {
    id: 'reporting-browse',
    title: 'Browsing the reports',
    roles: MANAGERS_UP,
    screens: ['reporting'],
    asks: [
      'what reports are there', 'list of reports', 'which reports can I run',
      'report on suppliers', 'report on wastage', 'report on collections', 'all reports',
    ],
    body:
      'Under the question box, the reports are grouped by area — dispatch, picking and ' +
      'decanting, receiving and suppliers, procurement, stock, and donations and ' +
      'volunteers. The suggested questions are a quick way in.',
    related: ['reporting-ask', 'reporting-insights'],
  },
  {
    id: 'reporting-insights',
    title: 'Reading a report’s chart and insight',
    roles: MANAGERS_UP,
    screens: ['reporting'],
    asks: [
      'what does the chart mean', 'what is the dotted line', 'target line', 'who to act on',
      'what should I do about this report', 'highlight a bar', 'compare to last month',
      'is this good or bad',
    ],
    body:
      'Under each report are the key figures, how they compare with the period before, and ' +
      'a list of who to act on — the centre, supplier or product behind the number. The ' +
      'line across the chart is the working target. Tap a bar or point to highlight it.',
    related: ['reporting-ask', 'reporting-browse'],
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
    body: 'Volunteers sign in with a first name on arrival, against an event. Open the event to see who is in now and who has been. Admins also have the full door log.',
    related: ['volunteer-events', 'guest-sign-in', 'volunteer-guest-log'],
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
    related: ['finance-recipient', 'section18a-certificates'],
  },
  {
    id: 'finance-recipient',
    title: 'Where Finance emails go',
    roles: ADMIN_ONLY,
    screens: ['emailIntegration', 'financeReport'],
    asks: [
      'finance email address', 'change the finance recipient', 'who gets the purchase orders',
      'finance did not get the po', 'send finance the report', 'report link for finance',
    ],
    body:
      'Save the Finance recipient in Email settings. New purchase orders go there, and so ' +
      'does the report link — Send Finance Report Link gives them the movement report without ' +
      'an account.',
    related: ['po-finance-email', 'finance-report', 'email-settings'],
  },
  {
    id: 'finance-report',
    title: 'The warehouse movement report',
    roles: ADMIN_ONLY,
    screens: ['financeReport'],
    asks: [
      'finance report', 'movement report', 'what did we spend', 'report for the accountant',
      'export to excel', 'csv', 'purchase orders donations and dispatches',
    ],
    body:
      'Purchase orders, donations and dispatches for a period, with totals and a trend ' +
      'chart. Pick the period at the top; Export PDF for the summary, and a list’s CSV or ' +
      'Excel for the lines.',
    related: ['finance-recipient'],
  },
  {
    id: 'volunteer-guest-log',
    title: 'The volunteer log',
    roles: ADMIN_ONLY,
    screens: ['volunteerLog'],
    asks: [
      'guest log', 'sign a volunteer out', 'they forgot to sign out', 'volunteer hours are zero',
      'who was on site', 'delete a sign in',
    ],
    body:
      'Every sign-in at the door. Sign out a visit that was left open — hours only count ' +
      'once a visit is closed. There is no delete: it is a record of who was on site.',
    related: ['volunteer-log', 'guest-sign-in'],
  },
];

export const TOPIC_IDS = TOPICS.map((t) => t.id);

// ── Lookups used by the tool schema and the service ──────────
const byId = new Map(TOPICS.map((t) => [t.id, t]));
const screenById = new Map(SCREENS.map((s) => [s.id, s]));

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

const MAX_OPEN_LINKS = 2;

/**
 * What crosses the wire. `asks` and `rules` stay on the server.
 *
 * With a role, the links are narrowed to what that role may follow:
 * a related topic they could not open is a chip that answers 404,
 * and a screen they could not open is a locked door. `open` is the
 * topic's own screens as "go there" links — home is left out, since
 * a link to where you started is not somewhere to go.
 */
export const publicTopic = (topic, role) => {
  const allowed = (t) => !role || t.roles.includes(role);
  return {
    id:      topic.id,
    title:   topic.title,
    body:    topic.body,
    steps:   topic.steps ?? null,
    screens: topic.screens ?? [],
    open: (topic.screens ?? [])
      .filter((id) => id !== 'home')
      .map((id) => screenById.get(id))
      .filter((s) => s && allowed(s))
      .slice(0, MAX_OPEN_LINKS)
      .map((s) => ({ id: s.id, label: s.label })),
    related: (topic.related ?? [])
      .map((id) => byId.get(id))
      .filter((t) => t && allowed(t))
      .map((t) => ({ id: t.id, title: t.title })),
  };
};

/** What a navigate answer carries: the screen and what it is for. */
export const publicScreen = (screen) => ({
  id: screen.id, label: screen.label, about: screen.about ?? null,
});

export default {
  SCREENS, SCREEN_IDS, TOPICS, TOPIC_IDS,
  getTopic, topicsForRole, screensForRole, screenForRole,
  suggestionsFor, publicTopic, publicScreen,
};
