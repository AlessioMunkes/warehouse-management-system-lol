// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/DashboardGreeting.jsx
//
// Deliberately not a reuse of Greeting.jsx ("Hi {name}! What are you
// working on today?") — that one is the staff task-grid's plain
// version. This is the dashboard-specific one: time-of-day aware,
// carries today's date, and only falls back to the generic line when
// there's nothing more specific to say yet (summary is still
// loading, or genuinely empty).
// ─────────────────────────────────────────────────────────────
const timeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const today = () => new Date().toLocaleDateString('en-ZA', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

export default function DashboardGreeting({ name, summaryLine }) {
  return (
    <div>
      <h1 className="text-2xl font-medium">
        {timeGreeting()}{name ? `, ${name}` : ''}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {today()}{summaryLine ? ` — ${summaryLine}` : ''}
      </p>
    </div>
  );
}
