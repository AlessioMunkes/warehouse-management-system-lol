import { Target } from 'lucide-react';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import { Skeleton } from '@/components/ui/skeleton';
import OperationalGoalCard from './OperationalGoalCard';

export default function OperationalGoalList({ goals = [], isLoading = false, error = '', onRetry, onEdit, onViewProgress, onArchive, onRestore, metricsById }) {
  if (isLoading) {
    return (
      <div className="grid gap-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-[18px] border border-line bg-card p-5 shadow-sm">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-4 w-2/3" />
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={onRetry} />;
  }

  if (goals.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No operational goals found."
        description="Create an operational goal to start tracking live progress from WMS data."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {goals.map((goal) => (
        <OperationalGoalCard
          key={goal.id}
          goal={goal}
          onEdit={onEdit}
          onViewProgress={onViewProgress}
          onArchive={onArchive}
          onRestore={onRestore}
          metric={metricsById?.get(goal.metricId)}
        />
      ))}
    </div>
  );
}
