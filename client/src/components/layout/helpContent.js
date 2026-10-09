// ─────────────────────────────────────────────────────────────
// client/src/components/layout/helpContent.js
//
// What the Help window in the account menu says, for each role. A role
// is shown only its own screens.
//
// Each topic is a job someone does, named the way its screen is named,
// with the steps in the order the screen asks for them. When a screen
// changes, change its topic here.
//
// The warehouse-staff topics are also in translations/phrases.js, so they read
// in Afrikaans and isiXhosa: a line changed here needs changing there.
// ─────────────────────────────────────────────────────────────

const WORKER = [
  { title: 'Receive a delivery',
    steps: [
      'Open Receiving, choose the supplier, then the order the driver’s note belongs to.',
      'Only orders a manager has approved are listed. If the order is missing, ask your manager to approve it.',
      'Count each line and enter what arrived. Tap “Everything as ordered” if it all matches.',
      'For fresh food, enter the date on the box and say whether it goes to the dry store or the cold room.',
      'Ask the driver to sign, then finish the delivery. The stock is added straight away.',
      'If something is short, save it anyway. The order becomes Partially received and is flagged Follow-up required for your manager.',
    ] },
  { title: 'Pack a pallet',
    steps: [
      'Open Packing. “On the floor” lists every pallet waiting to be packed this week, whatever day it goes out.',
      'Tap Claim on a pallet to make it yours. You can release it again as long as you have not packed anything.',
      'For each item, enter how many you packed and confirm. Take the oldest stock first.',
      'If an item is short, damaged or swapped for something else, tap Flag item and say why.',
      'When every item is confirmed or flagged, tap Log pallet packed.',
    ] },
  { title: 'Decant bulk stock',
    steps: [
      'Open Decanting and choose the product in front of you. Only products marked decantable are listed.',
      'Weigh the bulk amount and enter the weight, then the kilograms the centres need this week.',
      'The weight cannot be more than is in stock. If the screen refuses it, weigh again or ask your manager to check the stock.',
      'Use the recommended bag plan, or choose your own bag sizes.',
      'Fill the bags, enter anything that was spilled or spoiled, then save. A saved sheet cannot be changed.',
    ] },
  { title: 'Release a pallet at the gate',
    steps: [
      'Open Dispatch and choose the pallet the driver has come for.',
      'Check each line against the pallet. Change the number only if what is loaded is different from what was packed.',
      'Enter the driver’s name, ask them to sign, then confirm the collection.',
      'The stock comes off the system at this point, not when the pallet was packed.',
      'A pallet collected late or on another day still goes through. It is recorded for your manager.',
    ] },
  { title: 'Record a donation',
    steps: [
      'Open Donation intake. Enter the donor’s name, or leave it blank for an anonymous donation.',
      'Say whether the donor wants a Section 18A certificate and whether the donation is food.',
      'Add each item: search for the product, or mark it as an unknown product and describe it.',
      'Enter the estimated value, check the review screen, then submit.',
      'Unknown items go to a manager to classify. Everything else is recorded at once.',
    ] },
  { title: 'Benevolent requests',
    steps: [
      'To log a request, open Benevolent requests and enter who called, what they asked for and when they will collect.',
      'A manager approves the request and chooses the items before anyone packs.',
      'Claim an approved request, fetch the items, then confirm what went out.',
    ] },
  { title: 'Feed the Soil',
    steps: [
      'Assign a kit: enter the owner’s name and suburb. No address or phone number is kept.',
      'Log compost: choose the kit, then enter the kilograms collected and the date.',
      'Mark a record dispatched when the compost has gone to a farmer or drop-off point.',
    ] },
  { title: 'Whole numbers and part quantities',
    steps: [
      'Things that are counted, like cans, are whole numbers everywhere. The screen will ask for a whole number.',
      'Only products marked decantable, like rice or oil, can be a part quantity.',
    ] },
  { title: 'Working with no signal',
    steps: [
      'Carry on. Deliveries, packing, decanting, collections, donations and requests are saved on the phone.',
      'They send themselves when you are back in range. The bar at the top says what is waiting.',
      'Do not record the same thing again.',
    ] },
  { title: 'Photos, past records and alerts',
    steps: [
      'Use the camera button on a delivery or a flagged item to add a photo for your manager.',
      'Receiving, Decanting and Dispatch each have a History link to past records.',
      'Tap the bell to turn on alerts for new pallets on this phone.',
    ] },
  { title: 'Your account',
    steps: [
      'Tap your name to see your profile, change the language, or log out.',
      'Your name and email are changed by an admin. Ask them if something is wrong.',
    ] },
];

