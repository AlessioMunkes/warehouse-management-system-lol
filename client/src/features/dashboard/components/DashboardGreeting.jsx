// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/components/DashboardGreeting.jsx
//
// Deliberately not a reuse of Greeting.jsx ("Hi {name}! What are you
// working on today?") — that one is the staff task-grid's plain
// version. This is the dashboard-specific one: time-of-day aware.
//
// No stats line under the prompt any more — every count it used to
// carry ("19 slips to pack · 15 at the gate") is now on the task
// tile it actually belongs to (see TaskDashboardPage.jsx), so this
// line was just repeating them a second time in a place with less
// context, not adding information.
//
// The heading itself is sized to be the loudest thing on the screen,
// the way an actual landing greeting (Claude's own new-chat screen,
// among others) is — a name and a time of day is the one line this
// screen exists to say, not a caption under something else.
// ─────────────────────────────────────────────────────────────
// The staff floor's dashboard. Manager and admin dashboards open with
// the ordinary PageHeader instead, so they match the screens around them.
import { timeGreeting } from '../timeGreeting';
import { useT } from '../../../i18n';

// timeGreeting() answers in English; this is the same three, by key.
const GREETING_KEYS = { 'Good morning': 'home.morning', 'Good afternoon': 'home.afternoon', 'Good evening': 'home.evening' };

export default function DashboardGreeting({ name }) {
  const t = useT();
  const english = timeGreeting();
  const greeting = GREETING_KEYS[english] ? t(GREETING_KEYS[english]) : english;
  return (
    <div>
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-ink">
        {greeting}{name ? `, ${name}` : ''}!
      </h1>
      <p className="mt-2 text-base text-muted-foreground">
        {t('home.question')}
      </p>
    </div>
  );
}
