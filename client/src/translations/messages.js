// ─────────────────────────────────────────────────────────────
// client/src/translations/messages.js
//
// Every piece of floor text that is translated, once per language.
//
// English is the source and the fallback. The Afrikaans and isiXhosa
// were drafted for this build and HAVE NOT BEEN CHECKED BY A FLUENT
// SPEAKER. Before relying on them on the floor, have someone who works
// in each language read them here: warehouse words in particular
// (pallet, flag, decanting) are a matter of what the team actually says.
//
// {name} is a value put in when the text is shown. An entry that is
// { one, other } changes with a count ({n}).
//
// Names of products, centres and people are data and are never
// translated.
// ─────────────────────────────────────────────────────────────

const en = {
  // ── Shared ──
  'common.loading': 'Loading',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saving': 'Saving',
  'common.goBack': 'Go back',
  'common.goBackHint': 'Go back to previous page',
  'common.children': '{n} children',

  // ── Language ──
  'language.label': 'Language',
  'language.choose': 'Choose your language',
  'language.saved': 'Language saved.',
  'language.savedHere': 'Saved on this phone. It will be saved to your account when there is a signal.',

  // ── Home ──
  'home.title': 'Home',
  'home.morning': 'Good morning',
  'home.afternoon': 'Good afternoon',
  'home.evening': 'Good evening',
  'home.question': 'What would you like to work on today?',
  'home.menuHint': 'Dismiss hint: everything else is in the menu',
  'task.receiving': 'Receiving',
  'task.receiving.meta': 'Record deliveries',
  'task.donation': 'Donation intake',
  'task.donation.short': 'Donation',
  'task.donation.meta': 'Log donations',
  'task.packing': 'Packing',
  'task.packing.meta': 'Pack picking slips',
  'task.decanting': 'Decanting',
  'task.decanting.meta': 'Portion bulk stock',
  'task.dispatch': 'Dispatch',
  'task.dispatch.meta': 'Dispatch pallets',
  'task.requests': 'Benevolent requests',
  'task.requests.meta': 'Log a request',
  'task.fts': 'Feed the Soil',
  'task.fts.meta': 'Log compost',
  'tabs.label': 'Warehouse tasks',
  'tabs.new': '{label}, {n} new',

  // ── Unfinished work ──
  'resume.title': { one: 'You did not finish this', other: 'You did not finish these' },
  'resume.carryOn': 'Carry on',
  'resume.throwAway': 'Throw away',
  'resume.delivery': 'Delivery · Order {id}',
  'resume.linesCounted': { one: '{n} line counted', other: '{n} lines counted' },
  'resume.startedNothing': 'Started, nothing counted yet',
  'resume.pallet': 'Pallet {id} at the gate',
  'resume.linesChecked': { one: '{n} line checked', other: '{n} lines checked' },
  'resume.started': 'Started',
  'resume.driver': 'driver {name}',
  'time.justNow': 'just now',
  'time.minutesAgo': { one: '{n} minute ago', other: '{n} minutes ago' },
  'time.hoursAgo': { one: '{n} hour ago', other: '{n} hours ago' },

  // ── No signal ──
  'offline.stuck': { one: '{n} thing could not be sent.', other: '{n} things could not be sent.' },
  'offline.tellManager': 'Tell your manager.',
  'offline.noSignalWaiting': {
    one: 'No signal. {n} thing is saved on this phone and will send when you are back in range.',
    other: 'No signal. {n} things are saved on this phone and will send when you are back in range.',
  },
  'offline.noSignal': 'No signal. Your work is saved on this phone, carry on.',
  'offline.showingSaved': 'Showing what was saved {when}.',
  'offline.atTime': 'at {time}',
  'offline.onDate': 'on {date} at {time}',
  'offline.sending': { one: 'Sending {n} thing…', other: 'Sending {n} things…' },
  'offline.waiting': { one: '{n} thing waiting to send.', other: '{n} things waiting to send.' },
  'offline.sendNow': 'Send now',

  // ── Packing: the lists ──
  'packing.title': 'Packing',
  'packing.sub': "Claim a pallet, confirm what's packed, flag what's short.",
  'packing.lists': 'Pallet lists',
  'packing.tab.floor': 'Assigned to floor',
  'packing.tab.mine': 'Claimed by me',
  'packing.tab.done': 'Done',
  'packing.searchCentre': 'Search by centre',
  'packing.searchCentrePacker': 'Search by centre or packer',
  'packing.empty.mine': "You haven't claimed anything yet. Claim one from Assigned to floor, or wait for your manager to assign one.",
  'packing.empty.floor': 'Nothing on the floor right now. Check back once your manager creates the next batch.',
  'packing.empty.done': 'Nothing finished yet today. Completed and collected pallets will show up here.',
  'packing.claim': 'Claim',
  'packing.claiming': 'Claiming…',
  'packing.goingOut': 'Going out {day}',
  'packing.itemsPacked': '{done}/{all} items packed',
  'packing.notCollected': 'Not collected in a while',
  'packing.loadFailed': 'Could not load your pallets.',
  'packing.claimFailed': 'Could not claim this pallet.',
  'status.collected': 'Collected',
  'status.complete': 'Complete',
  'status.inProgress': 'In progress',
  'status.cancelled': 'Cancelled',
  'status.pending': 'Pending',
  'day.tuesday': 'Tuesday',
  'day.thursday': 'Thursday',

  // ── Packing: one pallet ──
  'slip.oldestFirst': 'Take the oldest batch first.',
  'slip.yourPallets': 'Your pallets',
  'slip.thisPallet': 'this pallet',
  'slip.palletNo': 'Pallet {id}',
  'slip.loadFailed': 'Could not load this pallet.',
  'slip.claimThis': 'Claim this pallet',
  'slip.releaseThis': 'Release this pallet',
  'slip.releasing': 'Releasing…',
  'slip.releaseFailed': 'Could not release this pallet.',
  'slip.packing': 'Packing:',
  'slip.noItems': 'This slip has no items. Ask a manager to add order lines before this pallet goes out.',
  'slip.itemOf': 'Item {n} of {all}',
  'slip.required': 'Required {qty}',
  'slip.packed': 'Packed {qty}',
  'slip.badge.differs': 'Qty differs',
  'slip.badge.confirmed': 'Confirmed',
  'slip.badge.flagged': 'Flagged',
  'slip.badge.pending': 'Pending',
  'slip.confirm': 'Confirm',
  'slip.flag': 'Flag',
  'slip.flagItem': 'Flag item',
  'slip.comment': 'Comment (optional)',
  'slip.commentHintConfirm': "E.g. a substitution — anything worth the floor knowing that isn't a shortage.",
  'slip.commentHintFlag': 'Extra detail beyond the reason above, if there is any.',
  'slip.whyFlagged': 'Why is this flagged?',
  'slip.reason.short': 'Short quantity',
  'slip.reason.damaged': 'Damaged stock',
  'slip.reason.substituted': 'Substituted item',
  'slip.reason.other': 'Other',
  'slip.qtyPacked': 'Qty actually packed',
  'slip.comesOffStock': 'Whatever you set here comes off stock when the pallet is closed.',
  'slip.confirmFailed': 'Could not confirm this item.',
  'slip.flagFailed': 'Could not flag this item.',
  'slip.moveBetween': 'Move between items',
  'slip.previous': 'Previous item',
  'slip.next': 'Next item',
  'slip.stillNeeded': {
    one: '{n} item still needs to be confirmed or flagged.',
    other: '{n} items still need to be confirmed or flagged.',
  },
  'slip.palletRef': 'Pallet reference (optional)',
  'slip.logPacked': 'Log pallet packed',
  'slip.logging': 'Logging…',
  'slip.logFailed': 'Could not log this pallet as packed.',
  'slip.palletPacked': 'Pallet packed',
  'slip.palletCollected': 'Pallet collected',
  'slip.ref': 'Ref {ref}',
  'slip.savedOnPhone': 'No signal. What you packed is saved on this phone and sends itself when you are back in range. Carry on.',
  'slip.view.guided': 'Guided',
  'slip.view.guidedHint': 'One item at a time',
  'slip.view.form': 'Form',
  'slip.view.formHint': 'Every item at once',
  'slip.switchView': 'Tap here to switch view',

  // ── Photos ──
  'photo.add': 'Add a photo',
  'photo.another': 'Add another photo',
  'photo.saving': 'Saving photo…',
  'photo.saved': { one: '{n} photo saved', other: '{n} photos saved' },
  'photo.savedOnPhone': 'Photo saved on this phone. It sends itself when you are back in range.',
  'photo.failed': 'Could not save the photo. Try again.',
  'photo.notAPhoto': 'That is not a photo. Use the camera or choose a picture.',
  'photo.hintFlag': 'A picture of what is wrong helps your manager sort it out.',
  'photo.hintDelivery': 'Take a picture if anything arrived damaged or short.',
  'photo.delivery': 'Photos of this delivery',

  // ── Guest (Love Activist) screens ──
  // Session bar, sign-out and shared pieces
  'guest.brand.role': 'Love Activist',
  'guest.nav.label': 'Your session',
  'guest.nav.home': 'Home',
  'guest.nav.signOut': 'Sign out',
  'guest.nav.signingOut': 'Signing you out…',
  'guest.signOut.checkFailedTitle': 'We could not check your pallet.',
  'guest.signOut.checkFailedText': 'If you were packing a pallet, staff can return it to the floor.',
  'guest.signOut.tryAgain': 'Try again',
  'guest.signOut.anyway': 'Sign out anyway',
  'guest.signOut.confirmTitle': 'Sign out?',
  'guest.signOut.confirmText': 'You haven’t finished this pallet. If you sign out, it goes back to the floor for someone else to finish. Your packing so far is saved.',
  'guest.signOut.confirm': 'Sign out and return pallet',
  'guest.signOut.keepPacking': 'Keep packing',
  'guest.signOut.returnFailed': 'We could not return your pallet. Try again.',
  'guest.status.packed': 'Packed',
  'guest.status.problem': 'Problem',
  'guest.progress.label': '{done} of {all} items done',
  'guest.steps.label': 'Move between items',
  'guest.steps.previous': 'Previous item',
  'guest.steps.next': 'Next item',
  'guest.counter.fewer': 'One fewer',
  'guest.counter.more': 'One more',
  'guest.card.partner': 'A community partner',
  'guest.card.nothingListed': 'Nothing listed on it yet',
  'guest.card.thingsToPack': { one: '{n} thing to pack', other: '{n} things to pack' },
  'guest.card.goingOut': 'Going out {day}',
  'guest.help.default': 'Not sure what to do, or something looks wrong?',
  'guest.help.ask': 'Ask any staff member — they are happy to help.',
  'guest.loading': 'Loading',
  'guest.api.unreachable': 'We could not reach the system. Ask a staff member for help.',
  'guest.api.failed': 'Something went wrong.',
  // Days, who the food is for, names
  'guest.day.today': 'today',
  'guest.day.tomorrow': 'tomorrow',
  'guest.day.soon': 'soon',
  'guest.kind.ecd': 'a creche',
  'guest.kind.dignity_kitchen': 'a dignity kitchen',
  'guest.kind.soup_kitchen': 'a soup kitchen',
  'guest.kind.community': 'a community group',
  'guest.kind.other': 'a community partner',
  'guest.foodFor': 'Food for {kind}',
  'guest.name.fallback': 'there',
  // Sign in
  'guest.login.back': '← Back to start',
  'guest.login.title': 'Volunteer sign in',
  'guest.login.subtitle': 'Enter your name to start.',
  'guest.login.nameLabel': 'Your name',
  'guest.login.namePlaceholder': 'e.g. Thabo Mokoena',
  'guest.login.warehouse': 'Warehouse',
  'guest.login.warehouseChoose': 'Choose where you are today',
  'guest.login.signIn': 'Sign in',
  'guest.login.signingIn': 'Signing in…',
  'guest.login.staff': '← Staff sign in',
  'guest.login.nameRequired': 'Enter your name.',
  'guest.login.siteRequired': 'Choose the warehouse you are at.',
  'guest.login.failed': 'Could not sign you in. Try again.',
  // Home
  'guest.home.welcome': 'Welcome, {name}',
  'guest.home.ledeHeld': 'Pick up where you left off.',
  'guest.home.lede': 'Thank you for being here today. Pick a pallet below and we’ll take it one step at a time.',
  'guest.home.loading': 'Loading pallets',
  'guest.home.inProgress': 'Your pallet in progress',
  'guest.home.packedOf': '{done} of {all} packed',
  'guest.home.continue': 'Continue packing',
  'guest.home.return': 'Return this pallet',
  'guest.home.returnAsk': 'Return this pallet to the floor? Your packing so far is saved.',
  'guest.home.returnConfirm': 'Return pallet',
  'guest.home.keep': 'Keep it',
  'guest.home.listTitle': 'Pallets to pack',
  'guest.home.allTaken': 'Every pallet has someone on it. Ask a staff member what needs doing next.',
  'guest.home.tapHint': 'Tap the one you are standing at.',
  'guest.home.packThis': 'Pack this one',
  'guest.home.codeTitle': 'Have a code instead?',
  'guest.home.codeHint': 'There are 6 characters printed under the QR code on the pallet.',
  'guest.home.codeLabel': 'Pallet code',
  'guest.home.codeWrong': 'The code is 6 characters, printed under the QR code.',
  'guest.home.codeFind': 'Find this pallet',
  'guest.home.codeBusy': 'Just a moment…',
  'guest.home.help': 'New here, or not sure which pallet is yours?',
  // Packing
  'guest.pack.loading': 'Loading your pallet',
  'guest.pack.noneTitle': 'You don’t have a pallet yet',
  'guest.pack.noneLede': 'Pick one and we’ll get started.',
  'guest.pack.seePallets': 'See pallets',
  'guest.pack.reason.short': 'There isn’t enough of it',
  'guest.pack.reason.damaged': 'It looks damaged or spoiled',
  'guest.pack.reason.substituted': 'I packed something else instead',
  'guest.pack.reason.other': 'Something else',
  'guest.pack.emptyTitle': 'This pallet is empty',
  'guest.pack.emptyLede': 'There is nothing listed for {beneficiary} yet, so there is nothing to pack right now.',
  'guest.pack.packingFor': 'Packing for',
  'guest.pack.emptyNotice': 'This is not something you have done wrong — the list for this pallet has not been set up yet. A staff member needs to sort it out.',
  'guest.pack.backHome': 'Back to home',
  'guest.pack.emptyHelp': 'Please let a staff member know about this one.',
  'guest.pack.allDoneTitle': 'That’s everything',
  'guest.pack.allDoneLede': { one: 'You have been through all {n} item. One last step.', other: 'You have been through all {n} items. One last step.' },
  'guest.pack.finish': 'Finish this pallet',
  'guest.pack.finishing': 'Finishing…',
  'guest.pack.allDoneHelp': 'Spotted something you want to change first?',
  'guest.pack.problemTitle': 'What’s wrong with it?',
  'guest.pack.problemLede': 'Whatever you pick, it gets passed to a staff member. Nothing here is a mistake on your part.',
  'guest.pack.problemLegend': 'Why is there a problem?',
  'guest.pack.actuallyPacked': 'How many did you actually pack?',
  'guest.pack.noteLabel': 'Anything staff should know? (optional)',
  'guest.pack.reportIt': 'Report it',
  'guest.pack.saving': 'Saving…',
  'guest.pack.back': 'Back',
  'guest.pack.reported': 'Thanks — a staff member will look at the {product}.',
  'guest.pack.itemLede': 'Going out {day}. Take the oldest stock first.',
  'guest.pack.itemOf': 'Item {n} of {all}',
  'guest.pack.putInBox': 'Put {qty} into the box.',
  'guest.pack.howMany': 'How many did you pack?',
  'guest.pack.packedIt': 'Packed it',
  'guest.pack.problem': 'There’s a problem',
  'guest.pack.packedNice': '{product} — packed. Nice one, {name}.',
  'guest.pack.doneSoFar': 'What you’ve done so far ({n})',
  // Thank-you page
  'guest.done.thanks': 'Thank you, {name}',
  'guest.done.finishedLede': 'Your pallet is finished and on its way.',
  'guest.done.another': 'Pack another pallet',
  'guest.done.help': 'Need to tell us something? Let a staff member know before you go.',
  'guest.done.lede': 'That pallet is packed and ready to go out. Here is what you did.',
  'guest.done.unitsLabel': 'items packed into this pallet',
  'guest.done.checkedLabel': 'things checked off this pallet',
  'guest.done.thingsPacked': 'things packed',
  'guest.done.problems': { one: 'problem reported', other: 'problems reported' },
  'guest.done.whereTitle': 'Where it’s going',
  'guest.done.goesTo': 'This pallet goes to {beneficiary}, {kind}. It leaves {day}.',
  'guest.done.goesToFeeds': 'This pallet goes to {beneficiary}, {kind} that feeds {children}. It leaves {day}.',
  'guest.done.flagged': { one: 'A staff member has your report. Thank you for flagging it.', other: 'A staff member has your reports. Thank you for flagging them.' },
  'guest.done.gratitude': 'Ladles of Love could not do this without people giving up their time. Thank you for giving yours today.',
};

