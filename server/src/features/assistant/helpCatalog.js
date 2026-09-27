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
      'You can do everything warehouse staff do, plus run the operation. The bell at ' +
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
      'You can do everything a manager can, plus look after the information the rest ' +
      'of the system is built on. Changes here reach every screen, so it is worth ' +
      'going carefully.',
    steps: [
      'Accounts — create users, set roles, reset passwords.',
      'Catalogue — products and suppliers.',
      'Donations — the classification queue and Section 18A certificates.',
      'Email settings — the sending account and the Finance recipient.',
      'Finance report and the volunteer log.',
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
      'that won’t open isn’t broken — it belongs to another role.',
    steps: [
      'Warehouse staff — receiving, decanting, packing, dispatch, donations, requests.',
      'Managers — all of that, plus stock, orders, centres, slips and reports.',
      'Admins — all of that, plus users, products, suppliers and settings.',
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
    },
    related: ['who-can-do-what', 'find-my-way'],
  },
  {
    id: 'signing-in',
    title: 'Signing in',
    roles: EVERYONE,
    screens: ['home'],
    asks: ['how do I log in', 'I forgot my password', 'it logged me out', 'sign in problem', 'cannot log in'],
    body:
      'Sign in with the username and password your admin gave you. Nobody can look up' +
      ' your password — if you forget it, ask an admin to set a new one.\n\n' +
      'If you are signed out in the middle of a task, just sign back in. Work that ' +
      'was saved is still there.',
    followUp: {
      question: 'Would you like to know how to carry on with work you had started?',
      topic: 'unfinished-work',
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
      'Tap a notification to go straight to the thing it is about.',
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
    screens: ['receiving', 'purchaseOrders'],
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
      'Open a past delivery and choose View note. It shows what was ordered, what ' +
      'actually arrived and the difference, with the driver’s signature — so a short ' +
      'delivery shows on the paperwork, not only in the system. From there you can ' +
      'view it as a PDF or print it.',
    followUp: {
      question: 'Would you like to know how to find an older delivery?',
      topic: 'deliveries-past',
    },
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
    },
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    },
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
    roles: EVERYONE,
    screens: ['dispatch', 'dispatchHistory'],
    asks: [
      'they did not come', 'nobody collected', 'no show', 'missed collection', '16:00',
      'four o clock', 'non collection', 'still not here',
    ],
    body:
      'You don’t need to do anything. A pallet that hasn’t been collected by 15:00 is' +
      ' marked as not collected automatically, and it goes on that centre’s record so' +
      ' a pattern shows up over time.\n\n' +
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
    roles: EVERYONE,
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
      'Open a past collection and choose View note. It shows what went out, to which ' +
      'centre, what was loaded against what was packed, and the driver’s signature. ' +
      'You can view it as a PDF or print it.',
    followUp: {
      question: 'Would you like to know how to find other past collections?',
      topic: 'dispatch-history',
    },
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
    ],
    body:
      'Each row is one product.',
    steps: [
      'On hand — what is physically in the building.',
      'Committed — already promised to picking slips that haven’t gone out.',
      'Available — on hand minus committed. This is the number to trust.',
      'Low — shown when available drops below the product’s reorder level.',
    ],
    followUp: {
      question: 'Would you like to know how to see one product’s history in detail?',
      topic: 'inventory-item-summary',
    },
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
      'Click any row in Inventory. You get everything about that product in one ' +
      'place, with a chart of how its stock has gone up and down — built from the ' +
      'real movements in and out, so it matches the ledger.',
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
    ],
    body:
      'If the shelf doesn’t match the screen, count again first. If it’s still ' +
      'different, make a stock adjustment on the product in Inventory.',
    steps: [
      'Choose Add to stock (+) or Remove from stock (−).',
      'Enter the amount.',
      'Pick a reason from the list (with a note if you choose Other).',
      'Save. The system records who made it and when.',
    ],
    followUp: {
      question: 'Would you like to know how to find out why a figure changed in the first place?',
      topic: 'stock-ledger',
    },
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
      'A product is low when its available stock falls below its reorder level. Low ' +
      'items are marked in Inventory and flagged on your dashboard and the bell.\n\n' +
      'When you start a new purchase order, it offers to add everything that is ' +
      'currently low.',
    followUp: {
      question: 'Would you like to know how to raise a purchase order?',
      topic: 'po-create',
    },
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
      'The stock ledger lists every movement in and out of the warehouse — receipts, ' +
      'decanting, dispatches and adjustments — with who did it and when.\n\n' +
      'It’s the place to look when a figure changed and nobody knows why.',
    followUp: {
      question: 'Would you like to know how to correct a figure that is wrong?',
      topic: 'stock-adjustment',
    },
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
      'Remove it with a stock adjustment: choose Remove from stock and pick the ' +
      'reason that fits. It has to come off the figures — otherwise the next picking ' +
      'slip promises food that can’t be sent.',
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
      'Open Purchase Orders and choose New.',
      'Pick the supplier.',
      'Add a line per product and set the quantity. If items are low, it offers to start with those.',
      'Check the estimated total and send it.',
    ],
    followUp: {
      question: 'Would you like to know what happens with Finance once it’s sent?',
      topic: 'po-finance-email',
    },
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
      'who can change the status', 'close an order', 'is the order done',
    ],
    body:
      'An order starts as raised, then becomes received in full or in part as ' +
      'deliveries come in. Returned and follow-up are for when the supplier got it ' +
      'wrong.\n\n' +
      'Only the warehouse manager changes the status — Receiving just records what ' +
      'arrived, and the order follows.',
    followUp: {
      question: 'Would you like to know what happens when only part of an order arrives?',
      topic: 'receiving-partial',
    },
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
      'Receipts holds every delivery note and dispatch note in one place, and you can' +
      ' search it. It’s where to look when someone asks what came in or went out on a' +
      ' particular day.',
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
      'Generate this week’s slips — one slip for every approved, active centre in a cohort (Week 1 or Week 2), for a dispatch date.',
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
      'collect every other week (Week 1 or Week 2), and their quantities depend on ' +
      'how many children they have. Soup kitchens serve cooked meals. Dignity ' +
      'kitchens work differently again, which is why a slip always says which kind of' +
      ' centre it is for.',
    followUp: {
      question: 'Would you like to know how a pallet is packed from its slip?',
      topic: 'packing-pallet',
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
      'Open a slip on the Picking Slips screen and choose a worker under Assigned to.' +
      ' You can also add a helper if two people are packing it.\n\n' +
      'Or leave it unassigned and anyone free can claim it from the packing board — ' +
      'assigning is only needed when it has to be someone in particular.',
    followUp: {
      question: 'Would you like to know how packers claim a slip themselves?',
      topic: 'packing-claim',
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
      'Pick the dispatch date and the cohort (Week 1 or Week 2).',
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
      ' centre’s name, its cohort (Week 1 or Week 2), a contact person, a mobile ' +
      'number for reminders and, for ECD centres, the number of children.\n\n' +
      'Centres usually join and leave around once a quarter.',
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
      'Mark the centre inactive rather than deleting it. It stops getting new picking' +
      ' slips, but its history stays, so past reports still add up.',
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
      'reminder automatically at 8:00.\n\n' +
      'The Collection reminders screen shows tomorrow’s list: whether each email ' +
      'went, and a WhatsApp message ready for you to send by hand.',
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
      'If an email failed, choose Retry email on that centre’s row.\n\n' +
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
    roles: EVERYONE,
    screens: ['communityRequests'],
    asks: [
      'someone phoned asking for food', 'call in request', 'benevolent package',
      'a person needs help', 'community request', 'walk in asking for food',
    ],
    body:
      'When someone phones or walks in asking for a food parcel, log it here instead ' +
      'of on a note.',
    steps: [
      'Open Benevolent requests and choose Log a request.',
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
      question: 'Would you like to know how to read the chart and the ’who to act on’ list?',
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
      'The Impact Calculator turns food sent out into people served — children at ECD' +
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
      'the rates shown on the calculator (for example "how many meals does 1 kg ' +
      'feed?"). Change a rate and every figure updates.\n\n' +
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
      'On the Impact Calculator, set the period first, then export the PDF poster. It' +
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
      'Open the report and choose PDF REPORT. You get a document with our letterhead,' +
      ' the figures, chart and who-to-act-on lists; from there choose View PDF to ' +
      'download it or Print.\n\n' +
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
    title: 'Reading a report’s chart and insight',
    roles: MANAGERS_UP,
    screens: ['reporting'],
    asks: [
      'what does the chart mean', 'what is the dotted line', 'target line', 'who to act on',
      'what should I do about this report', 'highlight a bar', 'compare to last month',
      'is this good or bad',
    ],
    body:
      'Under each report you’ll see the key figures, how they compare with the period' +
      ' before, and a "who to act on" list — the centres, suppliers or products ' +
      'behind the number, with contact details.\n\n' +
      'The line across the chart is the working target. Tap a bar or point to ' +
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
      'Open the event under Volunteer events to see who is in now and who has been.\n\n' +
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
      'book volunteers', 'schedule volunteers',
    ],
    body:
      'Open Volunteer events and create the event, then add its time slots with Add ' +
      'Timeslot. On the day, volunteers sign in against it — that’s what turns a ' +
      'sign-in into hours we can count.',
    followUp: {
      question: 'Would you like to know how volunteers sign in as guests?',
      topic: 'guest-sign-in',
    },
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
      'Open Product management to add or edit a product. Name and stock code are ' +
      'required. Weight, cost and reorder level are optional, but they matter: they ' +
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
      'Open Supplier management to add a supplier or change their contact details. If' +
      ' you stop using a supplier, deactivate them rather than deleting — past orders' +
      ' still need to show who they were from.',
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
    screens: ['products', 'suppliers', 'users'],
    asks: [
      'delete a product', 'remove a supplier', 'how do I delete', 'archive',
      'it is still showing', 'get rid of an old item', 'deactivate',
    ],
    body:
      'Deactivate takes a product, supplier or user out of the lists people pick ' +
      'from. Remove goes further, but past orders and reports still read correctly ' +
      'either way.\n\n' +
      'Nothing is ever truly erased, because that would change last year’s figures.',
    followUp: {
      question: 'Would you like to know how to handle a staff member who has left?',
      topic: 'users-and-accounts',
    },
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
      'Open User management to create an account: choose the role and set the first ' +
      'password. Give the narrowest role that lets the person do their job — you can ' +
      'widen it later.\n\n' +
      'When someone leaves, deactivate their account rather than removing it, so ' +
      'their past work stays under their name.',
    followUp: {
      question: 'Would you like to know which screens each role can use?',
      topic: 'who-can-do-what',
    },
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
    body:
      'The Classification queue is where donations recorded at the gate are checked, ' +
      'valued properly and classified. It’s the place to correct a rough value ' +
      'entered in a hurry before a certificate goes out.',
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
      'Donations where the donor asked for a certificate queue up on the Section 18A ' +
      'screen, ready to be issued. Every action is recorded, because SARS needs the ' +
      'trail as much as the certificate itself.',
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
    screens: ['emailIntegration'],
    asks: [
      'email settings', 'gmail', 'emails are not sending', 'connect email',
      'who do emails come from', 'certificate emails',
    ],
    body:
      'Email settings is where the Gmail account that sends certificates, reminders ' +
      'and notifications is connected. If emails have stopped going out, check the ' +
      'connection here first — and send yourself a test email.',
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
    screens: ['emailIntegration', 'financeReport'],
    asks: [
      'finance email address', 'change the finance recipient', 'who gets the purchase orders',
      'finance did not get the po', 'send finance the report', 'report link for finance',
    ],
    body:
      'In Email settings, save the Finance recipient’s email address. New purchase ' +
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
      'The Volunteer log lists every guest sign-in at the door. If someone left ' +
      'without signing out, choose Sign out on their visit — their hours only count ' +
      'once the visit is closed.\n\n' +
      'There’s no delete button on purpose: it’s a record of who was on site.',
    followUp: {
      question: 'Would you like to know how volunteer events work?',
      topic: 'volunteer-events',
    },
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
    followUp: followUpFor(topic, role),
  };
};

/**
 * The follow-up question, resolved for this role. Dropped (null)
 * rather than offered when its topic is one the role cannot open —
 * a "Yes, show me" that answers 404 is worse than no question.
 */
export const followUpFor = (topic, role) => {
  const f = topic.followUp;
  if (!f?.question || !f.topic) return null;
  const id = f.topic === MY_ROLE ? MY_ROLE_TOPIC[role] : f.topic;
  const target = id ? byId.get(id) : null;
  if (!target || (role && !target.roles.includes(role))) return null;
  return { question: f.question, topic: { id: target.id, title: target.title } };
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
