// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/StatTile.jsx
//
// The number-with-an-icon card, lifted out of ManagerDashboardPage so
// the worker and admin dashboards use it too. There were about to be
// three near-copies of it, differing only in how they got the padding
// slightly wrong.
//
// `warn` turns the tile red ONLY when the value is above zero: a count
// of nothing is not a warning, and colouring an empty state red trains
// people to ignore the colour.
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

export default function StatTile({ icon: Icon, label, value, to, warn }) {
  const alarming = warn && Number(value) > 0;

  const content = (
    <Card className={`h-full transition-colors ${alarming ? 'border-[#ef3a40]' : 'hover:border-[#cfc7bd]'}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-full p-2 ${alarming ? 'bg-[#fff4f2] text-[#ef3a40]' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  return to ? <Link to={to} className="block h-full">{content}</Link> : content;
}