const af = {
  'common.loading': 'Laai',
  'common.cancel': 'Kanselleer',
  'common.save': 'Stoor',
  'common.saving': 'Stoor tans',
  'common.goBack': 'Gaan terug',
  'common.goBackHint': 'Gaan terug na die vorige bladsy',
  'common.children': '{n} kinders',

  'language.label': 'Taal',
  'language.choose': 'Kies jou taal',
  'language.saved': 'Taal gestoor.',
  'language.savedHere': 'Op hierdie foon gestoor. Dit word op jou rekening gestoor sodra daar sein is.',

  'home.title': 'Tuis',
  'home.morning': 'Goeiemôre',
  'home.afternoon': 'Goeiemiddag',
  'home.evening': 'Goeienaand',
  'home.question': 'Waaraan wil jy vandag werk?',
  'home.menuHint': 'Maak wenk toe: alles anders is in die kieslys',
  'task.receiving': 'Ontvangs',
  'task.receiving.meta': 'Teken aflewerings aan',
  'task.donation': 'Skenkings',
  'task.donation.short': 'Skenking',
  'task.donation.meta': 'Teken skenkings aan',
  'task.packing': 'Verpakking',
  'task.packing.meta': 'Pak volgens pakstrokies',
  'task.decanting': 'Oorskep',
  'task.decanting.meta': 'Verdeel grootmaatvoorraad',
  'task.dispatch': 'Versending',
  'task.dispatch.meta': 'Stuur palette uit',
  'task.requests': 'Hulpversoeke',
  'task.requests.meta': 'Teken ’n versoek aan',
  'task.fts': 'Feed the Soil',
  'task.fts.meta': 'Teken kompos aan',
  'tabs.label': 'Pakhuistake',
  'tabs.new': '{label}, {n} nuut',

  'resume.title': { one: 'Jy het dit nie klaargemaak nie', other: 'Jy het hierdie nie klaargemaak nie' },
  'resume.carryOn': 'Gaan voort',
  'resume.throwAway': 'Gooi weg',
  'resume.delivery': 'Aflewering · Bestelling {id}',
  'resume.linesCounted': { one: '{n} lyn getel', other: '{n} lyne getel' },
  'resume.startedNothing': 'Begin, nog niks getel nie',
  'resume.pallet': 'Palet {id} by die hek',
  'resume.linesChecked': { one: '{n} lyn nagegaan', other: '{n} lyne nagegaan' },
  'resume.started': 'Begin',
  'resume.driver': 'bestuurder {name}',
  'time.justNow': 'nou net',
  'time.minutesAgo': { one: '{n} minuut gelede', other: '{n} minute gelede' },
  'time.hoursAgo': { one: '{n} uur gelede', other: '{n} uur gelede' },

  'offline.stuck': { one: '{n} ding kon nie gestuur word nie.', other: '{n} dinge kon nie gestuur word nie.' },
  'offline.tellManager': 'Sê vir jou bestuurder.',
  'offline.noSignalWaiting': {
    one: 'Geen sein. {n} ding is op hierdie foon gestoor en word gestuur wanneer jy weer sein het.',
    other: 'Geen sein. {n} dinge is op hierdie foon gestoor en word gestuur wanneer jy weer sein het.',
  },
  'offline.noSignal': 'Geen sein. Jou werk is op hierdie foon gestoor, gaan voort.',
  'offline.showingSaved': 'Wys wat {when} gestoor is.',
  'offline.atTime': 'om {time}',
  'offline.onDate': 'op {date} om {time}',
  'offline.sending': { one: 'Stuur {n} ding…', other: 'Stuur {n} dinge…' },
  'offline.waiting': { one: '{n} ding wag om gestuur te word.', other: '{n} dinge wag om gestuur te word.' },
  'offline.sendNow': 'Stuur nou',

  'packing.title': 'Verpakking',
  'packing.sub': 'Eis ’n palet op, bevestig wat gepak is, merk wat kort is.',
  'packing.lists': 'Paletlyste',
  'packing.tab.floor': 'Op die vloer',
  'packing.tab.mine': 'Deur my opgeëis',
  'packing.tab.done': 'Klaar',
  'packing.searchCentre': 'Soek volgens sentrum',
  'packing.searchCentrePacker': 'Soek volgens sentrum of pakker',
  'packing.empty.mine': 'Jy het nog niks opgeëis nie. Eis een op onder Op die vloer, of wag dat jou bestuurder een toeken.',
  'packing.empty.floor': 'Daar is nou niks op die vloer nie. Kyk weer wanneer jou bestuurder die volgende klomp skep.',
  'packing.empty.done': 'Nog niks is vandag klaar nie. Voltooide en afgehaalde palette sal hier wys.',
  'packing.claim': 'Eis op',
  'packing.claiming': 'Eis tans op…',
  'packing.goingOut': 'Gaan uit {day}',
  'packing.itemsPacked': '{done}/{all} items gepak',
  'packing.notCollected': 'Lank laas afgehaal',
  'packing.loadFailed': 'Kon nie jou palette laai nie.',
  'packing.claimFailed': 'Kon nie hierdie palet opeis nie.',
  'status.collected': 'Afgehaal',
  'status.complete': 'Voltooi',
  'status.inProgress': 'Besig',
  'status.cancelled': 'Gekanselleer',
  'status.pending': 'Hangend',
  'day.tuesday': 'Dinsdag',
  'day.thursday': 'Donderdag',

  'slip.oldestFirst': 'Vat eers die oudste voorraad.',
  'slip.yourPallets': 'Jou palette',
  'slip.thisPallet': 'hierdie palet',
  'slip.palletNo': 'Palet {id}',
  'slip.loadFailed': 'Kon nie hierdie palet laai nie.',
  'slip.claimThis': 'Eis hierdie palet op',
  'slip.releaseThis': 'Gee hierdie palet terug',
  'slip.releasing': 'Gee tans terug…',
  'slip.releaseFailed': 'Kon nie hierdie palet teruggee nie.',
  'slip.packing': 'Pak:',
  'slip.noItems': 'Hierdie strokie het geen items nie. Vra ’n bestuurder om bestellyne by te voeg voordat die palet uitgaan.',
  'slip.itemOf': 'Item {n} van {all}',
  'slip.required': 'Benodig {qty}',
  'slip.packed': 'Gepak {qty}',
  'slip.badge.differs': 'Hoeveelheid verskil',
  'slip.badge.confirmed': 'Bevestig',
  'slip.badge.flagged': 'Gemerk',
  'slip.badge.pending': 'Hangend',
  'slip.confirm': 'Bevestig',
  'slip.flag': 'Merk',
  'slip.flagItem': 'Merk item',
  'slip.comment': 'Opmerking (opsioneel)',
  'slip.commentHintConfirm': 'Bv. ’n vervanging — enigiets wat die vloer moet weet wat nie ’n tekort is nie.',
  'slip.commentHintFlag': 'Ekstra besonderhede buiten die rede hierbo, as daar is.',
  'slip.whyFlagged': 'Hoekom word dit gemerk?',
  'slip.reason.short': 'Te min',
  'slip.reason.damaged': 'Beskadigde voorraad',
  'slip.reason.substituted': 'Item vervang',
  'slip.reason.other': 'Ander',
  'slip.qtyPacked': 'Hoeveelheid werklik gepak',
  'slip.comesOffStock': 'Wat jy hier insit, word van die voorraad afgetrek wanneer die palet gesluit word.',
  'slip.confirmFailed': 'Kon nie hierdie item bevestig nie.',
  'slip.flagFailed': 'Kon nie hierdie item merk nie.',
  'slip.moveBetween': 'Beweeg tussen items',
  'slip.previous': 'Vorige item',
  'slip.next': 'Volgende item',
  'slip.stillNeeded': {
    one: '{n} item moet nog bevestig of gemerk word.',
    other: '{n} items moet nog bevestig of gemerk word.',
  },
  'slip.palletRef': 'Paletverwysing (opsioneel)',
  'slip.logPacked': 'Teken palet as gepak aan',
  'slip.logging': 'Teken tans aan…',
  'slip.logFailed': 'Kon nie hierdie palet as gepak aanteken nie.',
  'slip.palletPacked': 'Palet gepak',
  'slip.palletCollected': 'Palet afgehaal',
  'slip.ref': 'Verw. {ref}',
  'slip.savedOnPhone': 'Geen sein. Wat jy gepak het, is op hierdie foon gestoor en word gestuur wanneer jy weer sein het. Gaan voort.',
  'slip.view.guided': 'Begelei',
  'slip.view.guidedHint': 'Een item op ’n slag',
  'slip.view.form': 'Vorm',
  'slip.view.formHint': 'Alle items gelyk',
  'slip.switchView': 'Tik hier om die aansig te verander',

  'photo.add': 'Voeg ’n foto by',
  'photo.another': 'Voeg nog ’n foto by',
  'photo.saving': 'Stoor foto…',
  'photo.saved': { one: '{n} foto gestoor', other: '{n} foto’s gestoor' },
  'photo.savedOnPhone': 'Foto op hierdie foon gestoor. Dit word gestuur wanneer jy weer sein het.',
  'photo.failed': 'Kon nie die foto stoor nie. Probeer weer.',
  'photo.notAPhoto': 'Dit is nie ’n foto nie. Gebruik die kamera of kies ’n prent.',
  'photo.hintFlag': '’n Foto van wat fout is, help jou bestuurder om dit reg te stel.',
  'photo.hintDelivery': 'Neem ’n foto as enigiets beskadig of kort aangekom het.',
  'photo.delivery': 'Foto’s van hierdie aflewering',

  // ── Guest (Love Activist) screens ── NOT YET TRANSLATED ──────────
  // Every line below is the ENGLISH text, kept as a placeholder so the
  // screen still reads. Each is marked TODO(translate). Replace the text
  // and delete the marker; do not leave a guess here.
  // Session bar, sign-out and shared pieces
  'guest.brand.role': 'Love Activist',  // TODO(translate)
  'guest.nav.label': 'Your session',  // TODO(translate)
  'guest.nav.home': 'Home',  // TODO(translate)
  'guest.nav.signOut': 'Sign out',  // TODO(translate)
  'guest.nav.signingOut': 'Signing you out…',  // TODO(translate)
  'guest.signOut.checkFailedTitle': 'We could not check your pallet.',  // TODO(translate)
  'guest.signOut.checkFailedText': 'If you were packing a pallet, staff can return it to the floor.',  // TODO(translate)
  'guest.signOut.tryAgain': 'Try again',  // TODO(translate)
  'guest.signOut.anyway': 'Sign out anyway',  // TODO(translate)
  'guest.signOut.confirmTitle': 'Sign out?',  // TODO(translate)
  'guest.signOut.confirmText': 'You haven’t finished this pallet. If you sign out, it goes back to the floor for someone else to finish. Your packing so far is saved.',  // TODO(translate)
  'guest.signOut.confirm': 'Sign out and return pallet',  // TODO(translate)
  'guest.signOut.keepPacking': 'Keep packing',  // TODO(translate)
  'guest.signOut.returnFailed': 'We could not return your pallet. Try again.',  // TODO(translate)
  'guest.status.packed': 'Packed',  // TODO(translate)
  'guest.status.problem': 'Problem',  // TODO(translate)
  'guest.progress.label': '{done} of {all} items done',  // TODO(translate)
  'guest.steps.label': 'Move between items',  // TODO(translate)
  'guest.steps.previous': 'Previous item',  // TODO(translate)
  'guest.steps.next': 'Next item',  // TODO(translate)
  'guest.counter.fewer': 'One fewer',  // TODO(translate)
  'guest.counter.more': 'One more',  // TODO(translate)
  'guest.card.partner': 'A community partner',  // TODO(translate)
  'guest.card.nothingListed': 'Nothing listed on it yet',  // TODO(translate)
  'guest.card.thingsToPack': { one: '{n} thing to pack', other: '{n} things to pack' },  // TODO(translate)
  'guest.card.goingOut': 'Going out {day}',  // TODO(translate)
  'guest.help.default': 'Not sure what to do, or something looks wrong?',  // TODO(translate)
  'guest.help.ask': 'Ask any staff member — they are happy to help.',  // TODO(translate)
  'guest.loading': 'Loading',  // TODO(translate)
  'guest.api.unreachable': 'We could not reach the system. Ask a staff member for help.',  // TODO(translate)
  'guest.api.failed': 'Something went wrong.',  // TODO(translate)
  // Days, who the food is for, names
  'guest.day.today': 'today',  // TODO(translate)
  'guest.day.tomorrow': 'tomorrow',  // TODO(translate)
  'guest.day.soon': 'soon',  // TODO(translate)
  'guest.kind.ecd': 'a creche',  // TODO(translate)
  'guest.kind.dignity_kitchen': 'a dignity kitchen',  // TODO(translate)
  'guest.kind.soup_kitchen': 'a soup kitchen',  // TODO(translate)
  'guest.kind.community': 'a community group',  // TODO(translate)
  'guest.kind.other': 'a community partner',  // TODO(translate)
  'guest.foodFor': 'Food for {kind}',  // TODO(translate)
  'guest.name.fallback': 'there',  // TODO(translate)
  // Sign in
  'guest.login.back': '← Back to start',  // TODO(translate)
  'guest.login.title': 'Volunteer sign in',  // TODO(translate)
  'guest.login.subtitle': 'Enter your name to start.',  // TODO(translate)
  'guest.login.nameLabel': 'Your name',  // TODO(translate)
  'guest.login.namePlaceholder': 'e.g. Thabo Mokoena',  // TODO(translate)
  'guest.login.warehouse': 'Warehouse',  // TODO(translate)
  'guest.login.warehouseChoose': 'Choose where you are today',  // TODO(translate)
  'guest.login.signIn': 'Sign in',  // TODO(translate)
  'guest.login.signingIn': 'Signing in…',  // TODO(translate)
  'guest.login.staff': '← Staff sign in',  // TODO(translate)
  'guest.login.nameRequired': 'Enter your name.',  // TODO(translate)
  'guest.login.siteRequired': 'Choose the warehouse you are at.',  // TODO(translate)
  'guest.login.failed': 'Could not sign you in. Try again.',  // TODO(translate)
  // Home
  'guest.home.welcome': 'Welcome, {name}',  // TODO(translate)
  'guest.home.ledeHeld': 'Pick up where you left off.',  // TODO(translate)
  'guest.home.lede': 'Thank you for being here today. Pick a pallet below and we’ll take it one step at a time.',  // TODO(translate)
  'guest.home.loading': 'Loading pallets',  // TODO(translate)
  'guest.home.inProgress': 'Your pallet in progress',  // TODO(translate)
  'guest.home.packedOf': '{done} of {all} packed',  // TODO(translate)
  'guest.home.continue': 'Continue packing',  // TODO(translate)
  'guest.home.return': 'Return this pallet',  // TODO(translate)
  'guest.home.returnAsk': 'Return this pallet to the floor? Your packing so far is saved.',  // TODO(translate)
  'guest.home.returnConfirm': 'Return pallet',  // TODO(translate)
  'guest.home.keep': 'Keep it',  // TODO(translate)
  'guest.home.listTitle': 'Pallets to pack',  // TODO(translate)
  'guest.home.allTaken': 'Every pallet has someone on it. Ask a staff member what needs doing next.',  // TODO(translate)
  'guest.home.tapHint': 'Tap the one you are standing at.',  // TODO(translate)
  'guest.home.packThis': 'Pack this one',  // TODO(translate)
  'guest.home.codeTitle': 'Have a code instead?',  // TODO(translate)
  'guest.home.codeHint': 'There are 6 characters printed under the QR code on the pallet.',  // TODO(translate)
  'guest.home.codeLabel': 'Pallet code',  // TODO(translate)
  'guest.home.codeWrong': 'The code is 6 characters, printed under the QR code.',  // TODO(translate)
  'guest.home.codeFind': 'Find this pallet',  // TODO(translate)
  'guest.home.codeBusy': 'Just a moment…',  // TODO(translate)
  'guest.home.help': 'New here, or not sure which pallet is yours?',  // TODO(translate)
  // Packing
  'guest.pack.loading': 'Loading your pallet',  // TODO(translate)
  'guest.pack.noneTitle': 'You don’t have a pallet yet',  // TODO(translate)
  'guest.pack.noneLede': 'Pick one and we’ll get started.',  // TODO(translate)
  'guest.pack.seePallets': 'See pallets',  // TODO(translate)
  'guest.pack.reason.short': 'There isn’t enough of it',  // TODO(translate)
  'guest.pack.reason.damaged': 'It looks damaged or spoiled',  // TODO(translate)
  'guest.pack.reason.substituted': 'I packed something else instead',  // TODO(translate)
  'guest.pack.reason.other': 'Something else',  // TODO(translate)
  'guest.pack.emptyTitle': 'This pallet is empty',  // TODO(translate)
  'guest.pack.emptyLede': 'There is nothing listed for {beneficiary} yet, so there is nothing to pack right now.',  // TODO(translate)
  'guest.pack.packingFor': 'Packing for',  // TODO(translate)
  'guest.pack.emptyNotice': 'This is not something you have done wrong — the list for this pallet has not been set up yet. A staff member needs to sort it out.',  // TODO(translate)
  'guest.pack.backHome': 'Back to home',  // TODO(translate)
  'guest.pack.emptyHelp': 'Please let a staff member know about this one.',  // TODO(translate)
  'guest.pack.allDoneTitle': 'That’s everything',  // TODO(translate)
  'guest.pack.allDoneLede': { one: 'You have been through all {n} item. One last step.', other: 'You have been through all {n} items. One last step.' },  // TODO(translate)
  'guest.pack.finish': 'Finish this pallet',  // TODO(translate)
  'guest.pack.finishing': 'Finishing…',  // TODO(translate)
  'guest.pack.allDoneHelp': 'Spotted something you want to change first?',  // TODO(translate)
  'guest.pack.problemTitle': 'What’s wrong with it?',  // TODO(translate)
  'guest.pack.problemLede': 'Whatever you pick, it gets passed to a staff member. Nothing here is a mistake on your part.',  // TODO(translate)
  'guest.pack.problemLegend': 'Why is there a problem?',  // TODO(translate)
  'guest.pack.actuallyPacked': 'How many did you actually pack?',  // TODO(translate)
  'guest.pack.noteLabel': 'Anything staff should know? (optional)',  // TODO(translate)
  'guest.pack.reportIt': 'Report it',  // TODO(translate)
  'guest.pack.saving': 'Saving…',  // TODO(translate)
  'guest.pack.back': 'Back',  // TODO(translate)
  'guest.pack.reported': 'Thanks — a staff member will look at the {product}.',  // TODO(translate)
  'guest.pack.itemLede': 'Going out {day}. Take the oldest stock first.',  // TODO(translate)
  'guest.pack.itemOf': 'Item {n} of {all}',  // TODO(translate)
  'guest.pack.putInBox': 'Put {qty} into the box.',  // TODO(translate)
  'guest.pack.howMany': 'How many did you pack?',  // TODO(translate)
  'guest.pack.packedIt': 'Packed it',  // TODO(translate)
  'guest.pack.problem': 'There’s a problem',  // TODO(translate)
  'guest.pack.packedNice': '{product} — packed. Nice one, {name}.',  // TODO(translate)
  'guest.pack.doneSoFar': 'What you’ve done so far ({n})',  // TODO(translate)
  // Thank-you page
  'guest.done.thanks': 'Thank you, {name}',  // TODO(translate)
  'guest.done.finishedLede': 'Your pallet is finished and on its way.',  // TODO(translate)
  'guest.done.another': 'Pack another pallet',  // TODO(translate)
  'guest.done.help': 'Need to tell us something? Let a staff member know before you go.',  // TODO(translate)
  'guest.done.lede': 'That pallet is packed and ready to go out. Here is what you did.',  // TODO(translate)
  'guest.done.unitsLabel': 'items packed into this pallet',  // TODO(translate)
  'guest.done.checkedLabel': 'things checked off this pallet',  // TODO(translate)
  'guest.done.thingsPacked': 'things packed',  // TODO(translate)
  'guest.done.problems': { one: 'problem reported', other: 'problems reported' },  // TODO(translate)
  'guest.done.whereTitle': 'Where it’s going',  // TODO(translate)
  'guest.done.goesTo': 'This pallet goes to {beneficiary}, {kind}. It leaves {day}.',  // TODO(translate)
  'guest.done.goesToFeeds': 'This pallet goes to {beneficiary}, {kind} that feeds {children}. It leaves {day}.',  // TODO(translate)
  'guest.done.flagged': { one: 'A staff member has your report. Thank you for flagging it.', other: 'A staff member has your reports. Thank you for flagging them.' },  // TODO(translate)
  'guest.done.gratitude': 'Ladles of Love could not do this without people giving up their time. Thank you for giving yours today.',  // TODO(translate)
};

