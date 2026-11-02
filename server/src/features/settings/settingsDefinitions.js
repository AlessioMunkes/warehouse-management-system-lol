// ─────────────────────────────────────────────────────────────
// server/src/features/settings/settingsDefinitions.js
//
// Every value an admin can change from the Settings screen, with the
// default it falls back to. Each default is the constant the code had
// before it became a setting, so an untouched setting behaves exactly
// as before.
//
//   key       — what app_settings.key stores
//   section   — which part of the Settings screen shows it
//   label / help — what the screen says about it
//   default   — used when nothing has been saved
//   min / max — whole numbers only, inclusive
//   type      — 'text' for wording (maxLength, multiline); a whole
//               number otherwise
//   unit      — shown beside the input
//   check     — (value, all) => error message or null, for rules that
//               involve another setting
// ─────────────────────────────────────────────────────────────

export const SETTINGS = Object.freeze({
  'dispatch.nonCollectionCutoffHour': {
    section: 'notifications',
    label: 'Not-collected cut-off',
    help: 'Pallets still at the gate after this hour (warehouse time) are marked not collected.',
    default: 15, min: 0, max: 23, unit: ':00',
  },
  'reminders.runHour': {
    section: 'notifications',
    label: 'Collection reminder send time',
    help: 'Send reminders for tomorrow\'s collections at this hour (warehouse time).',
    default: 8, min: 0, max: 23, unit: ':00',
  },
  'stock.expiryWarningFirstDays': {
    section: 'stock',
    label: 'First expiry warning',
    help: 'Warn managers this many days before a delivered batch expires.',
    default: 14, min: 2, max: 90, unit: 'days before',
    check: (value, all) => (value <= all['stock.expiryWarningSecondDays']
      ? 'The first warning has to come before the second.' : null),
  },
  'stock.expiryWarningSecondDays': {
    section: 'stock',
    label: 'Second expiry warning',
    help: 'Send a second, urgent warning this many days before.',
    default: 7, min: 1, max: 60, unit: 'days before',
    check: (value, all) => (value >= all['stock.expiryWarningFirstDays']
      ? 'The second warning has to come after the first.' : null),
  },
  // What one crate, bag, box or punnet weighs. Stock counted in one of
  // these is packed and received by weight, and these are what turn one
  // into the other (features/units/unitConversion.js). 0 is "not set":
  // that unit is then not converted, which is how it was before.
  'units.crateKg': {
    section: 'stock',
    label: 'One crate weighs',
    help: 'Used when stock is counted in crates but packed or received by weight. Enter 0 to leave crates unconverted.',
    default: 0, min: 0, max: 1000, unit: 'kg',
  },
  'units.bagKg': {
    section: 'stock',
    label: 'One bag weighs',
    help: 'Used when stock is counted in bags but packed or received by weight. Enter 0 to leave bags unconverted.',
    default: 0, min: 0, max: 1000, unit: 'kg',
  },
  'units.boxKg': {
    section: 'stock',
    label: 'One box weighs',
    help: 'Used when stock is counted in boxes but packed or received by weight. Enter 0 to leave boxes unconverted.',
    default: 0, min: 0, max: 1000, unit: 'kg',
  },
  'units.punnetGrams': {
    section: 'stock',
    label: 'One punnet weighs',
    help: 'Used when stock is counted in punnets but packed or received by weight. Enter 0 to leave punnets unconverted.',
    default: 0, min: 0, max: 5000, unit: 'g',
  },
  // The operating calendar (managers set these on its screen, not on
  // admin Settings): the weekday each cohort collects on, 1 = Monday ..
  // 6 = Saturday. The cohorts keep their names; only the day moves.
  'calendar.tuesdayCohortWeekday': {
    section: 'calendar',
    label: 'Tuesday cohort collects on',
    help: 'The weekday the Tuesday cohort collects (1 Monday … 6 Saturday).',
    default: 2, min: 1, max: 6, unit: '',
    check: (value, all) => (value === all['calendar.thursdayCohortWeekday']
      ? 'The two cohorts need different collection days.' : null),
  },
  'calendar.thursdayCohortWeekday': {
    section: 'calendar',
    label: 'Thursday cohort collects on',
    help: 'The weekday the Thursday cohort collects (1 Monday … 6 Saturday).',
    default: 4, min: 1, max: 6, unit: '',
    check: (value, all) => (value === all['calendar.tuesdayCohortWeekday']
      ? 'The two cohorts need different collection days.' : null),
  },
  // Recipes are an amount per child. A centre's child count is rounded
  // up to a multiple of this before its slip is worked out, so centres
  // are supplied in bands (21 to 25 children all get the slip for 25).
  // 1 uses the exact count.
  'recipes.childBand': {
    section: 'recipes',
    label: 'Children per band',
    help: 'Round each centre’s child count up to a multiple of this before working out its slip. Enter 1 to use the exact count.',
    default: 5, min: 1, max: 50, unit: 'children',
  },
  // Loose products (oil, maize meal, rice: anything decantable, in a
  // weighed or poured unit) are rounded UP to this many decimal places
  // on a slip. 0 gives whole units, so 3.3 L of oil becomes 4 L.
  // Counted units and products that are not decantable are always whole.
  'recipes.loosePlaces': {
    section: 'recipes',
    label: 'Decimal places for loose products',
    help: 'Round loose amounts (oil, maize meal, rice) up to this many decimal places on a slip. 0 gives whole units: 3.3 L becomes 4 L.',
    default: 0, min: 0, max: 2, unit: 'decimal places',
  },
  // How long a sign-in lasts. Were STAFF_SESSION_HOURS (config/cookie.js)
  // and the guest SESSION_HOURS in volunteer.routes / slipAccess.
  // A volunteer who does nothing for this long is signed out (was
  // GUEST_IDLE_HOURS in session.repository, migration 067).
  'accounts.guestIdleHours': {
    section: 'accounts',
    label: 'Sign out an idle volunteer after',
    help: 'A volunteer who does nothing for this long is signed out, as if they had left.',
    default: 4, min: 1, max: 12, unit: 'hours',
    check: (value, all) => (value > all['accounts.guestSessionHours']
      ? 'The idle sign-out cannot be longer than the volunteer sign-in itself.' : null),
  },
  // The Finance report link emailed to finance (was REPORT_LINK_DAYS).
  'finance.reportLinkDays': {
    section: 'accounts',
    label: 'Finance report link lifetime',
    help: 'The emailed Finance report link stops working after this many days, or when a new one is sent.',
    default: 30, min: 1, max: 90, unit: 'days',
  },
  // Feed the Soil: a kit given out this long ago with no compost logged
  // is flagged for follow-up (was IDLE_KIT_MONTHS).
  'feedTheSoil.idleKitMonths': {
    section: 'notifications',
    label: 'Flag a compost kit as idle after',
    help: 'A Feed the Soil kit given out this many months ago with no compost logged is flagged for someone to follow up.',
    default: 3, min: 1, max: 24, unit: 'months',
  },
  // ── Organisation ──
  // The letterhead on printed delivery and dispatch notes (was the
  // build-time VITE_WAREHOUSE_NAME / VITE_WAREHOUSE_ADDRESS).
  'documents.letterheadName': {
    section: 'organisation',
    type: 'text',
    label: 'Letterhead name',
    help: 'The name at the top of printed delivery and dispatch notes.',
    default: 'Ladles of Love, Cape Town Warehouse', maxLength: 120,
  },
  'documents.letterheadAddress': {
    section: 'organisation',
    type: 'text', multiline: true,
    label: 'Letterhead address',
    help: 'The address under it, one line per line.',
    default: 'Unit 4, Hewett Park\n17 Hewett Ave, Epping\nCape Town, 7460', maxLength: 300,
  },
  // A donation worth at least this much needs the donor's details for a
  // Section 18A tax certificate. Was only in donation_settings, with no
  // screen; that row is still read when this has never been saved.
  'donations.section18aThreshold': {
    section: 'organisation',
    label: 'Section 18A certificate from',
    help: 'Donations worth at least this much (in rand) ask for the donor’s details so a Section 18A tax certificate can be issued.',
    default: 1000, min: 0, max: 1000000, unit: 'rand',
  },
  'accounts.staffSessionHours': {
    section: 'accounts',
    label: 'Staff sign-in lasts',
    help: 'Staff are signed out this many hours after signing in. Shorter is safer on shared phones and tablets.',
    default: 8, min: 1, max: 24, unit: 'hours',
  },
  'accounts.guestSessionHours': {
    section: 'accounts',
    label: 'Volunteer sign-in lasts',
    help: 'A volunteer signed in with the gate code or a slip QR code stays signed in this long.',
    default: 12, min: 1, max: 24, unit: 'hours',
    check: (value, all) => (value < all['accounts.guestIdleHours']
      ? 'The volunteer sign-in cannot be shorter than the idle sign-out.' : null),
  },
  'invites.linkDays': {
    section: 'accounts',
    label: 'Invite link lifetime',
    help: 'Invite links stop working after this many days.',
    default: 7, min: 1, max: 30, unit: 'days',
  },
});

export const SETTING_KEYS = Object.keys(SETTINGS);
export const isSettingKey = (key) => Object.prototype.hasOwnProperty.call(SETTINGS, key);

export const defaults = () =>
  Object.fromEntries(SETTING_KEYS.map((key) => [key, SETTINGS[key].default]));

// The error for one value on its own, or null.
export const validateValue = (key, value) => {
  const def = SETTINGS[key];
  if (def.type === 'text') {
    if (typeof value !== 'string' || value.trim() === '') return `${def.label} cannot be empty.`;
    if (value.length > def.maxLength) return `${def.label} must be at most ${def.maxLength} characters.`;
    return null;
  }
  if (!Number.isInteger(value)) return `${def.label} must be a whole number.`;
  if (value < def.min || value > def.max) return `${def.label} must be from ${def.min} to ${def.max}.`;
  return null;
};
