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
  if (!Number.isInteger(value)) return `${def.label} must be a whole number.`;
  if (value < def.min || value > def.max) return `${def.label} must be from ${def.min} to ${def.max}.`;
  return null;
};