const xh = {
  'common.loading': 'Iyalayisha',
  'common.cancel': 'Rhoxisa',
  'common.save': 'Gcina',
  'common.saving': 'Iyagcina',
  'common.goBack': 'Buyela emva',
  'common.goBackHint': 'Buyela kwiphepha elidlulileyo',
  'common.children': 'abantwana abayi-{n}',

  'language.label': 'Ulwimi',
  'language.choose': 'Khetha ulwimi lwakho',
  'language.saved': 'Ulwimi lugciniwe.',
  'language.savedHere': 'Kugcinwe kule foni. Kuza kugcinwa kwi-akhawunti yakho xa kukho isignali.',

  'home.title': 'Ekhaya',
  'home.morning': 'Molo',
  'home.afternoon': 'Molo',
  'home.evening': 'Molo',
  'home.question': 'Ungathanda ukusebenza entwenini namhlanje?',
  'home.menuHint': 'Vala icebiso: yonke enye into ikwimenyu',
  'task.receiving': 'Ukwamkela',
  'task.receiving.meta': 'Bhala izinto ezifikileyo',
  'task.donation': 'Iminikelo',
  'task.donation.short': 'Umnikelo',
  'task.donation.meta': 'Bhala iminikelo',
  'task.packing': 'Ukupakisha',
  'task.packing.meta': 'Pakisha ngeziliphu',
  'task.decanting': 'Ukwahlula',
  'task.decanting.meta': 'Yahlula isitokhwe esikhulu',
  'task.dispatch': 'Ukuthumela',
  'task.dispatch.meta': 'Thumela iipalethi',
  'task.requests': 'Izicelo zoncedo',
  'task.requests.meta': 'Bhala isicelo',
  'task.fts': 'Feed the Soil',
  'task.fts.meta': 'Bhala umgquba',
  'tabs.label': 'Imisebenzi yendlu yokugcina',
  'tabs.new': '{label}, ezintsha ezi-{n}',

  'resume.title': { one: 'Awukayigqibi le', other: 'Awukazigqibi ezi' },
  'resume.carryOn': 'Qhubeka',
  'resume.throwAway': 'Yilahle',
  'resume.delivery': 'Into efikileyo · I-odolo {id}',
  'resume.linesCounted': { one: 'umgca o-{n} ubaliwe', other: 'imigca e-{n} ibaliwe' },
  'resume.startedNothing': 'Iqalisiwe, akukabalwa nto',
  'resume.pallet': 'Ipalethi {id} esangweni',
  'resume.linesChecked': { one: 'umgca o-{n} ujongiwe', other: 'imigca e-{n} ijongiwe' },
  'resume.started': 'Iqalisiwe',
  'resume.driver': 'umqhubi {name}',
  'time.justNow': 'ngoku nje',
  'time.minutesAgo': { one: 'kumzuzu o-{n} odlulileyo', other: 'kwimizuzu e-{n} edlulileyo' },
  'time.hoursAgo': { one: 'kwiyure e-{n} edlulileyo', other: 'kwiiyure ezi-{n} ezidlulileyo' },

  'offline.stuck': { one: 'Into e-{n} ayikwazanga ukuthunyelwa.', other: 'Izinto ezi-{n} azikwazanga ukuthunyelwa.' },
  'offline.tellManager': 'Xelela umphathi wakho.',
  'offline.noSignalWaiting': {
    one: 'Akukho signali. Into e-{n} igcinwe kule foni kwaye iza kuthunyelwa xa ubuyela kwisignali.',
    other: 'Akukho signali. Izinto ezi-{n} zigcinwe kule foni kwaye ziza kuthunyelwa xa ubuyela kwisignali.',
  },
  'offline.noSignal': 'Akukho signali. Umsebenzi wakho ugcinwe kule foni, qhubeka.',
  'offline.showingSaved': 'Kuboniswa okugcinwe {when}.',
  'offline.atTime': 'ngo-{time}',
  'offline.onDate': 'ngomhla we-{date} ngo-{time}',
  'offline.sending': { one: 'Kuthunyelwa into e-{n}…', other: 'Kuthunyelwa izinto ezi-{n}…' },
  'offline.waiting': { one: 'Into e-{n} ilinde ukuthunyelwa.', other: 'Izinto ezi-{n} zilinde ukuthunyelwa.' },
  'offline.sendNow': 'Thumela ngoku',

  'packing.title': 'Ukupakisha',
  'packing.sub': 'Thatha ipalethi, qinisekisa okupakishiweyo, phawula okushotayo.',
  'packing.lists': 'Uluhlu lweepalethi',
  'packing.tab.floor': 'Ezikhoyo',
  'packing.tab.mine': 'Ezithathwe ndim',
  'packing.tab.done': 'Ezigqityiweyo',
  'packing.searchCentre': 'Khangela ngeziko',
  'packing.searchCentrePacker': 'Khangela ngeziko okanye umpakishi',
  'packing.empty.mine': 'Awukathathi nto. Thatha enye kwezi Zikhoyo, okanye linda umphathi wakho akunike enye.',
  'packing.empty.floor': 'Akukho nto ikhoyo ngoku. Buya ujonge xa umphathi wakho edale iqela elilandelayo.',
  'packing.empty.done': 'Akukho nto igqityiweyo namhlanje. Iipalethi ezigqityiweyo nezithathiweyo ziza kuvela apha.',
  'packing.claim': 'Thatha',
  'packing.claiming': 'Iyathatha…',
  'packing.goingOut': 'Iphuma {day}',
  'packing.itemsPacked': 'izinto ezi-{done}/{all} zipakishiwe',
  'packing.notCollected': 'Kudala ingathathwa',
  'packing.loadFailed': 'Ayikwazanga ukulayisha iipalethi zakho.',
  'packing.claimFailed': 'Ayikwazanga ukuyithatha le palethi.',
  'status.collected': 'Ithathiwe',
  'status.complete': 'Igqityiwe',
  'status.inProgress': 'Iyaqhubeka',
  'status.cancelled': 'Irhoxisiwe',
  'status.pending': 'Ilindile',
  'day.tuesday': 'ngoLwesibini',
  'day.thursday': 'ngoLwesine',

  'slip.oldestFirst': 'Thatha isitokhwe esidala kuqala.',
  'slip.yourPallets': 'Iipalethi zakho',
  'slip.thisPallet': 'le palethi',
  'slip.palletNo': 'Ipalethi {id}',
  'slip.loadFailed': 'Ayikwazanga ukulayisha le palethi.',
  'slip.claimThis': 'Thatha le palethi',
  'slip.releaseThis': 'Yibuyisele le palethi',
  'slip.releasing': 'Iyabuyisela…',
  'slip.releaseFailed': 'Ayikwazanga ukuyibuyisela le palethi.',
  'slip.packing': 'Upakisha:',
  'slip.noItems': 'Esi siliphu asinazinto. Cela umphathi ongeze izinto ngaphambi kokuba le palethi iphume.',
  'slip.itemOf': 'Into {n} kwezi-{all}',
  'slip.required': 'Kufuneka {qty}',
  'slip.packed': 'Kupakishwe {qty}',
  'slip.badge.differs': 'Inani liyahluka',
  'slip.badge.confirmed': 'Iqinisekisiwe',
  'slip.badge.flagged': 'Iphawuliwe',
  'slip.badge.pending': 'Ilindile',
  'slip.confirm': 'Qinisekisa',
  'slip.flag': 'Phawula',
  'slip.flagItem': 'Phawula into',
  'slip.comment': 'Inkcazo (ayinyanzelekanga)',
  'slip.commentHintConfirm': 'Umz. into etshintshiweyo — nantoni na ekufuneka yaziwe engekuko ukushota.',
  'slip.commentHintFlag': 'Iinkcukacha ezongezelelweyo ngaphandle kwesizathu esingentla, ukuba zikhona.',
  'slip.whyFlagged': 'Kutheni iphawulwa?',
  'slip.reason.short': 'Inani liyashota',
  'slip.reason.damaged': 'Isitokhwe esonakeleyo',
  'slip.reason.substituted': 'Into etshintshiweyo',
  'slip.reason.other': 'Enye',
  'slip.qtyPacked': 'Inani elipakishiweyo ngokwenene',
  'slip.comesOffStock': 'Nantoni na oyibeka apha iyasuswa kwisitokhwe xa ipalethi ivalwa.',
  'slip.confirmFailed': 'Ayikwazanga ukuyiqinisekisa le nto.',
  'slip.flagFailed': 'Ayikwazanga ukuyiphawula le nto.',
  'slip.moveBetween': 'Hamba phakathi kwezinto',
  'slip.previous': 'Into edlulileyo',
  'slip.next': 'Into elandelayo',
  'slip.stillNeeded': {
    one: 'Into e-{n} isafuna ukuqinisekiswa okanye ukuphawulwa.',
    other: 'Izinto ezi-{n} zisafuna ukuqinisekiswa okanye ukuphawulwa.',
  },
  'slip.palletRef': 'Inombolo yepalethi (ayinyanzelekanga)',
  'slip.logPacked': 'Bhala ukuba ipalethi ipakishiwe',
  'slip.logging': 'Iyabhala…',
  'slip.logFailed': 'Ayikwazanga ukubhala ukuba le palethi ipakishiwe.',
  'slip.palletPacked': 'Ipalethi ipakishiwe',
  'slip.palletCollected': 'Ipalethi ithathiwe',
  'slip.ref': 'Inombolo {ref}',
  'slip.savedOnPhone': 'Akukho signali. Oko ukupakishileyo kugcinwe kule foni kwaye kuza kuthunyelwa xa ubuyela kwisignali. Qhubeka.',
  'slip.view.guided': 'Ngokukhokelwa',
  'slip.view.guidedHint': 'Into enye ngexesha',
  'slip.view.form': 'Ifomu',
  'slip.view.formHint': 'Zonke izinto kunye',
  'slip.switchView': 'Cofa apha ukutshintsha imbonakalo',

  'photo.add': 'Yongeza ifoto',
  'photo.another': 'Yongeza enye ifoto',
  'photo.saving': 'Kugcinwa ifoto…',
  'photo.saved': { one: 'ifoto e-{n} igciniwe', other: 'iifoto ezi-{n} zigciniwe' },
  'photo.savedOnPhone': 'Ifoto igcinwe kule foni. Iza kuthunyelwa xa ubuyela kwisignali.',
  'photo.failed': 'Ayikwazanga ukugcina ifoto. Zama kwakhona.',
  'photo.notAPhoto': 'Le asiyofoto. Sebenzisa ikhamera okanye ukhethe umfanekiso.',
  'photo.hintFlag': 'Ifoto yento engalunganga inceda umphathi wakho ayilungise.',
  'photo.hintDelivery': 'Thatha ifoto ukuba kukho into efike yonakele okanye ishota.',
  'photo.delivery': 'Iifoto zale nto ifikileyo',

  // ── Guest (Love Activist) screens ── NOT YET TRANSLATED ──────────
  // Every line below is the ENGLISH text, kept as a placeholder so the
  // screen still reads. Each is marked TODO(translate). Replace the text
  // and delete the marker; do not leave a guess here.
  // Session bar, sign-out and shared pieces
  'guest.brand.role': 'Love Activist',  // TODO(translate)
  'guest.nav.label': 'Your session',  // TODO(translate)
  'guest.nav.home': 'Home',  // TODO(translate)
  'guest.nav.signOut': 'Sign out',  // TODO(translate)
  'guest.nav.signingOut': 'Signing you out…',  // TODO(translate)
  'guest.signOut.checkFailedTitle': 'We could not check your pallet.',  // TODO(translate)
  'guest.signOut.checkFailedText': 'If you were packing a pallet, staff can return it to the floor.',  // TODO(translate)
  'guest.signOut.tryAgain': 'Try again',  // TODO(translate)
  'guest.signOut.anyway': 'Sign out anyway',  // TODO(translate)
  'guest.signOut.confirmTitle': 'Sign out?',  // TODO(translate)
  'guest.signOut.confirmText': 'You haven’t finished this pallet. If you sign out, it goes back to the floor for someone else to finish. Your packing so far is saved.',  // TODO(translate)
  'guest.signOut.confirm': 'Sign out and return pallet',  // TODO(translate)
  'guest.signOut.keepPacking': 'Keep packing',  // TODO(translate)
  'guest.signOut.returnFailed': 'We could not return your pallet. Try again.',  // TODO(translate)
  'guest.status.packed': 'Packed',  // TODO(translate)
  'guest.status.problem': 'Problem',  // TODO(translate)
  'guest.progress.label': '{done} of {all} items done',  // TODO(translate)
  'guest.steps.label': 'Move between items',  // TODO(translate)
  'guest.steps.previous': 'Previous item',  // TODO(translate)
  'guest.steps.next': 'Next item',  // TODO(translate)
  'guest.counter.fewer': 'One fewer',  // TODO(translate)
  'guest.counter.more': 'One more',  // TODO(translate)
  'guest.card.partner': 'A community partner',  // TODO(translate)
  'guest.card.nothingListed': 'Nothing listed on it yet',  // TODO(translate)
  'guest.card.thingsToPack': { one: '{n} thing to pack', other: '{n} things to pack' },  // TODO(translate)
  'guest.card.goingOut': 'Going out {day}',  // TODO(translate)
  'guest.help.default': 'Not sure what to do, or something looks wrong?',  // TODO(translate)
  'guest.help.ask': 'Ask any staff member — they are happy to help.',  // TODO(translate)
  'guest.loading': 'Loading',  // TODO(translate)
  'guest.api.unreachable': 'We could not reach the system. Ask a staff member for help.',  // TODO(translate)
  'guest.api.failed': 'Something went wrong.',  // TODO(translate)
  // Days, who the food is for, names
  'guest.day.today': 'today',  // TODO(translate)
  'guest.day.tomorrow': 'tomorrow',  // TODO(translate)
  'guest.day.soon': 'soon',  // TODO(translate)
  'guest.kind.ecd': 'a creche',  // TODO(translate)
  'guest.kind.dignity_kitchen': 'a dignity kitchen',  // TODO(translate)
  'guest.kind.soup_kitchen': 'a soup kitchen',  // TODO(translate)
  'guest.kind.community': 'a community group',  // TODO(translate)
  'guest.kind.other': 'a community partner',  // TODO(translate)
  'guest.foodFor': 'Food for {kind}',  // TODO(translate)
  'guest.name.fallback': 'there',  // TODO(translate)
  // Sign in
  'guest.login.back': '← Back to start',  // TODO(translate)
  'guest.login.title': 'Volunteer sign in',  // TODO(translate)
  'guest.login.subtitle': 'Enter your name to start.',  // TODO(translate)
  'guest.login.nameLabel': 'Your name',  // TODO(translate)
  'guest.login.namePlaceholder': 'e.g. Thabo Mokoena',  // TODO(translate)
  'guest.login.warehouse': 'Warehouse',  // TODO(translate)
  'guest.login.warehouseChoose': 'Choose where you are today',  // TODO(translate)
  'guest.login.signIn': 'Sign in',  // TODO(translate)
  'guest.login.signingIn': 'Signing in…',  // TODO(translate)
  'guest.login.staff': '← Staff sign in',  // TODO(translate)
  'guest.login.nameRequired': 'Enter your name.',  // TODO(translate)
  'guest.login.siteRequired': 'Choose the warehouse you are at.',  // TODO(translate)
  'guest.login.failed': 'Could not sign you in. Try again.',  // TODO(translate)
  // Home
  'guest.home.welcome': 'Welcome, {name}',  // TODO(translate)
  'guest.home.ledeHeld': 'Pick up where you left off.',  // TODO(translate)
  'guest.home.lede': 'Thank you for being here today. Pick a pallet below and we’ll take it one step at a time.',  // TODO(translate)
  'guest.home.loading': 'Loading pallets',  // TODO(translate)
  'guest.home.inProgress': 'Your pallet in progress',  // TODO(translate)
  'guest.home.packedOf': '{done} of {all} packed',  // TODO(translate)
  'guest.home.continue': 'Continue packing',  // TODO(translate)
  'guest.home.return': 'Return this pallet',  // TODO(translate)
  'guest.home.returnAsk': 'Return this pallet to the floor? Your packing so far is saved.',  // TODO(translate)
  'guest.home.returnConfirm': 'Return pallet',  // TODO(translate)
  'guest.home.keep': 'Keep it',  // TODO(translate)
  'guest.home.listTitle': 'Pallets to pack',  // TODO(translate)
  'guest.home.allTaken': 'Every pallet has someone on it. Ask a staff member what needs doing next.',  // TODO(translate)
  'guest.home.tapHint': 'Tap the one you are standing at.',  // TODO(translate)
  'guest.home.packThis': 'Pack this one',  // TODO(translate)
  'guest.home.codeTitle': 'Have a code instead?',  // TODO(translate)
  'guest.home.codeHint': 'There are 6 characters printed under the QR code on the pallet.',  // TODO(translate)
  'guest.home.codeLabel': 'Pallet code',  // TODO(translate)
  'guest.home.codeWrong': 'The code is 6 characters, printed under the QR code.',  // TODO(translate)
  'guest.home.codeFind': 'Find this pallet',  // TODO(translate)
  'guest.home.codeBusy': 'Just a moment…',  // TODO(translate)
  'guest.home.help': 'New here, or not sure which pallet is yours?',  // TODO(translate)
  // Packing
  'guest.pack.loading': 'Loading your pallet',  // TODO(translate)
  'guest.pack.noneTitle': 'You don’t have a pallet yet',  // TODO(translate)
  'guest.pack.noneLede': 'Pick one and we’ll get started.',  // TODO(translate)
  'guest.pack.seePallets': 'See pallets',  // TODO(translate)
  'guest.pack.reason.short': 'There isn’t enough of it',  // TODO(translate)
  'guest.pack.reason.damaged': 'It looks damaged or spoiled',  // TODO(translate)
  'guest.pack.reason.substituted': 'I packed something else instead',  // TODO(translate)
  'guest.pack.reason.other': 'Something else',  // TODO(translate)
  'guest.pack.emptyTitle': 'This pallet is empty',  // TODO(translate)
  'guest.pack.emptyLede': 'There is nothing listed for {beneficiary} yet, so there is nothing to pack right now.',  // TODO(translate)
  'guest.pack.packingFor': 'Packing for',  // TODO(translate)
  'guest.pack.emptyNotice': 'This is not something you have done wrong — the list for this pallet has not been set up yet. A staff member needs to sort it out.',  // TODO(translate)
  'guest.pack.backHome': 'Back to home',  // TODO(translate)
  'guest.pack.emptyHelp': 'Please let a staff member know about this one.',  // TODO(translate)
  'guest.pack.allDoneTitle': 'That’s everything',  // TODO(translate)
  'guest.pack.allDoneLede': { one: 'You have been through all {n} item. One last step.', other: 'You have been through all {n} items. One last step.' },  // TODO(translate)
  'guest.pack.finish': 'Finish this pallet',  // TODO(translate)
  'guest.pack.finishing': 'Finishing…',  // TODO(translate)
  'guest.pack.allDoneHelp': 'Spotted something you want to change first?',  // TODO(translate)
  'guest.pack.problemTitle': 'What’s wrong with it?',  // TODO(translate)
  'guest.pack.problemLede': 'Whatever you pick, it gets passed to a staff member. Nothing here is a mistake on your part.',  // TODO(translate)
  'guest.pack.problemLegend': 'Why is there a problem?',  // TODO(translate)
  'guest.pack.actuallyPacked': 'How many did you actually pack?',  // TODO(translate)
  'guest.pack.noteLabel': 'Anything staff should know? (optional)',  // TODO(translate)
  'guest.pack.reportIt': 'Report it',  // TODO(translate)
  'guest.pack.saving': 'Saving…',  // TODO(translate)
  'guest.pack.back': 'Back',  // TODO(translate)
  'guest.pack.reported': 'Thanks — a staff member will look at the {product}.',  // TODO(translate)
  'guest.pack.itemLede': 'Going out {day}. Take the oldest stock first.',  // TODO(translate)
  'guest.pack.itemOf': 'Item {n} of {all}',  // TODO(translate)
  'guest.pack.putInBox': 'Put {qty} into the box.',  // TODO(translate)
  'guest.pack.howMany': 'How many did you pack?',  // TODO(translate)
  'guest.pack.packedIt': 'Packed it',  // TODO(translate)
  'guest.pack.problem': 'There’s a problem',  // TODO(translate)
  'guest.pack.packedNice': '{product} — packed. Nice one, {name}.',  // TODO(translate)
  'guest.pack.doneSoFar': 'What you’ve done so far ({n})',  // TODO(translate)
  // Thank-you page
  'guest.done.thanks': 'Thank you, {name}',  // TODO(translate)
  'guest.done.finishedLede': 'Your pallet is finished and on its way.',  // TODO(translate)
  'guest.done.another': 'Pack another pallet',  // TODO(translate)
  'guest.done.help': 'Need to tell us something? Let a staff member know before you go.',  // TODO(translate)
  'guest.done.lede': 'That pallet is packed and ready to go out. Here is what you did.',  // TODO(translate)
  'guest.done.unitsLabel': 'items packed into this pallet',  // TODO(translate)
  'guest.done.checkedLabel': 'things checked off this pallet',  // TODO(translate)
  'guest.done.thingsPacked': 'things packed',  // TODO(translate)
  'guest.done.problems': { one: 'problem reported', other: 'problems reported' },  // TODO(translate)
  'guest.done.whereTitle': 'Where it’s going',  // TODO(translate)
  'guest.done.goesTo': 'This pallet goes to {beneficiary}, {kind}. It leaves {day}.',  // TODO(translate)
  'guest.done.goesToFeeds': 'This pallet goes to {beneficiary}, {kind} that feeds {children}. It leaves {day}.',  // TODO(translate)
  'guest.done.flagged': { one: 'A staff member has your report. Thank you for flagging it.', other: 'A staff member has your reports. Thank you for flagging them.' },  // TODO(translate)
  'guest.done.gratitude': 'Ladles of Love could not do this without people giving up their time. Thank you for giving yours today.',  // TODO(translate)
};

export const MESSAGES = { en, af, xh };
