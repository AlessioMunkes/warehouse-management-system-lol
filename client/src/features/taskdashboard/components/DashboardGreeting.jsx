// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/DashboardGreeting.jsx
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
const timeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function DashboardGreeting({ name }) {
  return (
    <div>
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-ink">
        {timeGreeting()}{name ? `, ${name}` : ''}!
      </h1>
      <p className="mt-2 text-base text-muted-foreground">
        What would you like to work on today?
      </p>
    </div>
  );
}
