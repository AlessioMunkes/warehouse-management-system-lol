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
//   • CLEAR BEFORE SHORT. Say what the thing is, then what to do,
//     using the button and field names exactly as the screen shows
//     them. Aim for 40–80 words; anything that is a sequence goes in
//     `steps`. If it needs much more, it is two topics.
//   • Plain language, no jargon (ACC-09). Say what to DO.
//   • `followUp` ends every answer with one question that offers the
//     natural next thing, as a topic id. The panel shows it with a
//     "Yes, show me" button. MY_ROLE means "this person's own role
//     summary". Check a follow-up by asking: would someone who just
//     read this answer plausibly want that next?
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

// A follow-up that points at whichever my-role-* topic fits the asker.
const MY_ROLE = 'my-role';
const MY_ROLE_TOPIC = { [WORKER]: 'my-role-worker', [MANAGER]: 'my-role-manager', [ADMIN]: 'my-role-admin' };
const MANAGERS_UP = [MANAGER, ADMIN];
const WORKERS_ONLY = [WORKER];
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

  // The warehouse floor: warehouse staff only (WORKERS_ONLY in
  // client/src/routes/routeTable.js). Managers and admins never open
  // a floor screen.
  { id: 'receiving', label: 'Receiving', roles: WORKERS_ONLY,
    about: 'Book in a delivery against its purchase order: count, weigh, place, date.',
    aka: ['procurement', 'goods in', 'book in stock', 'unloading'] },
  { id: 'deliveries', label: 'Past deliveries', roles: WORKERS_ONLY,
    about: 'Every delivery already received, with its delivery note.',
    aka: ['delivery history', 'old deliveries', 'delivery notes'] },
  { id: 'decanting', label: 'Decanting', roles: WORKERS_ONLY,
    about: 'Split bulk sacks into bags and record what you actually got, plus wastage.',
    aka: ['bagging', 'repacking', 'splitting sacks', 'decanting sheet'] },
  { id: 'decantingRecords', label: 'Past decanting runs', roles: WORKERS_ONLY,
    about: 'Every past decanting run with expected and actual bags.',
    aka: ['decanting sheets', 'decanting history'] },
  { id: 'packing', label: 'Packing', roles: WORKERS_ONLY,
    about: 'The packing board: claim a picking slip and pack its pallet.',
    aka: ['packing board', 'pallets', 'pack an order'] },
  { id: 'dispatch', label: 'The dispatch gate', roles: WORKERS_ONLY,
    about: 'Hand pallets over to collecting centres, with the driver signing on screen.',
    aka: ['dispatch', 'gate', 'collections', 'hand over'] },
  { id: 'dispatchHistory', label: 'Collection history', roles: WORKERS_ONLY,
    about: 'Every past collection with its signature, and every missed one.',
    aka: ['dispatch history', 'past collections', 'dispatch notes'] },
  { id: 'donation', label: 'Donation intake', roles: WORKERS_ONLY,
    about: 'Log food someone has donated: what, rough value, who brought it.',
    aka: ['donations', 'log a donation', 'new donation'] },
  { id: 'communityRequests', label: 'Benevolent requests', roles: EVERYONE,
    about: 'Log phoned-in or walk-in requests for a food parcel, and what happened.',
    aka: ['community requests', 'call-in requests', 'benevolent packages', 'food parcel requests'] },
  { id: 'feedTheSoil', label: 'Feed the Soil', roles: EVERYONE,
    about: 'Compost collection kits: assign a kit to a household, log compost weighed in, mark it sent to a farm.',
    aka: ['compost', 'collection kits', 'food waste', 'compost kits', 'soil'] },

  // Manager and admin.
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
  { id: 'operatingCalendar', label: 'Operating calendar', roles: MANAGERS_UP,
    about: 'Which weekday each cohort collects, and the public holidays and closures when the warehouse is shut.',
    aka: ['calendar', 'public holidays', 'closures', 'closed days', 'collection days', 'holidays'] },
  { id: 'receipts', label: 'Receipts', roles: MANAGERS_UP,
    about: 'The archive of delivery notes and dispatch notes.',
    aka: ['paperwork', 'notes archive', 'documents'] },
  { id: 'reporting', label: 'Operations reports', roles: MANAGERS_UP,
    about: 'Ask a question about the figures, or browse reports by area; Generate report explains the chart, gives the business view and lists the actions.',
    aka: ['reporting', 'reports', 'analytics', 'operations analytics', 'statistics'] },
  { id: 'impactReport', label: 'Impact reports', roles: MANAGERS_UP,
    about: 'The Impact Calculator: meals, children and adults served, compost processed, poster PDF.',
    aka: ['impact calculator', 'impact report', 'donor report', 'meals served'] },
  { id: 'volunteers', label: 'Volunteer events', roles: MANAGERS_UP,
    about: 'Set up volunteer events and time slots, and see who signed in to each.',
    aka: ['volunteer events', 'volunteer sessions', 'corporate groups'] },

  // Admin only.
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
  { id: 'activity', label: 'User activity', roles: ADMIN_ONLY,
    about: 'Everything people did in the system, newest first, by person, area and date.',
    aka: ['activity log', 'audit log', 'who did what', 'user activity'] },
  { id: 'archive', label: 'Archive', roles: ADMIN_ONLY,
    about: 'Everything deactivated or deleted, with Restore for what can come back.',
    aka: ['archive', 'deleted items', 'deactivated', 'restore'] },
  { id: 'messageHistory', label: 'Message history', roles: ADMIN_ONLY,
    about: 'Every email the system has sent, and whether it went out.',
    aka: ['message history', 'sent emails', 'email log', 'outbox'] },
  { id: 'settings', label: 'Settings', roles: ADMIN_ONLY,
    about: 'How the system is set up: email, reminders, stock rules, reporting, certificates, accounts.',
    aka: ['settings', 'configuration', 'set up', 'preferences'] },
];

export const SCREEN_IDS = SCREENS.map((s) => s.id);

/** The screens this role may be sent to. The navigation gate. */
export const screensForRole = (role) => SCREENS.filter((s) => s.roles.includes(role));

