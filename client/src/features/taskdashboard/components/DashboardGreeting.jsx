// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/DashboardGreeting.jsx
//
// Deliberately not a reuse of Greeting.jsx ("Hi {name}! What are you
// working on today?") — that one is the staff task-grid's plain
// version. This is the dashboard-specific one: time-of-day aware,
// and only shows a line below when there's something to say yet
// (summary is still loading, or genuinely empty).
// ─────────────────────────────────────────────────────────────
const timeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function DashboardGreeting({ name, summaryLine }) {
  return (
    <div>
      <h1 className="text-2xl font-medium">
        {timeGreeting()}{name ? `, ${name}` : ''}!
      </h1>
      {summaryLine ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {summaryLine.charAt(0).toUpperCase() + summaryLine.slice(1)}
        </p>
      ) : null}
    </div>
  );
}
