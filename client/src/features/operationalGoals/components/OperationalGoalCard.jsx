import { Archive, BarChart3, Pencil, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const labelFromId = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

const formatTarget = (goal) => {
  if (goal.targetValue === null || goal.targetValue === undefined) return 'No target value';
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 }).format(goal.targetValue);
};

export default function OperationalGoalCard({ goal, metric, onEdit, onViewProgress, onArchive, onRestore }) {
  const archived = goal.goalState === 'ARCHIVED';

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{goal.title}</CardTitle>
              <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs">
                {labelFromId(goal.goalState)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{goal.goalText}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onEdit?.(goal)} disabled={archived}>
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onViewProgress?.(goal)}>
              <BarChart3 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              View Progress
            </Button>
            {archived ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onRestore?.(goal)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Restore
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => onArchive?.(goal)}>
                <Archive className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Archive
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Metric</dt>
            <dd className="mt-1 font-medium text-ink">{metric?.label ?? labelFromId(goal.metricId)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Domain</dt>
            <dd className="mt-1 font-medium text-ink">{metric?.domain ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Goal type</dt>
            <dd className="mt-1 font-medium text-ink">{labelFromId(goal.goalType)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Target</dt>
            <dd className="mt-1 font-medium text-ink">{formatTarget(goal)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Period</dt>
            <dd className="mt-1 font-medium text-ink">{formatDate(goal.periodStart)} – {formatDate(goal.periodEnd)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}