// ── Topics ───────────────────────────────────────────────────
export const TOPICS = [
  // ═══ What YOU can do — one per role ═══════════════════════
  // "What can I do" is about the person's job, not about the
  // assistant, so each role gets its own answer. Same asks on all
  // three; `roles` means only the right one is ever offered.
  {
    id: 'my-role-worker',
    title: 'What you can do as warehouse staff',
    roles: [WORKER],
    screens: ['home', 'receiving', 'packing'],
    asks: [
      'what can I do', 'what am I allowed to do', 'what is my job', 'what do I do here',
      'what are my tasks', 'what can I do in the system', 'where do I start', 'I am new',
    ],
    body:
      'You do the hands-on work on the warehouse floor. Each job has its own screen —' +
      ' open it from your dashboard, or from the icons along the bottom on a phone.',
    steps: [
      'Receiving — check a delivery in against its order.',
      'Decanting — split bulk sacks into bags and record any wastage.',
      'Packing — claim a picking slip and pack its pallet.',
      'Dispatch — hand a pallet to a centre’s driver, who signs for it.',
      'Also: donation intake, benevolent requests and Feed the Soil.',
    ],
    followUp: {
      question: 'Would you like to know how to record a delivery when the truck arrives?',
      topic: 'receiving-record',
    },
    related: ['fifo-fefo', 'working-offline', 'something-looks-wrong'],
  },
  {
    id: 'my-role-manager',
    title: 'What you can do as a manager',
    roles: [MANAGER],
    screens: ['home', 'inventory', 'purchaseOrders'],
    asks: [
      'what can I do', 'what am I allowed to do', 'what is my job', 'what do I do here',
      'what are my tasks', 'what can I do in the system', 'where do I start', 'I am new',
    ],
    body:
      'You run the operation; the floor screens — receiving, packing, decanting, the ' +
      'gate — are the warehouse staff’s, and you follow that work from here. The bell at ' +
      'the top tells you what needs you — low stock, missed collections and flagged ' +
      'deliveries.',
    steps: [
      'Stock — inventory levels, the stock ledger and stock adjustments.',
      'Buying — raise purchase orders; each one is emailed to Finance.',
      'Centres — beneficiaries, this week’s picking slips and collection reminders.',
      'Insight — operations reports and impact reports.',
      'People — volunteer events.',
    ],
    followUp: {
      question: 'Would you like to know how to generate this week’s picking slips?',
      topic: 'picking-slip-generate',
    },
    related: ['inventory-low-stock', 'picking-slip-generate', 'reporting-ask'],
  },
  {
    id: 'my-role-admin',
    title: 'What you can do as an admin',
    roles: [ADMIN],
    screens: ['home', 'users', 'products'],
    asks: [
      'what can I do', 'what am I allowed to do', 'what is my job', 'what do I do here',
      'what are my tasks', 'what can I do in the system', 'where do I start', 'I am new',
    ],
    body:
      'You look after the information the rest of the system is built on, and you ' +
      'can open every manager screen too. The floor screens are the warehouse ' +
      'staff’s. Changes here reach every screen, so it is worth going carefully.',
    steps: [
      'Accounts — invite staff and set their roles.',
      'Catalogue — products and suppliers.',
      'Donations — the classification queue and Section 18A certificates.',
      'Logs — user activity, the archive, message history and the volunteer log.',
      'Settings — email, reminders, stock rules, reporting and certificates; and the finance report.',
    ],
    followUp: {
      question: 'Would you like to know how to set up a new user?',
      topic: 'users-and-accounts',
    },
    related: ['users-and-accounts', 'archive-not-delete', 'finance-recipient'],
  },

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
      'are you an ai', 'can you help', 'what can you help with',
    ],
    body:
      'I explain how to do things in this system, step by step, and I can open a ' +
      'screen for you — just say "take me to inventory".\n\n' +
      'Ask in your own words, like "the truck is here" or "the driver won’t sign". I ' +
      'only know this warehouse system, and I will tell you when I don’t have an ' +
      'answer.',
    followUp: {
      question: 'Would you like to see what you can do in your role?',
      topic: MY_ROLE,
    },
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
      'Tell me where you want to go — "take me to inventory", "open purchase orders",' +
      ' "go to the dispatch gate" — and I will open it straight away.\n\n' +
      'I only open screens your role can use. If a screen belongs to another role, I ' +
      'will say so rather than send you somewhere that won’t open.',
    followUp: {
      question: 'Would you like to know which screens each role can use?',
      topic: 'who-can-do-what',
    },
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
      'This system follows food through the warehouse: bought or donated, received, ' +
      'decanted into bags, packed onto pallets and collected by the centres we feed. ' +
      'It replaces the paper sheets, spreadsheets and notes that used to hold this.\n\n' +
      'It also records donations, food parcel requests, Feed the Soil compost and ' +
      'volunteers.',
    followUp: {
      question: 'Would you like to know what you can do in your role?',
      topic: MY_ROLE,
    },
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
      'On a computer, the menu on the left lists every screen you can open. On a ' +
      'phone, tap the menu button at the top left, and use the icons along the bottom' +
      ' for your main jobs.\n\n' +
      'Or just ask me — "take me to receiving" — and I will open it for you.',
    followUp: {
      question: 'Would you like me to explain how to ask me to open a screen?',
      topic: 'assistant-take-me-there',
    },
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
      'Each account has a role, and the role decides which screens you see. A screen ' +
      'that won’t open isn’t broken — it belongs to another role, and it sends you ' +
      'back to your own home screen.',
    steps: [
      'Warehouse staff — the floor: receiving, decanting, packing, dispatch, donations, requests, Feed the Soil.',
      'Managers — the office: stock, orders, centres, picking slips, reminders, volunteers and reports. They follow the floor’s work from their own screens rather than opening the floor’s.',
      'Admins — every manager screen, plus users, products, suppliers, logs and settings.',
      'Guests — volunteers signed in for one event.',
    ],
    followUp: {
      question: 'Would you like to know what you can do in your own role?',
      topic: MY_ROLE,
    },
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
      'If your account works at more than one warehouse, the warehouse name shows in ' +
      'the top bar next to the bell. Tap it to switch — you land on that warehouse’s ' +
      'home screen, and your role there may be different.\n\n' +
      'Check it before recording a delivery: stock booked into the wrong warehouse is' +
      ' hard to spot later. No name showing means your account has only one ' +
      'warehouse.',
    followUp: {
      question: 'Would you like to know how to record a delivery?',
      topic: 'receiving-record',
      otherwise: { question: 'Would you like to know how to read the inventory screen?', topic: 'inventory-columns' },
    },
    related: ['who-can-do-what', 'find-my-way'],
  },
  {
    id: 'signing-in',
    title: 'Signing in',
    roles: EVERYONE,
    screens: ['home'],
    asks: [
      'how do I log in', 'I forgot my password', 'it logged me out', 'sign in problem', 'cannot log in',
      'reset my password', 'change my password', 'password reset email',
    ],
    body:
      'Sign in with your username and the password you chose when you accepted your ' +
      'invite. Nobody can look your password up — if you forget it, choose Forgot ' +
      'password? on the sign-in page and enter your email for a reset link.\n\n' +
      'If you are signed out in the middle of a task, just sign back in. Work that ' +
      'was saved is still there.',
    followUp: {
      question: 'Would you like to know how to carry on with work you had started?',
      topic: 'unfinished-work',
      otherwise: { question: 'Would you like to know how to sign out safely on a shared device?', topic: 'signing-out' },
    },
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
      'Log out with the button at the right of the top bar. Always do this before ' +
      'handing a shared tablet to someone else — anything recorded afterwards would ' +
      'go down under your name.',
    followUp: {
      question: 'Would you like to know how signing in works?',
      topic: 'signing-in',
    },
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
      'The bell in the top bar collects things that need someone’s attention — a ' +
      'delivery that didn’t match its order, a centre that didn’t collect, stock ' +
      'running low. The red number is how many you haven’t read yet.\n\n' +
      'Tap a notification to go straight to the thing it is about. It only ever ' +
      'opens one of your own screens; if the thing belongs to another role, it is ' +
      'there to let you know rather than to open.',
    followUp: {
      question: 'Would you like to know what to do when something looks wrong?',
      topic: 'something-looks-wrong',
    },
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
      'The eye button in the top bar turns off the sliding and fading movement on ' +
      'screens. For bigger text, use your browser zoom (Ctrl and +) or your phone’s ' +
      'text size setting — the screens rearrange themselves rather than break.',
    followUp: {
      question: 'Would you like to know how to find your way around the screens?',
      topic: 'find-my-way',
    },
    rules: ['ACC-04', 'ACC-08', 'NFR-04'],
  },
  {
    id: 'working-offline',
    title: 'When the signal drops',
    roles: WORKERS_ONLY,
    screens: ['dispatch', 'receiving', 'decanting', 'packing'],
    general: true,
    asks: [
      'no signal', 'it says offline', 'wifi is down', 'no internet', 'will I lose my work',
      'does it work without signal', 'connection lost',
    ],
    body:
      'Keep working. What you record is saved on the device and sent automatically ' +
      'when the signal comes back — the bar at the top shows when it has gone ' +
      'through.\n\n' +
      'The one thing to avoid: don’t close the app or clear the browser while it ' +
      'still says work is waiting to send.',
    followUp: {
      question: 'Would you like to know how to pick up a task you had to leave half-way?',
      topic: 'unfinished-work',
    },
    rules: ['NFR-10', 'NFR-17'],
    related: ['unfinished-work'],
  },
  {
    id: 'unfinished-work',
    title: 'Picking up where you stopped',
    roles: WORKERS_ONLY,
    screens: ['receiving', 'decanting', 'dispatch', 'packing'],
    general: true,
    asks: [
      'I lost my work', 'my tablet died', 'carry on from before', 'where did my counting go',
      'resume', 'start again',
    ],
    body:
      'The system saves as you go. Next time you open the same job, it offers you the' +
      ' half-finished task back. You can carry on where you stopped, or throw it away' +
      ' and start again.',
    followUp: {
      question: 'Would you like to know what happens if the signal drops while you work?',
      topic: 'working-offline',
    },
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
      'Straight after you save something, a message appears at the bottom of the ' +
      'screen with an Undo button. Tap it to take the change back.\n\n' +
      'If that message has already gone, tell your manager. Don’t enter an opposite ' +
      'number to cancel the mistake out — that hides it instead of fixing it.',
    followUp: {
      question: 'Would you like to know what to do if a figure looks wrong?',
      topic: 'something-looks-wrong',
    },
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
      'Tell the warehouse manager, and say which screen you were on and what you ' +
      'expected to see.\n\n' +
      'Don’t work around it by entering something you know isn’t true. A wrong figure' +
      ' somebody mentioned is easy to find; one nobody flagged can take weeks to ' +
      'trace.',
    followUp: {
      question: 'Would you like to know how to undo something you entered by mistake?',
      topic: 'undo-a-mistake',
    },
    related: ['undo-a-mistake', 'stock-adjustment'],
  },

  // ═══ Receiving ════════════════════════════════════════════
  {
    id: 'receiving-record',
    title: 'Recording a delivery',
    roles: WORKERS_ONLY,
    screens: ['receiving'],
    asks: [
      'a truck arrived', 'how do I receive stock', 'goods came in', 'delivery arrived',
      'book in a delivery', 'the driver is here', 'stock came in', 'receive goods',
    ],
    body:
      'Receiving checks what arrived against the purchase order, so you are ticking ' +
      'off a list rather than writing one.',
    steps: [
      'Open Receiving, choose the supplier, then the order (its number is on the driver’s note).',
      'Count each line and enter what actually arrived — or tap Everything as ordered if it all matches.',
      'Tick each line, and choose where it is going: cold room or dry store.',
      'For fresh food, enter the use-by date.',
      'Get the driver’s signature, then finish. Stock goes up straight away.',
    ],
    followUp: {
      question: 'Would you like to know what to do if the count doesn’t match the order?',
      topic: 'receiving-discrepancy',
    },
    rules: ['BR-05', 'BR-07', 'BR-08'],
    related: ['receiving-discrepancy', 'receiving-partial', 'receiving-expiry'],
  },
  {
    id: 'receiving-discrepancy',
    title: 'The count does not match',
    roles: WORKERS_ONLY,
    screens: ['receiving'],
    asks: [
      'short delivery', 'wrong quantity', 'less than ordered', 'more than expected',
      'numbers do not match', 'damaged goods', 'discrepancy', 'they sent the wrong thing',
    ],
    body:
      'Enter the number that actually arrived, not the number on the order, and add a' +
      ' short reason (for example "crate damaged"). The system flags the difference ' +
      'to the warehouse manager.\n\n' +
      'Never change the count to make it match — the difference is exactly what the ' +
      'manager and the supplier need to see.',
    followUp: {
      question: 'Would you like to know what happens when only part of the order comes?',
      topic: 'receiving-partial',
    },
    rules: ['BR-08'],
    related: ['receiving-record', 'something-looks-wrong'],
  },
  {
    id: 'receiving-partial',
    title: 'Only part of the order came',
    roles: WORKERS_ONLY,
    screens: ['receiving'],
    asks: [
      'only part of the order came', 'rest is coming later', 'second delivery',
      'split delivery', 'partial delivery', 'half the order',
    ],
    body:
      'That’s normal. Receive what is in front of you today. The order stays open for' +
      ' the rest, and when the next load comes you receive it against the same order.',
    followUp: {
      question: 'Would you like to know how to record a delivery step by step?',
      topic: 'receiving-record',
    },
    rules: ['BR-07A'],
    related: ['receiving-record', 'po-status'],
  },
  {
    id: 'receiving-expiry',
    title: 'Dates and storage',
    roles: WORKERS_ONLY,
    screens: ['receiving'],
    asks: [
      'expiry date', 'sell by date', 'cold room or dry store', 'where do I put it',
      'storage location', 'fresh produce', 'does it need a date',
    ],
    body:
      'Every line needs a storage place — cold room or dry store — before you can ' +
      'finish. Fresh food also needs its use-by date.\n\n' +
      'These two answers are what tell packing which stock to use first, so if you ' +
      'are unsure, ask rather than guess.',
    followUp: {
      question: 'Would you like to know why the oldest stock goes out first?',
      topic: 'fifo-fefo',
    },
    rules: ['BR-06', 'BR-07'],
    related: ['receiving-record', 'fifo-fefo'],
  },
  {
    id: 'receiving-no-order',
    title: 'Goods with no order',
    roles: WORKERS_ONLY,
    screens: ['receiving', 'donation'],
    asks: [
      'there is no order for this', 'nothing to receive against', 'no purchase order',
      'it is not on the list', 'unexpected delivery',
    ],
    body:
      'If nobody bought it, it is a donation — record it in Donation intake instead.\n\n' +
      'If it was bought but you can’t find the order, call the warehouse manager ' +
      'before unloading. Don’t record it against a different order.',
    followUp: {
      question: 'Would you like to know how to record a donation?',
      topic: 'donation-intake',
    },
    related: ['donation-intake', 'receiving-record'],
  },
  {
    id: 'deliveries-past',
    title: 'Looking up an old delivery',
    roles: WORKERS_ONLY,
    screens: ['deliveries', 'receipts'],
    asks: [
      'past deliveries', 'what came in last week', 'old delivery note', 'find a delivery',
      'delivery history', 'what did we receive',
    ],
    body:
      'Open Receiving and choose Past deliveries on the first screen. It lists ' +
      'everything that has come in — when, from which supplier and against which ' +
      'order — and you can open the delivery note for any of them.',
    followUp: {
      question: 'Would you like to know what the delivery note shows?',
      topic: 'delivery-note',
    },
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
      'Open the delivery — from Past deliveries on Receiving, or the Goods in tab of ' +
      'Receipts. The note shows what was ordered, what actually arrived and the ' +
      'difference, with the driver’s signature — so a short delivery shows on the ' +
      'paperwork, not only in the system. You can view it as a PDF or print it.',
    followUp: {
      question: 'Would you like to know how to find an older delivery?',
      topic: 'deliveries-past',
      otherwise: { question: 'Would you like to know how to find notes on Receipts?', topic: 'receipts-screen' },
    },
    rules: ['BR-08', 'BR-17'],
    related: ['deliveries-past', 'receiving-discrepancy'],
  },

  // ═══ Donations ════════════════════════════════════════════
  {
    id: 'donation-intake',
    title: 'Taking in a donation',
    roles: WORKERS_ONLY,
    screens: ['donation'],
    asks: [
      'someone donated food', 'how do I log a donation', 'record a donation',
      'a member of the public brought', 'donation came in', 'someone dropped off',
    ],
    body:
      'Record a donation while the donor is still there, not from memory afterwards. ' +
      'It takes about a minute.',
    steps: [
      'Open Donation intake and choose what kind of donation it is.',
      'Add each item with its quantity and unit.',
      'Enter a rough value in rand (0 if you really can’t say) and the programme.',
      'Say whether the donor wants a Section 18A tax certificate — if so, take their name and email.',
      'Check the summary and submit.',
    ],
    followUp: {
      question: 'Would you like to know why a donation needs a value?',
      topic: 'donation-18a',
    },
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
      'A Section 18A certificate lets a donor claim their donation against tax. SARS ' +
      'needs a value and a proper record for that — no value means no certificate, ' +
      'and the donor loses the claim.\n\n' +
      'A rough estimate is fine at the gate; an admin checks and corrects values ' +
      'later.',
    followUp: {
      question: 'Would you like to know what donor details you need to take?',
      topic: 'donation-donor-details',
      otherwise: { question: 'Would you like to see how donations and Section 18A progress show in the reports?', topic: 'reporting-insights' },
    },
    rules: ['BR-09', 'NFR-16'],
    related: ['donation-intake', 'section18a-certificates'],
  },
  {
    id: 'donation-what-we-take',
    title: 'What we can accept',
    roles: WORKERS_ONLY,
    screens: ['donation'],
    asks: [
      'can we accept this', 'is this ok to take', 'expired donation', 'opened packet',
      'should I take it', 'what can we accept',
    ],
    body:
      'Don’t accept anything expired, opened or damaged — it can’t go out to a ' +
      'centre, so taking it just moves the problem indoors.\n\n' +
      'If you’re not sure, record it and flag it for the manager rather than turning ' +
      'someone away at the gate.',
    followUp: {
      question: 'Would you like to know how to record a donation?',
      topic: 'donation-intake',
    },
    rules: ['BR-15'],
    related: ['donation-intake', 'packing-shortage'],
  },
  {
    id: 'donation-donor-details',
    title: 'Donor details',
    roles: WORKERS_ONLY,
    screens: ['donation'],
    asks: [
      'do I need their name', 'donor details', 'anonymous donation', 'personal information',
      'do we have to ask', 'privacy',
    ],
    body:
      'You only need the donor’s name and email if they want a Section 18A tax ' +
      'certificate. Anonymous donations are fine — record them without any details.\n\n' +
      'Don’t write down more than the donor offers.',
    followUp: {
      question: 'Would you like to know what the Section 18A certificate is for?',
      topic: 'donation-18a',
    },
    rules: ['BR-09'],
    related: ['donation-18a'],
  },

  // ═══ Decanting ════════════════════════════════════════════
  {
    id: 'decanting-record',
    title: 'Recording a decanting run',
    roles: WORKERS_ONLY,
    screens: ['decanting'],
    asks: [
      'how do I record decanting', 'splitting bags', 'decanting sheet', 'we split a sack',
      'bagging up', 'repacking',
    ],
    body:
      'Decanting replaces the paper sheet. The system works out how many bags a sack ' +
      'should give; you record what you actually got.',
    steps: [
      'Open Decanting and pick the sack in front of you.',
      'Weigh it and enter the weight on the scale.',
      'Fill the number of bags it tells you to.',
      'Enter what you actually got — or tap Exactly as planned.',
      'Save. The bags go into stock, and any waste goes on this week’s report.',
    ],
    followUp: {
      question: 'Would you like to know how to record wastage?',
      topic: 'decanting-wastage',
    },
    rules: ['BR-06'],
    related: ['decanting-wastage', 'decanting-records'],
  },
  {
    id: 'decanting-wastage',
    title: 'Recording wastage',
    roles: WORKERS_ONLY,
    screens: ['decanting'],
    asks: [
      'we lost some', 'spoiled', 'spilled', 'wastage', 'fewer bags than expected',
      'will I get in trouble', 'short on bags',
    ],
    body:
      'Record the real number of bags you filled; the difference is counted as ' +
      'wastage automatically.\n\n' +
      'You won’t get in trouble for it. Wastage counts against the sack and the ' +
      'supplier, not against you — and it is how a supplier whose sacks keep coming ' +
      'in light gets noticed.',
    followUp: {
      question: 'Would you like to know where to find past decanting runs?',
      topic: 'decanting-records',
    },
    related: ['decanting-record'],
  },
  {
    id: 'decanting-records',
    title: 'Past decanting runs',
    roles: WORKERS_ONLY,
    screens: ['decantingRecords'],
    asks: [
      'past decanting', 'old decanting sheet', 'what did we decant', 'decanting history',
    ],
    body:
      'Open Decanting and choose the records link at the top of the screen. It lists ' +
      'every past run with how many bags were expected, how many were actually ' +
      'filled, and what was wasted.',
    followUp: {
      question: 'Would you like to know how to record a new decanting run?',
      topic: 'decanting-record',
    },
    related: ['decanting-record'],
  },

  // ═══ Packing ══════════════════════════════════════════════
  {
    id: 'packing-pallet',
    title: 'Packing a pallet',
    roles: WORKERS_ONLY,
    screens: ['packing'],
    asks: ['how do I pack', 'what goes on this pallet', 'packing a slip', 'pack an order', 'make up a pallet'],
    body:
      'Each pallet is packed from a picking slip, which lists exactly what that ' +
      'centre gets. Pack to the slip — don’t add or leave out items.',
    steps: [
      'Open Packing and choose a pallet, then Claim this pallet (or open one already assigned to you).',
      'Pack each line, taking the oldest stock first.',
      'Tap Confirm on each line as it goes on the pallet.',
      'If you can’t pack the full amount, tap Flag and enter what you actually packed.',
      'Tap Log pallet packed. It is ready for the gate.',
    ],
    followUp: {
      question: 'Would you like to know which stock to take first?',
      topic: 'fifo-fefo',
    },
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
      'Take the stock that expires soonest first. If nothing has a date, take what ' +
      'arrived first.\n\n' +
      'Grabbing from the front because it’s easier leaves older stock at the back ' +
      'until it’s no good to anyone.',
    followUp: {
      question: 'Would you like to know what to do if there isn’t enough stock to finish a pallet?',
      topic: 'packing-shortage',
      otherwise: { question: 'Would you like to know what to do with stock that has gone off?', topic: 'expired-stock' },
    },
    rules: ['BR-06'],
    related: ['packing-pallet', 'receiving-expiry'],
  },
  {
    id: 'packing-shortage',
    title: 'You cannot finish a pallet',
    roles: WORKERS_ONLY,
    screens: ['packing'],
    asks: [
      'not enough stock', 'item is expired', 'damaged item', 'short on the pallet',
      'cannot complete the pallet', 'something is missing', 'ran out',
    ],
    body:
      'Never pack expired or damaged food to make a pallet look complete — there is a' +
      ' family at the other end.\n\n' +
      'Tap Flag on the line and enter the quantity you actually packed. The manager ' +
      'sees it and decides whether to top it up, send it short or hold it.',
    followUp: {
      question: 'Would you like to know what to do if something else looks wrong?',
      topic: 'something-looks-wrong',
    },
    rules: ['BR-15'],
    related: ['packing-pallet', 'something-looks-wrong'],
  },
  {
    id: 'packing-claim',
    title: 'Taking a slip off the board',
    roles: WORKERS_ONLY,
    screens: ['packing'],
    asks: [
      'how do I claim a slip', 'whose pallet is this', 'someone else is on it',
      'take a job', 'assign to me', 'packing board',
    ],
    body:
      'Claiming a slip marks it as yours, so two people don’t pack the same pallet. ' +
      'Open a pallet on the packing board and tap Claim this pallet.\n\n' +
      'A manager can also assign a slip to you — it is already yours when you open ' +
      'the board. If a slip can’t be claimed, the screen tells you why (for example, ' +
      'someone else has it).',
    followUp: {
      question: 'Would you like to know how to pack the pallet once you have claimed it?',
      topic: 'packing-pallet',
    },
    related: ['packing-pallet', 'picking-slip-assign'],
  },

  // ═══ Dispatch ═════════════════════════════════════════════
  {
    id: 'dispatch-collection',
    title: 'A collection at the gate',
    roles: WORKERS_ONLY,
    screens: ['dispatch'],
    asks: [
      'a driver is here', 'someone came to collect', 'how do I dispatch',
      'handing over a pallet', 'collection', 'they are here for their food',
    ],
    body:
      'When a centre’s driver arrives, you check their pallet against the slip ' +
      'together, and the driver signs for it on screen. Stock comes off when you ' +
      'complete it.',
    steps: [
      'Open the dispatch gate and choose the centre from the queue.',
      'Tap Start the collection.',
      'Count each line onto the vehicle — or tap Everything as packed.',
      'Tick each line, then take the driver’s name and signature.',
      'Complete the collection.',
    ],
    followUp: {
      question: 'Would you like to know what to do if the driver won’t sign?',
      topic: 'dispatch-signature',
    },
    rules: ['BR-06', 'BR-11', 'BR-13'],
    related: ['dispatch-signature', 'dispatch-non-collection', 'working-offline'],
  },
  {
    id: 'dispatch-signature',
    title: 'The driver has to sign',
    roles: WORKERS_ONLY,
    screens: ['dispatch'],
    asks: [
      'do they have to sign', 'can I skip the signature', 'driver will not sign',
      'proof of delivery', 'signature', 'they refuse to sign',
    ],
    body:
      'The signature replaces the old paper collection book, and you can’t complete a' +
      ' collection without it.\n\n' +
      'If a driver won’t or can’t sign, don’t complete the collection — call the ' +
      'warehouse manager. An unsigned pallet leaves no proof of who took it.',
    followUp: {
      question: 'Would you like to know how to find a past collection and its signature?',
      topic: 'dispatch-history',
    },
    rules: ['BR-13'],
    related: ['dispatch-collection'],
  },
  {
    id: 'dispatch-non-collection',
    title: 'A centre did not collect',
    roles: WORKERS_ONLY,
    screens: ['dispatch', 'dispatchHistory'],
    asks: [
      'they did not come', 'nobody collected', 'no show', 'missed collection', '16:00',
      'four o clock', 'non collection', 'still not here',
    ],
    body:
      'You don’t need to do anything. A pallet that hasn’t been collected by the ' +
      'cut-off (15:00 unless an admin has changed it) is marked as not collected ' +
      'automatically, and it goes on that centre’s record so a pattern shows up over ' +
      'time.\n\n' +
      'If the centre turns up later, the collection can still go ahead as a late ' +
      'collection.',
    followUp: {
      question: 'Would you like to know how to check a centre’s past collections?',
      topic: 'dispatch-history',
    },
    rules: ['BR-14', 'BR-26', 'BR-27'],
    related: ['dispatch-history', 'dispatch-collection'],
  },
  {
    id: 'dispatch-history',
    title: 'Who collected, and when',
    roles: WORKERS_ONLY,
    screens: ['dispatchHistory'],
    asks: [
      'collection history', 'did they collect', 'past collections', 'who came',
      'check a collection', 'dispatch history',
    ],
    body:
      'Open the dispatch gate and choose the history link at the top. It lists every ' +
      'past collection with the driver’s signature, and every pallet that wasn’t ' +
      'collected.',
    followUp: {
      question: 'Would you like to know what the dispatch note shows?',
      topic: 'dispatch-note',
    },
    rules: ['BR-26', 'BR-27'],
    related: ['dispatch-non-collection', 'dispatch-note'],
  },
  {
    id: 'dispatch-note',
    title: 'The dispatch note',
    roles: EVERYONE,
    screens: ['dispatchHistory', 'receipts'],
    asks: ['dispatch note', 'print the collection', 'proof they took it', 'collection paperwork'],
    body:
      'Open the collection — from the gate’s history, or the Goods out tab of ' +
      'Receipts. The note shows what went out, to which centre, what was loaded ' +
      'against what was packed, and the driver’s signature. You can view it as a PDF ' +
      'or print it.',
    followUp: {
      question: 'Would you like to know how to find other past collections?',
      topic: 'dispatch-history',
      otherwise: { question: 'Would you like to know how to see which centres didn’t collect?', topic: 'missed-collections-manager' },
    },
    rules: ['BR-13'],
    related: ['dispatch-history'],
  },
  {
    id: 'picking-slip-qr',
    title: 'The QR code on a slip',
    roles: EVERYONE,
    screens: ['dispatch', 'pickingSlips'],
    asks: ['qr code', 'scan the slip', 'what is the square code', 'barcode on the slip'],
    body:
      'The QR code on a pallet label opens that one slip on a phone, without signing ' +
      'in, so a driver or centre can see exactly what they are collecting. It shows ' +
      'only that slip — nothing else in the system.',
    followUp: {
      question: 'Would you like to know about the different kinds of slip?',
      topic: 'picking-slip-types',
    },
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
      'what is the red line on the row', 'why is a row orange', 'earliest expiry',
    ],
    body:
      'Each row is one product, with its stock code and category under the name. A ' +
      'red edge on a row means a shortfall or stock about to expire; amber means low ' +
      'or expiring within the month.',
    steps: [
      'On hand — what is physically in the building.',
      'Committed — already promised to picking slips that haven’t gone out.',
      'Available — on hand minus committed, in bold. This is the number to trust; red means more is promised than we have.',
      'Reorder at — the level below which the product counts as low.',
      'Earliest expiry — a countdown when it is within the month, otherwise the date.',
    ],
    followUp: {
      question: 'Would you like to know how to see one product in detail?',
      topic: 'inventory-item-summary',
    },
    related: ['inventory-item-summary', 'inventory-low-stock', 'list-screens'],
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
      'Click a product in Inventory and a panel opens on the right, without losing ' +
      'your place in the list. It shows the four figures, the balance over time with ' +
      'the reorder line on it, expiry by delivery (soonest first), recent movements, ' +
      'and the catalogue details. Adjust stock is at the foot of the panel.',
    followUp: {
      question: 'Would you like to know how to see every stock movement across the warehouse?',
      topic: 'stock-ledger',
    },
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
      'adjust several products', 'adjust stock button',
    ],
    body:
      'If the shelf doesn’t match the screen, count again first. If it’s still ' +
      'different, adjust it. Choose + Adjust stock at the top of Inventory and pick ' +
      'the product, or use Adjust stock in a product’s panel. Tick several rows and ' +
      'choose Adjust stock to go through them one after another.',
    steps: [
      'Choose Add to stock (+) or Remove from stock (-).',
      'Enter the amount.',
      'Pick a reason — Stock count correction, Damaged / spoiled, Expired, Spillage, Donation not captured at receiving, or Other with a note.',
      'Save. The system records who made it and when, and it shows on the stock ledger.',
    ],
    followUp: {
      question: 'Would you like to know how to find out why a figure changed in the first place?',
      topic: 'stock-ledger',
    },
    related: ['inventory-columns', 'undo-a-mistake', 'expired-stock'],
  },
  {
    id: 'inventory-low-stock',
    title: 'What counts as low',
    roles: MANAGERS_UP,
    screens: ['inventory'],
    asks: [
      'low stock', 'running out', 'what is low', 'reorder', 'shortfall', 'we need more',
      'what should I order', 'what is a shortfall',
    ],
    body:
      'A product is low when its available stock falls below its reorder level, and ' +
      'a shortfall when more is promised to picking slips than we have. Each has its ' +
      'own tab in Inventory, with the count beside it, and they are flagged on your ' +
      'dashboard and the bell.\n\n' +
      'Tick the products on the Low stock tab and choose Raise purchase order to ' +
      'start an order with them already on it.',
    followUp: {
      question: 'Would you like to know how to raise a purchase order?',
      topic: 'po-create',
    },
    related: ['po-create', 'po-from-inventory', 'product-fields'],
  },
  {
    id: 'stock-ledger',
    title: 'The stock ledger',
    roles: MANAGERS_UP,
    screens: ['stockLedger'],
    asks: [
      'stock ledger', 'every movement', 'where did the stock go', 'audit stock',
      'why did the number change', 'stock movements', 'reconciliation',
    ],
    body:
      'The stock ledger lists every movement in and out — receipts, donations, ' +
      'decanting, dispatches, wastage and adjustments — with who did it and when. ' +
      'Tabs split it by kind, and the line above the table totals what is in view.\n\n' +
      'Narrow it by period, product or who recorded it. The Reconciliation tab shows ' +
      'any product whose balance no longer adds up from its movements.',
    followUp: {
      question: 'Would you like to know how to correct a figure that is wrong?',
      topic: 'stock-adjustment',
    },
    related: ['inventory-item-summary', 'stock-adjustment', 'decanting-manager'],
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
      'Remove it with a stock adjustment: choose Remove from stock (-) and the reason ' +
      'Expired. It has to come off the figures — otherwise the next picking slip ' +
      'promises food that can’t be sent.\n\n' +
      'The Expiring in 30 days tab in Inventory shows what is close, so it can go out ' +
      'first instead.',
    followUp: {
      question: 'Would you like to know how to make a stock adjustment?',
      topic: 'stock-adjustment',
    },
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
    body:
      'A purchase order tells a supplier what to deliver, and gives Receiving the ' +
      'list to check against.',
    steps: [
      'Open Purchase Orders and choose + New purchase order.',
      'Pick the supplier and the expected delivery date.',
      'Add a line per product and set the quantity — or choose Add low-stock items to start with everything that is low.',
      'Check the estimated total and save. It waits under Awaiting approval until a manager approves it.',
    ],
    followUp: {
      question: 'Would you like to know how approving an order works?',
      topic: 'po-approve',
    },
    related: ['po-line-numbers', 'po-status', 'po-from-inventory'],
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
      'Quantity, weight and cost on an order line are linked through the product’s ' +
      'recorded weight and price — change one and the others update to match.\n\n' +
      'If a product has no weight or price recorded, that box is left empty rather ' +
      'than filled with a misleading zero.',
    followUp: {
      question: 'Would you like to know how an order’s status works?',
      topic: 'po-status',
    },
    related: ['po-create', 'product-fields'],
  },
  {
    id: 'po-status',
    title: 'What an order’s status means',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders'],
    asks: [
      'what does returned mean', 'follow up required', 'order status', 'open order',
      'who can change the status', 'close an order', 'is the order done', 'in transit',
      'partially received', 'pending approval',
    ],
    body:
      'Pending approval — raised, not signed off. Approved — ready to send to the ' +
      'supplier. In transit — on its way. Partially received — some of it has come. ' +
      'Completed — everything arrived. Returned and Follow-up required are for when ' +
      'the supplier got it wrong.\n\n' +
      'Deliveries move an order along by themselves; the tabs Open, Awaiting approval,' +
      ' In transit and Follow-up required show where each one is.',
    followUp: {
      question: 'Would you like to know how to record a follow-up with the supplier?',
      topic: 'po-follow-up',
    },
    rules: ['BR-07B'],
    related: ['po-follow-up', 'po-create', 'deliveries-manager'],
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
      'Every new purchase order is emailed to Finance automatically, with its lines ' +
      'and total, so they can capture it in QuickBooks. You don’t need to send it ' +
      'yourself.\n\n' +
      'If Finance says it never arrived, ask an admin to check the Finance recipient ' +
      'in Email settings.',
    followUp: {
      question: 'Would you like to know how to raise a purchase order?',
      topic: 'po-create',
    },
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
    body:
      'Receipts holds every delivery note (Goods in) and dispatch note (Goods out). ' +
      'Search, narrow by status, supplier or centre and dates, and click a row to ' +
      'open its note. It’s where to look when someone asks what came in or went out ' +
      'on a particular day.',
    followUp: {
      question: 'Would you like to know what a delivery note shows?',
      topic: 'delivery-note',
    },
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
      'A picking slip tells packing exactly what one centre gets. You don’t type the ' +
      'items in — each slip is filled from that centre’s standard order.\n\n' +
      'Open Picking Slips and choose one of two options:',
    steps: [
      'Generate this week’s slips — one slip for every approved, active centre in a cohort (Tuesday or Thursday), for a dispatch date.',
      'Create an ad-hoc slip — one slip for a single centre, for a late registration, a correction or a make-up delivery.',
      'Then check the slips, and assign them to packers or leave them on the board.',
    ],
    followUp: {
      question: 'Would you like to know how generating slips for a whole cohort works?',
      topic: 'picking-slip-generate',
    },
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
      'Slips are made for three kinds of centre. ECD centres are crèches: they ' +
      'collect every week on their pickup day (Tuesday or Thursday), and their quantities depend on ' +
      'how many children they have. Soup kitchens serve cooked meals. Dignity ' +
      'kitchens work differently again, which is why a slip always says which kind of' +
      ' centre it is for.',
    followUp: {
      question: 'Would you like to know how a pallet is packed from its slip?',
      topic: 'packing-pallet',
      otherwise: { question: 'Would you like to know how to generate the week’s slips?', topic: 'picking-slip-generate' },
    },
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
      'Open a slip on Picking Slips, choose a worker under Assign to a worker, then ' +
      'Assign. You can add a second packer when two people are on it. To give many ' +
      'at once, tick them and choose Assign to….\n\n' +
      'Or leave slips unassigned and anyone free can claim one on the floor — ' +
      'assigning is only needed when it has to be someone in particular.',
    followUp: {
      question: 'Would you like to know how packers claim a slip themselves?',
      topic: 'packing-claim',
      otherwise: { question: 'Would you like to know how to take a slip back off someone?', topic: 'picking-slip-release' },
    },
    related: ['picking-slip-create', 'packing-claim'],
  },
  {
    id: 'picking-slip-generate',
    title: 'Generating this week’s slips',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'generate slips', 'all the centres at once', 'bulk create slips', 'do them all',
      'slips for the week',
    ],
    body:
      'Generate this week’s slips makes one slip for every approved, active centre in' +
      ' the cohort you choose, filled from each centre’s standard order.',
    steps: [
      'Open Picking Slips and choose Generate this week’s slips.',
      'Pick the dispatch date and the cohort (Tuesday or Thursday).',
      'Choose Generate slips.',
      'If it says some slips had no lines, check those centres before packing starts.',
    ],
    followUp: {
      question: 'Would you like to know how to make a single slip for one centre?',
      topic: 'picking-slip-create',
    },
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
      'Beneficiaries are the centres that collect food from us. Each record holds the' +
      ' centre’s name, its pickup day (Tuesday or Thursday), a contact person, a mobile ' +
      'number for reminders and, for ECD centres, the number of children.\n\n' +
      'Choose + Add beneficiary to add one, or click a centre to open it in the panel ' +
      'on the right, where you can edit, approve or move it.',
    followUp: {
      question: 'Would you like to know why the number of children matters?',
      topic: 'beneficiary-ecd-numbers',
    },
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
      'An ECD centre’s food is worked out from how many children it serves, and the ' +
      'impact reports count children from it too. Keep it accurate, and update it ' +
      'whenever a centre tells you its numbers have changed.',
    followUp: {
      question: 'Would you like to know what to do when a centre stops collecting?',
      topic: 'beneficiary-inactive',
    },
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
      'Open the centre and choose Deactivate rather than deleting it. It stops ' +
      'getting new picking slips, but its history stays, so past reports still add ' +
      'up. To see inactive centres again, tick Show inactive under + Filter.',
    followUp: {
      question: 'Would you like to know what a centre’s record holds?',
      topic: 'beneficiary-manage',
    },
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
      'The day before a collection, every ECD centre due to collect is emailed a ' +
      'reminder automatically at 8:00 — unless that day is closed on the operating ' +
      'calendar, when none go out.\n\n' +
      'The Collection reminders screen shows tomorrow’s list: whether each email ' +
      'went, and a WhatsApp message ready for you to send by hand. The WhatsApp to ' +
      'send and Email failed tabs show what still needs you.',
    followUp: {
      question: 'Would you like to know how to send the WhatsApp reminder?',
      topic: 'collection-reminder-whatsapp',
    },
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
    body:
      'The system writes the message; you send it from the WhatsApp account signed in' +
      ' on your device.',
    steps: [
      'Open Collection reminders.',
      'Choose Open WhatsApp on the centre’s row — the message is already filled in.',
      'Send it in WhatsApp.',
      'Come back and choose Mark sent.',
    ],
    followUp: {
      question: 'Would you like to know what to do if a reminder didn’t go?',
      topic: 'collection-reminder-failed',
    },
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
      'Open the Email failed tab and choose Retry email on that centre’s row.\n\n' +
      'If Open WhatsApp is greyed out, the centre has no mobile number. Add it on the' +
      ' Beneficiaries screen so the next reminder works.',
    followUp: {
      question: 'Would you like to know how to update a centre’s details?',
      topic: 'beneficiary-manage',
    },
    related: ['collection-reminders', 'beneficiary-manage', 'email-settings'],
  },
  {
    id: 'benevolent-requests',
    title: 'Benevolent package requests',
    roles: WORKERS_ONLY,
    screens: ['communityRequests'],
    asks: [
      'someone phoned asking for food', 'call in request', 'benevolent package',
      'a person needs help', 'community request', 'walk in asking for food',
    ],
    body:
      'When someone phones or walks in asking for a food parcel, log it here instead ' +
      'of on a note.',
    steps: [
      'Open Benevolent Requests and choose Log a request.',
      'Enter what was requested, the caller’s name and how to contact them.',
      'Add a quantity note and when they asked.',
      'Save. It then shows under Open requests until it’s dealt with.',
    ],
    followUp: {
      question: 'Would you like to know what to do if something about a request looks wrong?',
      topic: 'something-looks-wrong',
    },
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
      'Feed the Soil gives households a kit for collecting food waste. When they ' +
      'bring it back, the compost is weighed and logged here, then sent on to a farm.\n\n' +
      'The compost figure on the impact reports comes only from what is logged on ' +
      'this screen.',
    followUp: {
      question: 'Would you like to know how to give someone a kit?',
      topic: 'feed-the-soil-assign',
    },
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
      'Open Feed the Soil, go to Kits, and choose Assign a kit. Enter the owner’s ' +
      'name and the date. The suburb is optional, but fill it in if you can — it is ' +
      'what the compost-by-area figures are built from.',
    followUp: {
      question: 'Would you like to know how to log compost when a kit comes back?',
      topic: 'feed-the-soil-log',
    },
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
    body:
      'Weigh the compost before you record it — the kilograms are the whole point.',
    steps: [
      'Open Feed the Soil and choose Log a collection.',
      'Find the kit by the owner’s name or suburb.',
      'Enter the kilograms and the date it came in.',
      'Choose Log compost.',
    ],
    followUp: {
      question: 'Would you like to know how to record the compost going to a farm?',
      topic: 'feed-the-soil-dispatch',
    },
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
      'Open the compost record and choose Mark dispatched, then enter the farmer or ' +
      'drop-off point it went to. Dispatched records move to the bottom of the list, ' +
      'so what’s still waiting stays at the top.',
    followUp: {
      question: 'Would you like to know how to log compost that came in?',
      topic: 'feed-the-soil-log',
    },
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
      'Open Operations reports and type your question in plain English, like "how ' +
      'much food went out in July", then tap Ask. It answers only with reports that ' +
      'already exist, so it can’t make up a figure.\n\n' +
      'You can also tap one of the suggested questions, or build a report with the ' +
      'dropdowns underneath.',
    followUp: {
      question: 'Would you like to know what Generate report adds under the chart?',
      topic: 'reporting-insights',
    },
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
      'The Impact report turns food sent out into people served — children at ECD' +
      ' centres, adults at soup kitchens, dignity kitchen guests and households — ' +
      'plus compost processed.\n\n' +
      'Children are counted once per period, however many times their centre ' +
      'collects.',
    followUp: {
      question: 'Would you like to know how kilograms are turned into meals?',
      topic: 'impact-conversions',
    },
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
      'Meals and people served are worked out from the kilograms dispatched, using ' +
      'set rates (for example "how many meals does 1 kg feed?"). Choose Adjust ' +
      'estimates on the Impact report to see or change them; every figure updates.\n\n' +
      'Agree the rate before a report goes out, and mention which one you used.',
    followUp: {
      question: 'Would you like to know how to export the impact poster?',
      topic: 'impact-poster',
    },
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
      'On the Impact report, set the period at the top, then choose Export PDF. It' +
      ' puts the headline figures in a grid, ready to print or send to donors or the ' +
      'board — and it shows exactly what’s on screen.',
    followUp: {
      question: 'Would you like to know how the meal figures are worked out?',
      topic: 'impact-conversions',
    },
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
    body:
      'Open the report, choose GENERATE REPORT, then PDF REPORT. You get a document ' +
      'with our letterhead: the explanation of the chart, the business view, the ' +
      'figures and the actions. From there choose View PDF to download it, or Print.\n\n' +
      'Check the period on the report before sending it — it’s the part people most ' +
      'often misread.',
    followUp: {
      question: 'Would you like to know how to browse all the reports?',
      topic: 'reporting-browse',
    },
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
      'Open Browse all reports under the question box. Reports are grouped by area: ' +
      'dispatch and collections, picking and decanting, receiving and suppliers, ' +
      'procurement, stock, and donations, community and volunteers. The suggested ' +
      'questions above it are a quick way in.',
    followUp: {
      question: 'Would you like to know how to read a report once it’s open?',
      topic: 'reporting-insights',
    },
    related: ['reporting-ask', 'reporting-insights'],
  },
  {
    id: 'reporting-insights',
    title: 'Generating a report and reading it',
    roles: MANAGERS_UP,
    screens: ['reporting'],
    asks: [
      'what does the chart mean', 'what is the dotted line', 'target line', 'who to act on',
      'generate report', 'business view', 'explain this chart', 'actions',
      'what should I do about this report', 'highlight a bar', 'compare to last month',
      'is this good or bad',
    ],
    body:
      'Under the chart, choose GENERATE REPORT. It adds, in order: About this chart ' +
      '(what the chart shows, in plain words), the Business view (what it means for ' +
      'the operation and whether it is on target), the key figures, related views, ' +
      'and Actions — the centres, suppliers or products to follow up, with contacts.\n\n' +
      'The dashed line across the chart is the working target. Tap a bar or point to ' +
      'highlight it.',
    followUp: {
      question: 'Would you like to know how to get the report as a PDF?',
      topic: 'reporting-export',
    },
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
    body:
      'Volunteers sign in with their first name when they arrive, against an event. ' +
      'Open the event under Volunteer Events: Bookings and attendance shows who is ' +
      'booked and who has been checked in.\n\n' +
      'Admins also have the full door log, with sign-out times.',
    followUp: {
      question: 'Would you like to know how to set up a volunteer event?',
      topic: 'volunteer-events',
    },
    related: ['volunteer-events', 'guest-sign-in', 'volunteer-guest-log'],
  },
  {
    id: 'volunteer-events',
    title: 'Volunteer events',
    roles: MANAGERS_UP,
    screens: ['volunteers'],
    asks: [
      'volunteer event', 'set up a session', 'group coming in', 'corporate volunteers',
      'book volunteers', 'schedule volunteers', 'create an event',
    ],
    body:
      'Choose + Create event on Volunteer Events. Fill in the name, date, venue and ' +
      'description, then the first time slot: its space, start and end time, and ' +
      'capacity. Add more with Add Timeslot.\n\n' +
      'On the day, volunteers sign in against it — that’s what turns a sign-in into ' +
      'hours we can count. The tabs show Open, Completed and Cancelled events.',
    followUp: {
      question: 'Would you like to know how to run the event on the day?',
      topic: 'volunteer-event-day',
    },
    related: ['volunteer-log', 'volunteer-event-day', 'volunteer-event-close'],
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
      'Volunteers don’t need an account. On the sign-in page they choose LOG IN AS ' +
      'GUEST and give their first name. They only see their own event screen — ' +
      'nothing else in the system.',
    followUp: {
      question: 'Would you like to know which screens each role can use?',
      topic: 'who-can-do-what',
    },
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
      'Choose + Add product on Product Management, or click a product and choose ' +
      'Edit details in its panel. Name and stock code are required. Weight, cost and reorder level are optional, but they matter: they ' +
      'fill in purchase order lines and decide when a product shows as low.\n\n' +
      'A wrong number here becomes a wrong number on every order, so double-check it.',
    followUp: {
      question: 'Would you like to know how to remove a product safely?',
      topic: 'archive-not-delete',
    },
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
      'Products and suppliers are what everything else is built on — changing a ' +
      'product’s weight changes every order estimate. So only admins can edit them.\n\n' +
      'Managers can still do everything day-to-day, including stock adjustments. For ' +
      'a catalogue change, ask an admin.',
    followUp: {
      question: 'Would you like to know which screens each role can use?',
      topic: 'who-can-do-what',
    },
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
    body:
      'Choose Register supplier on Supplier Management, or click a supplier to see ' +
      'their details, open orders and recent deliveries, and choose Edit details. If ' +
      'you stop using a supplier, deactivate them rather than deleting — past orders ' +
      'still need to show who they were from.',
    followUp: {
      question: 'Would you like to know how removing things safely works?',
      topic: 'archive-not-delete',
    },
    related: ['archive-not-delete', 'po-create'],
  },
  {
    id: 'archive-not-delete',
    title: 'Removing something safely',
    roles: ADMIN_ONLY,
    screens: ['products', 'suppliers'],
    asks: [
      'delete a product', 'remove a supplier', 'how do I delete', 'deactivate',
      'it is still showing', 'get rid of an old item',
    ],
    body:
      'Deactivate takes a product, supplier, centre or user out of the lists people ' +
      'pick from, and can be undone. Delete goes further and cannot. Past orders and ' +
      'reports still read correctly either way.\n\n' +
      'Everything deactivated or deleted is listed in the Archive.',
    followUp: {
      question: 'Would you like to know how to bring something back from the Archive?',
      topic: 'archive-restore',
    },
    rules: ['BR-27', 'NFR-16'],
    related: ['archive-restore', 'product-fields', 'beneficiary-inactive'],
  },
  {
    id: 'users-and-accounts',
    title: 'Setting up a user',
    roles: ADMIN_ONLY,
    screens: ['users'],
    asks: [
      'add a user', 'new staff member', 'change someone role', 'someone left',
      'create an account', 'give someone access', 'invite someone',
    ],
    body:
      'You invite people rather than make their accounts. Choose Invite user on User ' +
      'Management, enter their email and role, and choose Send invite. They set their' +
      ' own username, name and password when they accept — you never see or choose a ' +
      'password.\n\n' +
      'Give the narrowest role that lets them do their job. When someone leaves, ' +
      'deactivate their account rather than deleting it, so their past work stays ' +
      'under their name.',
    followUp: {
      question: 'Would you like to know what to do if an invite hasn’t arrived?',
      topic: 'user-invites',
    },
    rules: ['BR-01', 'NFR-08'],
    related: ['user-invites', 'who-can-do-what', 'archive-not-delete'],
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
    body:
      'The Classification Queue is where donations recorded at the gate are checked, ' +
      'valued properly and classified. Its tabs: Pending Product Review (items that ' +
      'need a decision), Reconciliation (something doesn’t match) and Processing ' +
      'Failed (a system problem — try them again).\n\n' +
      'It’s the place to correct a rough value before a certificate goes out.',
    followUp: {
      question: 'Would you like to know how Section 18A certificates are issued?',
      topic: 'section18a-certificates',
    },
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
      'Donations where the donor asked for a certificate queue up on the Certificate ' +
      'Queue tab, which you can search by donor, amount and date. The Email history ' +
      'tab shows every certificate and thank-you email, and Resend sends one again.\n\n' +
      'Every action is recorded, because SARS needs the trail as much as the ' +
      'certificate itself.',
    followUp: {
      question: 'Would you like to know how to check and correct a donation’s value first?',
      topic: 'donation-management-screen',
    },
    rules: ['BR-09', 'BR-04', 'NFR-16'],
    related: ['donation-18a', 'donation-management-screen'],
  },
  {
    id: 'email-settings',
    title: 'Email settings',
    roles: ADMIN_ONLY,
    screens: ['emailIntegration', 'settings'],
    asks: [
      'email settings', 'gmail', 'emails are not sending', 'connect email',
      'who do emails come from', 'certificate emails',
    ],
    body:
      'Open Settings and the Email section. That is where the Gmail account that ' +
      'sends certificates, reminders and notifications is connected. If emails have ' +
      'stopped going out, check the connection here first, then Message history for ' +
      'what failed.',
    followUp: {
      question: 'Would you like to know how to set where Finance emails go?',
      topic: 'finance-recipient',
    },
    related: ['finance-recipient', 'section18a-certificates'],
  },
  {
    id: 'finance-recipient',
    title: 'Where Finance emails go',
    roles: ADMIN_ONLY,
    screens: ['emailIntegration', 'financeReport', 'settings'],
    asks: [
      'finance email address', 'change the finance recipient', 'who gets the purchase orders',
      'finance did not get the po', 'send finance the report', 'report link for finance',
    ],
    body:
      'In Settings, Email section, save the Finance recipient’s email address. New purchase ' +
      'orders are sent there automatically.\n\n' +
      'The Send Finance Report Link button emails Finance a link to the warehouse ' +
      'movement report, which they can open without an account.',
    followUp: {
      question: 'Would you like to know what the finance report contains?',
      topic: 'finance-report',
    },
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
      'The Warehouse Movement Report shows purchase orders, donations and dispatches ' +
      'for a period, with totals and a trend chart. Choose the period at the top. Use' +
      ' Export PDF for the summary, or open a list and export it as CSV or Excel for ' +
      'the detail.',
    followUp: {
      question: 'Would you like to know how to send this report to Finance?',
      topic: 'finance-recipient',
    },
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
      'The Volunteer log lists every guest sign-in at the door; the On site tab is ' +
      'who is here now. If someone left without signing out, open their visit and ' +
      'choose Sign out — their hours only count once the visit is closed.\n\n' +
      'There’s no delete button on purpose: it’s a record of who was on site.',
    followUp: {
      question: 'Would you like to know how volunteer events work?',
      topic: 'volunteer-events',
    },
    related: ['volunteer-log', 'guest-sign-in'],
  },

  // ═══ The floor and the office ═════════════════════════════
  {
    id: 'office-and-floor',
    title: 'Why the floor screens are not on your menu',
    roles: EVERYONE,
    screens: ['home'],
    general: true,
    asks: [
      'why can I not open receiving', 'where is packing', 'where is the decanting screen',
      'I cannot see the gate', 'why can I not see inventory', 'where did the packing board go',
      'can a manager receive a delivery', 'can I log a donation', 'it sent me back to my dashboard',
    ],
    body:
      'Each role works only its own screens. The floor — receiving, decanting, ' +
      'packing, the gate, donation intake — belongs to warehouse staff. The office — ' +
      'stock, orders, picking slips, centres and reports — belongs to managers, and ' +
      'admins look after users, products and settings.\n\n' +
      'Opening another role’s screen takes you back to your own home. Managers ' +
      'follow the floor’s work from their own screens instead.',
    followUp: {
      question: 'Would you like to know what you can do in your role?',
      topic: MY_ROLE,
    },
    rules: ['BR-01'],
    related: ['who-can-do-what', 'deliveries-manager', 'packing-progress-manager'],
  },

  // ═══ Working with the lists (manager and admin screens) ════
  {
    id: 'list-screens',
    title: 'Tabs, search, filters and columns',
    roles: MANAGERS_UP,
    screens: ['inventory', 'purchaseOrders', 'pickingSlips', 'beneficiaries', 'stockLedger', 'receipts', 'products', 'suppliers', 'users'],
    general: true,
    asks: [
      'how do I filter', 'how do I search', 'hide a column', 'what are the tabs',
      'export to csv', 'the number next to the tab', 'show only', 'clear the filters',
      'sort by a column', 'how do I find something in the list',
    ],
    body:
      'Every list works the same way. The tabs along the top are ready-made views, ' +
      'with how many rows each holds — a red number means something needs you. Inside ' +
      'the card: search, then + Filter for more ways to narrow it (each one shows as a ' +
      'chip you can remove), Columns to hide or show columns, and Export for a CSV of ' +
      'what is in view.\n\n' +
      'Click a column name to sort by it, and a row to open it in the panel on the ' +
      'right.',
    followUp: {
      question: 'Would you like to know what you can do with several rows at once?',
      topic: 'list-bulk-actions',
    },
    related: ['list-bulk-actions', 'inventory-columns'],
  },
  {
    id: 'list-bulk-actions',
    title: 'Doing something to several rows at once',
    roles: MANAGERS_UP,
    screens: ['inventory', 'pickingSlips'],
    general: true,
    asks: [
      'select several', 'tick boxes', 'bulk', 'do them all at once', 'select all',
      'many products at once', 'several slips at once',
    ],
    body:
      'Tick the box at the start of each row you want — or the box in the header for ' +
      'every row in the view. The search and filters are replaced by a bar saying how ' +
      'many you have ticked, with what you can do to them.',
    steps: [
      'Inventory — Raise purchase order, Adjust stock (one after another), or Export selected.',
      'Picking Slips — Assign to…, Assign to floor, or Print pallet labels.',
      'Choose Clear selection on the bar to untick them all.',
    ],
    followUp: {
      question: 'Would you like to know how to order everything that is low?',
      topic: 'po-from-inventory',
    },
    related: ['list-screens', 'po-from-inventory', 'picking-slip-assign'],
  },
  {
    id: 'dashboard-manager',
    title: 'Your dashboard',
    roles: MANAGERS_UP,
    screens: ['home'],
    asks: [
      'what is on my dashboard', 'needs attention', 'customise the dashboard',
      'add a widget', 'remove a tile', 'what should I do first today',
      'move a widget', 'drag the tiles', 'rearrange the dashboard', 'hide needs attention',
      'collapse needs attention',
    ],
    body:
      'Needs attention, at the top, lists what is waiting on you, worst first — tap a ' +
      'line to go straight to it. Tap its heading to fold it away; it still says how ' +
      'many things are waiting.\n\n' +
      'Under it are figures and charts. Choose Customise dashboard to add, remove or ' +
      'replace them, and drag one by its handle to move it — numbers among numbers, ' +
      'charts among charts. Done keeps it; Reset to default starts again.',
    followUp: {
      question: 'Would you like to know how the bell works?',
      topic: 'notifications',
    },
    related: ['notifications', 'inventory-low-stock', 'po-approve'],
  },

  // ═══ Following the floor's work (manager) ═════════════════
  {
    id: 'deliveries-manager',
    title: 'Following deliveries as a manager',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders', 'receipts'],
    asks: [
      'did the delivery come', 'has the order arrived', 'what came in today',
      'short delivery', 'which deliveries were flagged', 'is the supplier late',
      'how do I receive a delivery', 'expected deliveries today',
    ],
    body:
      'Warehouse staff record deliveries on the floor; you follow them from your own ' +
      'screens. The In transit tab on Purchase Orders is what is still expected. Once ' +
      'a delivery is recorded, its order moves to Partially received or Completed, and' +
      ' the delivery note appears on Receipts under Goods in.\n\n' +
      'A delivery whose count didn’t match shows Flagged and a variance on Receipts, ' +
      'and the bell tells you.',
    followUp: {
      question: 'Would you like to know what to do when a supplier got an order wrong?',
      topic: 'po-follow-up',
    },
    rules: ['BR-07B', 'BR-08'],
    related: ['po-status', 'receipts-screen', 'po-follow-up'],
  },
  {
    id: 'packing-progress-manager',
    title: 'Following packing as a manager',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'how is packing going', 'which pallets are packed', 'who is packing',
      'is the pallet ready', 'packing board', 'packing progress', 'what is still to pack',
    ],
    body:
      'Picking Slips is your view of the floor’s packing. Its tabs split the week: ' +
      'Unassigned (nobody on it yet), Packing, Ready at gate and Not collected. Each ' +
      'row shows who is packing it and how many lines are packed.\n\n' +
      'Open a slip to see its lines, what was flagged short, and who has it.',
    followUp: {
      question: 'Would you like to know how to give a slip to a particular packer?',
      topic: 'picking-slip-assign',
    },
    related: ['picking-slip-assign', 'picking-slip-week', 'missed-collections-manager'],
  },
  {
    id: 'missed-collections-manager',
    title: 'Centres that didn’t collect',
    roles: MANAGERS_UP,
    screens: ['pickingSlips', 'beneficiaries'],
    asks: [
      'who did not collect', 'missed collection', 'no show', 'non collection',
      'which centres missed', 'uncollected pallets', 'they never came',
    ],
    body:
      'A pallet nobody collected by the cut-off (15:00 unless an admin changed it in ' +
      'Settings) is marked Not collected automatically. You see them on the Not ' +
      'collected tab of Picking Slips, which counts red, and the bell tells you.\n\n' +
      'If a centre keeps missing, check its contact details and reminders on ' +
      'Beneficiaries and Collection reminders.',
    followUp: {
      question: 'Would you like to know how collection reminders work?',
      topic: 'collection-reminders',
    },
    rules: ['BR-14', 'BR-26', 'BR-27'],
    related: ['collection-reminders', 'beneficiary-manage', 'packing-progress-manager'],
  },
  {
    id: 'decanting-manager',
    title: 'Decanting runs and wastage, for a manager',
    roles: MANAGERS_UP,
    screens: ['stockLedger', 'reporting'],
    asks: [
      'how much was decanted', 'decanting wastage', 'decanting sheets', 'decanting report',
      'where is the decanting planner', 'which sacks came in light',
    ],
    body:
      'Warehouse staff record decanting on the floor. You see every run on the ' +
      'Decanting tab of the stock ledger, and the Wastage tab shows what was lost.\n\n' +
      'For the pattern over time — which products and suppliers keep coming in ' +
      'light — open Operations reports and browse the picking and decanting reports.',
    followUp: {
      question: 'Would you like to know how to browse the reports?',
      topic: 'reporting-browse',
    },
    rules: ['BR-06'],
    related: ['stock-ledger', 'reporting-browse'],
  },

  // ═══ Purchase orders (manager) ════════════════════════════
  {
    id: 'po-approve',
    title: 'Approving a purchase order',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders'],
    asks: [
      'approve an order', 'awaiting approval', 'sign off an order', 'pending order',
      'edit an order', 'delete an order', 'change an order before it goes',
    ],
    body:
      'New orders wait on the Awaiting approval tab. Open one, check the lines and ' +
      'total, and choose Approve — it is then ready to send to the supplier.\n\n' +
      'Only an order still awaiting approval can be edited or deleted; once approved, ' +
      'it is a commitment to the supplier.',
    followUp: {
      question: 'Would you like to know what each status means?',
      topic: 'po-status',
    },
    related: ['po-status', 'po-create', 'po-finance-email'],
  },
  {
    id: 'po-follow-up',
    title: 'When a supplier got it wrong',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders'],
    asks: [
      'record a follow up', 'supplier sent the wrong thing', 'chase the supplier',
      'reopen an order', 'follow-up required', 'the rest never came',
    ],
    body:
      'Open the order and choose Record follow-up, with a short reason. It moves to ' +
      'the Follow-up required tab, so it isn’t forgotten, and no more can be received ' +
      'against it until you decide.\n\n' +
      'If the supplier sorts it out, choose Reopen for receiving to put it back to ' +
      'Approved.',
    followUp: {
      question: 'Would you like to know what each status means?',
      topic: 'po-status',
    },
    rules: ['BR-07B'],
    related: ['po-status', 'deliveries-manager'],
  },
  {
    id: 'po-from-inventory',
    title: 'Ordering what is low, straight from Inventory',
    roles: MANAGERS_UP,
    screens: ['inventory', 'purchaseOrders'],
    asks: [
      'order everything that is low', 'reorder from inventory', 'order the low items',
      'raise purchase order from stock', 'quick reorder',
    ],
    body:
      'On Inventory, open the Low stock (or Shortfall) tab, tick the products you ' +
      'want and choose Raise purchase order. A new order opens with those products ' +
      'already on it, each with enough to bring it back up to its reorder level — pick ' +
      'the supplier, check the quantities and save.',
    followUp: {
      question: 'Would you like to know how approving the order works?',
      topic: 'po-approve',
    },
    related: ['inventory-low-stock', 'po-create'],
  },
  {
    id: 'po-quickbooks',
    title: 'The QuickBooks reference',
    roles: MANAGERS_UP,
    screens: ['purchaseOrders'],
    asks: [
      'quickbooks reference', 'quickbooks number', 'link to quickbooks', 'finance captured it',
      'where do I put the quickbooks number',
    ],
    body:
      'Once Finance has captured an order in QuickBooks, open the order and add ' +
      'their reference in the QuickBooks field, then Save. It ties the two records ' +
      'together, so anyone can find the order from Finance’s side.',
    followUp: {
      question: 'Would you like to know how orders reach Finance?',
      topic: 'po-finance-email',
    },
    related: ['po-finance-email'],
  },

  // ═══ Picking slips (manager) ══════════════════════════════
  {
    id: 'picking-slip-week',
    title: 'Choosing the week',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'next week slips', 'last week', 'change the week', 'see another week',
      'slips for a different week', 'go back to this week',
    ],
    body:
      'Picking Slips shows one week at a time — the dates are above the tabs. Use the ' +
      'arrows either side to move a week back or forward, and This week to come ' +
      'back. The tabs and their counts are for the week on screen.',
    followUp: {
      question: 'Would you like to know how to generate the week’s slips?',
      topic: 'picking-slip-generate',
    },
    related: ['picking-slip-generate', 'packing-progress-manager'],
  },
  {
    id: 'picking-slip-labels',
    title: 'Printing pallet labels',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'print labels', 'pallet label', 'print the qr', 'label for the pallet',
      'print all labels', 'labels will only work on this computer',
    ],
    body:
      'Print labels at the top of the list prints one for every slip in view. For ' +
      'some, tick them and choose Print pallet labels; for one, open it and choose ' +
      'Print pallet label.\n\n' +
      'If the screen warns the labels will only work on this computer, don’t print ' +
      'them for the warehouse — the QR codes would not open on a phone.',
    followUp: {
      question: 'Would you like to know what the QR code on a label does?',
      topic: 'picking-slip-qr',
    },
    rules: ['BR-22'],
    related: ['picking-slip-qr', 'list-bulk-actions'],
  },
  {
    id: 'picking-slip-release',
    title: 'Taking a slip back off someone',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'unassign a slip', 'release a slip', 'they went home', 'give it back to the floor',
      'assign to floor', 'someone else should pack it', 'reassign',
    ],
    body:
      'Open the slip and choose Assign to floor: it goes back for anyone to claim, ' +
      'and the packer is told. To hand it straight to someone else instead, choose ' +
      'them under Assign to a worker and Reassign.\n\n' +
      'For several at once, tick them and choose Assign to floor on the bar.',
    followUp: {
      question: 'Would you like to know how assigning a slip works?',
      topic: 'picking-slip-assign',
    },
    related: ['picking-slip-assign', 'list-bulk-actions'],
  },
  {
    id: 'picking-slip-edit',
    title: 'Changing a slip',
    roles: MANAGERS_UP,
    screens: ['pickingSlips'],
    asks: [
      'edit a slip', 'change the quantities', 'add a line to a slip', 'wrong amount on the slip',
      'change what a centre gets',
    ],
    body:
      'Open the slip and choose Edit slip to change its lines and quantities. That ' +
      'is only offered until someone claims it — once a packer has started, release ' +
      'it with Assign to floor first.\n\n' +
      'To change what a centre gets every week, update its record on Beneficiaries ' +
      'instead, so next week’s slip is right too.',
    followUp: {
      question: 'Would you like to know how to create a one-off slip?',
      topic: 'picking-slip-create',
    },
    related: ['picking-slip-create', 'beneficiary-manage'],
  },

  // ═══ Beneficiaries (manager) ══════════════════════════════
  {
    id: 'beneficiary-approve',
    title: 'Approving a new centre',
    roles: MANAGERS_UP,
    screens: ['beneficiaries'],
    asks: [
      'approve a centre', 'awaiting approval', 'new centre cannot get a slip',
      'why is there no slip for this centre', 'approve a beneficiary',
    ],
    body:
      'A new centre can’t receive a picking slip until it is approved. The Awaiting ' +
      'approval tab on Beneficiaries lists them, counting red. Open the centre, check ' +
      'its details and choose Approve.',
    followUp: {
      question: 'Would you like to know what a centre’s record holds?',
      topic: 'beneficiary-manage',
    },
    rules: ['BR-11'],
    related: ['beneficiary-manage', 'picking-slip-generate'],
  },
  {
    id: 'beneficiary-cohort',
    title: 'Moving a centre to the other day',
    roles: MANAGERS_UP,
    screens: ['beneficiaries'],
    asks: [
      'change pickup day', 'move to thursday', 'move to tuesday', 'change cohort',
      'they want to collect on a different day', 'tuesday or thursday',
    ],
    body:
      'Open the centre and choose Move to Thursday (or Move to Tuesday). It is ' +
      'generated with the other cohort from the next run of slips. The Tuesday and ' +
      'Thursday tabs show who is in each.',
    followUp: {
      question: 'Would you like to know how generating slips for a cohort works?',
      topic: 'picking-slip-generate',
    },
    related: ['beneficiary-manage', 'picking-slip-generate'],
  },

  // ═══ Benevolent requests ══════════════════════════════════
  {
    id: 'benevolent-requests-manage',
    title: 'Benevolent requests, for a manager',
    roles: MANAGERS_UP,
    screens: ['communityRequests'],
    asks: [
      'someone phoned asking for food', 'benevolent package', 'community request',
      'open requests', 'what requests are waiting', 'log a request', 'food parcel request',
    ],
    body:
      'Benevolent Requests lists every phoned-in or walk-in request for a food ' +
      'parcel, with a tab for each outcome. Pending, first and counting red, is what ' +
      'still needs dealing with.\n\n' +
      'Choose + Log a request to add one yourself. Claim a request to show you are ' +
      'handling it, then Resolve it.',
    followUp: {
      question: 'Would you like to know how to resolve a request?',
      topic: 'benevolent-resolve',
    },
    rules: ['BR-28'],
    related: ['benevolent-resolve'],
  },
  {
    id: 'benevolent-resolve',
    title: 'Closing off a request',
    roles: EVERYONE,
    screens: ['communityRequests'],
    asks: [
      'resolve a request', 'we gave them food', 'we cannot help', 'decline a request',
      'what happened to the request', 'claim a request', 'save outcome',
    ],
    body:
      'Claim the request first if nobody has, so two people don’t chase it. Then ' +
      'resolve it: choose the outcome — Fulfilled, Partially fulfilled or Declined — ' +
      'and write a short note of what was given or why not, then Save outcome.\n\n' +
      'The note is required: it is the only record of what happened.',
    followUp: {
      question: 'Would you like to know what to do if something about a request looks wrong?',
      topic: 'something-looks-wrong',
    },
    rules: ['BR-28'],
    related: ['benevolent-requests', 'benevolent-requests-manage'],
  },

  // ═══ Volunteers (manager) ═════════════════════════════════
  {
    id: 'volunteer-event-day',
    title: 'Running an event on the day',
    roles: MANAGERS_UP,
    screens: ['volunteers'],
    asks: [
      'check in a volunteer', 'walk in volunteer', 'someone turned up without booking',
      'register a walk-in', 'who has arrived', 'mark attendance', 'undo check in',
    ],
    body:
      'Open the event from Volunteer Events. Schedule and capacity shows each time ' +
      'slot and how full it is. Under Bookings and attendance, choose Check in as ' +
      'each person arrives (Undo check-in if it was the wrong one).\n\n' +
      'Someone who turns up without a booking: choose Register walk-in, pick the time ' +
      'slot and enter their name.',
    followUp: {
      question: 'Would you like to know how to close the event afterwards?',
      topic: 'volunteer-event-close',
    },
    related: ['volunteer-events', 'volunteer-event-close', 'volunteer-log'],
  },
  {
    id: 'volunteer-event-close',
    title: 'Completing or cancelling an event',
    roles: MANAGERS_UP,
    screens: ['volunteers'],
    asks: [
      'finish an event', 'complete an event', 'cancel an event', 'the event is off',
      'edit an event', 'change the event date',
    ],
    body:
      'On Volunteer Events, each open event has three small buttons at the end of ' +
      'its row: the pencil edits it, the tick marks it completed, and the cross ' +
      'cancels it. Both ask you to confirm.\n\n' +
      'A completed or cancelled event stays on its tab for the record, but can no ' +
      'longer be changed.',
    followUp: {
      question: 'Would you like to know how to set up a new event?',
      topic: 'volunteer-events',
    },
    related: ['volunteer-events', 'volunteer-event-day'],
  },

  // ═══ Admin ════════════════════════════════════════════════
  {
    id: 'user-invites',
    title: 'Invites that haven’t been accepted',
    roles: ADMIN_ONLY,
    screens: ['users'],
    asks: [
      'invite did not arrive', 'resend an invite', 'copy the invite link', 'cancel an invite',
      'pending invites', 'invite expired', 'revoke an invite',
    ],
    body:
      'Invites not yet accepted are listed above the users on User Management. For ' +
      'each one: Resend emails a fresh link, Copy link puts a fresh link on your ' +
      'clipboard to send another way, and Revoke cancels it.\n\n' +
      'A link only works for a limited time (set under Settings, Accounts); after ' +
      'that, Resend.',
    followUp: {
      question: 'Would you like to know how to set up a user?',
      topic: 'users-and-accounts',
    },
    related: ['users-and-accounts', 'settings-admin'],
  },
  {
    id: 'archive-restore',
    title: 'Bringing something back',
    roles: ADMIN_ONLY,
    screens: ['archive'],
    asks: [
      'restore', 'undelete', 'bring back a product', 'reactivate a supplier',
      'I deactivated the wrong one', 'where do deleted things go', 'archive',
    ],
    body:
      'The Archive lists everything switched off or deleted across the system, with ' +
      'tabs for Deactivated and Deleted. Open an item and choose Restore to switch it ' +
      'back on — it reappears on its own screen as before.\n\n' +
      'A deleted item can’t be restored; create it again if it is needed.',
    followUp: {
      question: 'Would you like to know the difference between deactivating and deleting?',
      topic: 'archive-not-delete',
    },
    rules: ['BR-27', 'NFR-16'],
    related: ['archive-not-delete'],
  },
  {
    id: 'user-activity',
    title: 'Who did what',
    roles: ADMIN_ONLY,
    screens: ['activity'],
    asks: [
      'who changed this', 'who did that', 'activity log', 'audit trail', 'what did they do',
      'who deleted it', 'what happened yesterday',
    ],
    body:
      'User Activity lists everything people did, newest first, for the dates you ' +
      'choose. Narrow it to one person with the picker (or tap a name under Most ' +
      'active), or to one area under + Filter.\n\n' +
      'Open an entry to see what changed, from what to what, and choose Open the ' +
      'record to go to it.',
    followUp: {
      question: 'Would you like to know how to bring back something that was removed?',
      topic: 'archive-restore',
    },
    rules: ['NFR-16'],
    related: ['archive-restore', 'message-history'],
  },
  {
    id: 'message-history',
    title: 'Emails the system has sent',
    roles: ADMIN_ONLY,
    screens: ['messageHistory'],
    asks: [
      'did the email go', 'email history', 'sent emails', 'failed emails',
      'why did they not get the email', 'message history',
    ],
    body:
      'Message history lists every email the system has sent, with tabs for Failed, ' +
      'Sent and Not sent (sending switched off). Narrow it by message type. A failed ' +
      'one shows why underneath.\n\n' +
      'If many have failed, check the connection under Settings, Email.',
    followUp: {
      question: 'Would you like to know how email settings work?',
      topic: 'email-settings',
    },
    related: ['email-settings', 'user-activity'],
  },
  {
    id: 'settings-admin',
    title: 'Settings',
    roles: ADMIN_ONLY,
    screens: ['settings'],
    asks: [
      'settings', 'change the cut off time', 'reminder time', 'expiry warning',
      'how long do invites last', 'certificate settings', 'impact rates',
    ],
    body:
      'Settings holds how the system is set up, in sections. Changes apply to ' +
      'everyone.',
    steps: [
      'Email — the sending account, the Finance recipient and the Finance report link.',
      'Connections — whether the database, Gmail, email links, scheduled jobs, the AI, phone notifications and the volunteer system are working.',
      'Notifications & reminders — the not-collected cut-off and when reminders go out.',
      'Stock rules — when managers are warned about stock nearing its expiry date.',
      'Reporting — the rates that turn kilograms into people fed.',
      'Certificates and Accounts — certificate details, and how long invite links last.',
    ],
    followUp: {
      question: 'Would you like to know how email settings work?',
      topic: 'email-settings',
    },
    related: ['email-settings', 'impact-conversions', 'user-invites'],
  },
  {
    id: 'supplier-prospects',
    title: 'Possible new suppliers',
    roles: ADMIN_ONLY,
    screens: ['suppliers'],
    asks: [
      'prospects', 'a possible supplier', 'someone offered to supply', 'supplier lead',
      'not a supplier yet', 'register as supplier',
    ],
    body:
      'The Prospects tab on Supplier Management is a notepad for suppliers we might ' +
      'use — a name is enough to start. Mark contacted once you’ve spoken to them, or ' +
      'Not for us. When one comes on board, choose Register as supplier to turn it ' +
      'into a supplier without retyping it.',
    followUp: {
      question: 'Would you like to know how to manage suppliers?',
      topic: 'supplier-manage',
    },
    related: ['supplier-manage'],
  },
  // ═══ Operating calendar (manager) ═════════════════════════
  {
    id: 'operating-calendar',
    title: 'The operating calendar',
    roles: MANAGERS_UP,
    screens: ['operatingCalendar'],
    asks: [
      'operating calendar', 'public holiday', 'the warehouse is closed', 'close the warehouse',
      'shutdown', 'stocktake day', 'we are closed on', 'add a holiday', 'closed days',
    ],
    body:
      'The operating calendar holds the days the warehouse is shut. On a closed day no ' +
      'collection reminders go out, pallets due that day are not written off as not ' +
      'collected, and the week’s slips can’t be generated for it.',
    steps: [
      'Open Operating Calendar and choose Add public holidays to add South Africa’s for the year — Good Friday, Family Day and Sunday-to-Monday days included.',
      'For anything else — a stocktake, a shutdown week — choose Add closed day, pick the first (and last) day and give the reason.',
      'Each closed day shows which cohort misses its collection, so you can plan a make-up day.',
    ],
    followUp: {
      question: 'Would you like to know how to change a cohort’s collection day?',
      topic: 'operating-calendar-cohorts',
    },
    related: ['operating-calendar-cohorts', 'collection-reminders', 'missed-collections-manager'],
  },
  {
    id: 'operating-calendar-cohorts',
    title: 'Changing a cohort’s collection day',
    roles: MANAGERS_UP,
    screens: ['operatingCalendar', 'pickingSlips'],
    asks: [
      'change collection day', 'collect on wednesday', 'move the cohort', 'collection days per cohort',
      'tuesday cohort on a different day', 'swap the days',
    ],
    body:
      'Under Collection days on the Operating Calendar, choose the weekday each cohort ' +
      'collects on, then Save collection days. The cohorts keep their names — the ' +
      'Tuesday cohort is still the Tuesday cohort — but slips are generated for, and ' +
      'reminders sent before, the new day. The two cohorts need different days.',
    followUp: {
      question: 'Would you like to know how generating the week’s slips works?',
      topic: 'picking-slip-generate',
    },
    related: ['operating-calendar', 'picking-slip-generate'],
  },

  // ═══ Connections (admin) ══════════════════════════════════
  {
    id: 'connections',
    title: 'Checking the connections',
    roles: ADMIN_ONLY,
    screens: ['settings'],
    asks: [
      'is everything working', 'connections', 'health check', 'is email working', 'system status',
      'is the database up', 'why are emails not sending', 'check the integrations',
    ],
    body:
      'Settings → Connections checks everything outside this system that it depends on: ' +
      'the database, Gmail, the links in emails, the scheduled jobs, the AI assistant, ' +
      'phone notifications and the volunteer system. Problems come first.\n\n' +
      'Not working means someone needs to act, and most cards offer the fix. Not set up ' +
      'is a choice, not a fault. Choose Check again after fixing something.',
    followUp: {
      question: 'Would you like to know how email settings work?',
      topic: 'email-settings',
    },
    related: ['email-settings', 'message-history', 'settings-admin'],
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
    followUp: followUpFor(topic, role),
  };
};

/**
 * The follow-up question, resolved for this role. Dropped (null)
 * rather than offered when its topic is one the role cannot open —
 * a "Yes, show me" that answers 404 is worse than no question.
 */
// `otherwise` is a second offer for a reader who cannot open the first
// topic (e.g. a manager, for a how-to only warehouse staff use).
export const followUpFor = (topic, role) => {
  const resolve = (f) => {
    if (!f?.question || !f.topic) return null;
    const id = f.topic === MY_ROLE ? MY_ROLE_TOPIC[role] : f.topic;
    const target = id ? byId.get(id) : null;
    if (!target || (role && !target.roles.includes(role))) return null;
    return { question: f.question, topic: { id: target.id, title: target.title } };
  };
  return resolve(topic.followUp) ?? resolve(topic.followUp?.otherwise);
};

/** What a navigate answer carries: the screen and what it is for. */
export const publicScreen = (screen) => ({
  id: screen.id, label: screen.label, about: screen.about ?? null,
});

export default {
  SCREENS, SCREEN_IDS, TOPICS, TOPIC_IDS,
  getTopic, topicsForRole, screensForRole, screenForRole,
  suggestionsFor, publicTopic, publicScreen, followUpFor, MY_ROLE,
};
