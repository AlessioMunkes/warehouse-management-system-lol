// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/ActionCard.jsx
//
// A destination with a sentence attached. The dashboards used to list
// the same words as the sidebar two inches to their left, which tells
// someone nothing they could not already see — this says what the
// screen is FOR, which is the part a menu cannot carry.
//
// `badge` is the count that makes a card worth opening first.
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

export default function ActionCard({ to, icon: Icon, title, description, badge }) {
  return (
    <Link to={to} className="block h-full">
      <Card className="h-full transition-colors hover:border-line-strong hover:bg-canvas">
        <CardContent className="flex h-full items-start gap-3 p-4">
          <div className="mt-0.5 shrink-0 rounded-[6px] bg-surface-2 p-2 text-ink">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold leading-tight text-ink">{title}</p>
              {badge ? (
                <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
