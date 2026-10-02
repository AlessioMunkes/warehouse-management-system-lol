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
    help: 'After this hour (warehouse time) a pallet still waiting at the gate is flagged as not collected.',
    default: 15, min: 0, max: 23, unit: ':00',
  },
  'reminders.runHour': {
    section: 'notifications',
    label: 'Collection reminder send time',
    help: 'Reminders for tomorrow\'s collections go out at this hour, warehouse time.',
    default: 8, min: 0, max: 23, unit: ':00',
  },
  'stock.expiryWarningFirstDays': {
    section: 'stock',
    label: 'First expiry warning',
    help: 'Managers are told when a delivered batch is this many days from its expiry date.',
    default: 14, min: 2, max: 90, unit: 'days before',
    check: (value, all) => (value <= all['stock.expiryWarningSecondDays']
      ? 'The first warning has to come before the second.' : null),
  },
  'stock.expiryWarningSecondDays': {
    section: 'stock',
    label: 'Second expiry warning',
    help: 'A second, more urgent notice this many days out.',
    default: 7, min: 1, max: 60, unit: 'days before',
    check: (value, all) => (value >= all['stock.expiryWarningFirstDays']
      ? 'The second warning has to come after the first.' : null),
  },
  'invites.linkDays': {
    section: 'accounts',
    label: 'Invite link lifetime',
    help: 'How long a new account\'s invite link works before it has to be resent.',
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