const MANAGER = [
  { title: 'Dashboard',
    steps: [
      'The dashboard shows what needs attention today: orders to approve, follow-ups, low stock and pallets not collected.',
      'Use Customise dashboard to add, remove and move widgets. The layout is saved to your account.',
      'The + button in the top bar starts a picking slip, purchase order, beneficiary, benevolent request, stock adjustment or report.',
    ] },
  { title: 'Purchase orders',
    steps: [
      'Raise an order with New purchase order: choose the supplier, the expected date and the lines. Finance is emailed when it is raised.',
      'An order starts as Pending approval. Approve it before it can be received on the floor.',
      'Mark as in transit when the supplier confirms it is on its way.',
      'A delivery in full completes the order. A short delivery leaves it Partially received, flagged Follow-up required with what was short.',
      'On a flagged order, Create follow-up order raises a second order for the rest. Both complete when that order is received.',
      'Or use Reopen for receiving if the supplier will deliver the rest against the same order, or Close order to accept it as it is.',
      'Mark as returned closes an order with a reason. It does not change stock: adjust that on Inventory.',
      'Record follow-up flags an order that is late or needs chasing before anything has arrived.',
    ] },
  { title: 'Receipts',
    steps: [
      'Receipts lists every delivery note and dispatch note. Open one to view or print it.',
    ] },
  { title: 'Inventory and stock ledger',
    steps: [
      'Inventory shows what is on hand, what is committed to packed pallets, and what is available.',
      'A product is marked low when available stock falls to its reorder threshold.',
      'Adjust stock from a product’s panel. A reason is required, and counted items take whole numbers only.',
      'The stock ledger lists every movement: received, dispatched, decanted, adjusted and wastage.',
    ] },
  { title: 'Picking slips',
    steps: [
      'Generate a cohort’s slips for its pickup day. They can be generated ahead and packed on any day before.',
      'Slip lines come from the current recipe and each centre’s child count, or from the centre’s own standing order.',
      'Create a new slip makes one slip for one centre. Use the override for a make-up delivery on another day.',
      'Open a slip to assign a packer, edit its lines while it is still on the floor, or release a claimed pallet.',
      'Slips marked not collected need a decision: the pallet is still in the warehouse.',
    ] },
  { title: 'Beneficiaries, reminders and the calendar',
    steps: [
      'Beneficiaries holds each centre: its cohort, child count, contact and whether it is active and approved.',
      'Only active, approved centres get slips, and a pallet cannot be released to an inactive centre.',
      'Collection reminders shows the messages sent to centres before their pickup day.',
      'The operating calendar sets each cohort’s pickup day, public holidays and closures.',
    ] },
  { title: 'Benevolent requests',
    steps: [
      'Requests logged on the floor wait here for approval.',
      'Approve a request by choosing the items and quantities. Stock is set aside, and pallets come first if stock runs short.',
      'Decline a request with a reason. A request flagged “items short” needs other items chosen.',
    ] },
  { title: 'Programmes',
    steps: [
      'Feed the Soil shows the collection kits and compost logged, with totals.',
      'Volunteer events is where events and time slots are set up and volunteers are booked in.',
    ] },
  { title: 'Reports',
    steps: [
      'Operations reports chart dispatch, spend, wastage and collection over a period, and can be saved and exported.',
      'The impact report turns the same data into figures for funders, and can be printed as a PDF.',
    ] },
  { title: 'Donations',
    steps: [
      'The classification queue lists donated items the floor could not match. Classify each one to finish the donation.',
      'Section 18A lists donors who asked for a certificate, the form sent to them, and its status.',
    ] },
  { title: 'Your account',
    steps: [
      'Click your name for your profile, this help, the shortcuts and log out.',
      'Your name, email and role are changed by an admin.',
    ] },
];

const ADMIN = [
  { title: 'Dashboard and finance report',
    steps: [
      'The dashboard shows accounts, master data and what needs an admin’s attention. Use Customise dashboard to arrange it.',
      'The finance report is the warehouse movement report Finance works from. It can be shared by a link.',
    ] },
  { title: 'Users',
    steps: [
      'Add a user with their name, email and role. They are emailed a link to choose a password.',
      'Roles: warehouse staff work the floor, managers run the day-to-day, admins look after accounts and set-up.',
      'Edit a user to change their name, email or role. Users cannot change these themselves.',
      'Deactivate an account when someone leaves. They are signed out and cannot log in.',
    ] },
  { title: 'Products',
    steps: [
      'Add a product with its name, SKU and the unit stock is counted in.',
      'Weight and cost are optional, but without them purchase orders cannot work out weight or cost.',
      'The reorder threshold is the level at which the product is marked low. Enter 0 to turn the warning off.',
      'Tick “can be decanted” for food kept loose and portioned out. Only those appear on Decanting and can be part quantities.',
      'Deactivate a product to stop it being ordered. Delete is for a product added by mistake.',
    ] },
  { title: 'Suppliers',
    steps: [
      'Add a supplier with its contact details and the products it supplies.',
      'A purchase order can only include products its supplier is listed as supplying.',
      'Deactivate a supplier to stop new orders. Existing orders keep their history.',
    ] },
  { title: 'Settings',
    steps: [
      'Recipes set what goes on a picking slip per child. Summer and winter each have a start date, and an override covers set dates.',
      'The child band rounds each centre’s child count up, so nobody in a band is left short.',
      'Centres that keep their own standing order are listed under Recipes.',
      'Unit sizes say what a crate, bag, box or punnet weighs, so stock in those units can be compared with kilograms.',
      'Email connects the organisation’s Gmail account and sets the Finance address purchase orders are sent to.',
    ] },
  { title: 'Logs',
    steps: [
      'The activity log shows what staff did and when, and the door sign-in log for volunteers.',
      'The archive holds records that were removed, and can restore them.',
      'Message history lists every email and message the system sent, and whether it was delivered.',
    ] },
  { title: 'Donations',
    steps: [
      'The classification queue and Section 18A are shared with managers: classify unmatched items and follow certificate requests.',
    ] },
  { title: 'Your account',
    steps: [
      'Click your name for your profile, this help, the shortcuts and log out.',
    ] },
];

export const helpFor = (role) =>
  role === 'warehouse_worker' ? WORKER
  : role === 'admin' ? ADMIN
  : MANAGER;
