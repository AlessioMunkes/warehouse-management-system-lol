import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

const labelFromId = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

const formatNumber = (value, fallback = 'Not available') => {
  if (value === null || value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 }).format(numeric);
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return 'Not applicable';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not applicable';
  return `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 }).format(numeric)}%`;
};

const measuredAt = (value) => {
  if (!value) return 'Not measured yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg',
  }).format(date);
};

const daysRemaining = (periodEnd) => {
  if (!periodEnd) return 'Not set';
  const today = new Date();
  const end = new Date(`${String(periodEnd).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(end.getTime())) return 'Not set';
  const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'Period ended';
  if (days === 0) return 'Ends today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
};

const remainingToTarget = (progress) => {
  if (progress?.targetValue === null || progress?.targetValue === undefined) return 'No fixed target';
  const remaining = Number(progress.targetValue) - Number(progress.currentValue ?? 0);
  if (!Number.isFinite(remaining)) return 'Not available';
  return formatNumber(Math.max(0, remaining));
};

const trendSummary = (progress, goal) => {
  if (progress?.previousValue === null || progress?.previousValue === undefined) {
    return 'No previous-period comparison is available for this goal yet.';
  }
  const current = Number(progress.currentValue ?? 0);
  const previous = Number(progress.previousValue ?? 0);
  const delta = current - previous;
  if (!Number.isFinite(delta)) return 'The previous-period comparison is not available.';
  if (delta === 0) return 'Current performance is level with the previous period.';
  const direction = delta > 0 ? 'higher' : 'lower';
  const desired = goal?.direction === 'DECREASE' ? 'Lower is better for this goal.' : goal?.direction === 'INCREASE' ? 'Higher is better for this goal.' : 'The goal is to maintain performance.';
  return `Current performance is ${formatNumber(Math.abs(delta))} ${direction} than the previous period. ${desired}`;
};


const progressBand = (percent) => {
  const numeric = Number(percent ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 33) {
    return {
      progressClass: '[&_[data-slot=progress-indicator]]:bg-red-600 [&_[data-slot=progress-track]]:h-5',
    };
  }
  if (numeric <= 66) {
    return {
      progressClass: '[&_[data-slot=progress-indicator]]:bg-amber-500 [&_[data-slot=progress-track]]:h-5',
    };
  }
  return {
    progressClass: '[&_[data-slot=progress-indicator]]:bg-emerald-600 [&_[data-slot=progress-track]]:h-5',
  };
};

const unitLabel = (metric) => {
  const unit = String(metric?.unit ?? '').trim();
  if (!unit || unit === 'count') return 'items';
  if (unit === '%') return '';
  return unit;
};

const currentVsTarget = (progress, metric) => {
  const suffix = unitLabel(metric);
  const unitText = suffix ? ' ' + suffix : '';
  const percent = formatPercent(progress?.progressPercent);
  if (progress?.targetValue === null || progress?.targetValue === undefined) {
    return formatNumber(progress?.currentValue) + unitText;
  }
  return formatNumber(progress?.currentValue) + ' / ' + formatNumber(progress?.targetValue) + unitText + ' (' + percent + ')';
};

function MetricLine({ label, value, helper }) {
  return (
    <div className="rounded-[14px] border border-line bg-muted/10 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {helper && <p className="mt-1 text-sm text-muted-foreground">{helper}</p>}
    </div>
  );
}

function AskWhyDialog({ open, data, loading, error, onRetry, onOpenChange }) {
  const evidenceRows = data?.evidence || [];
  const followUpQuestions = data?.follow_up_questions || [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle>Ask Why?</DialogTitle>
          <DialogDescription>
            AI explanation using the current goal, live progress and deterministic evidence only.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {!loading && error && (
            <div role="alert" className="rounded-[10px] border border-line bg-danger-soft p-3 text-ink">
              <p>{error}</p>
              {onRetry && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
            </div>
          )}
          {!loading && !error && data && (
            <>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Explanation</p>
                <p className="mt-2 text-ink">{data.explanation}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Evidence</p>
                {evidenceRows.length ? (
                  <dl className="mt-2 divide-y divide-line rounded-[10px] border border-line">
                    {evidenceRows.map((item, index) => (
                      <div key={`why-evidence-${index}-${item.label}`} className="grid gap-1 px-3 py-2 sm:grid-cols-[180px_1fr]">
                        <dt className="text-muted-foreground">{item.label}</dt>
                        <dd className="font-medium text-ink">{String(item.value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="mt-2 text-muted-foreground">No evidence returned.</p>}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</p>
                <p className="mt-1 font-medium text-ink">{formatPercent(Number(data.confidence) * 100)}</p>
                {data.confidence_reason && <p className="mt-1 text-muted-foreground">{data.confidence_reason}</p>}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Follow-up questions</p>
                {followUpQuestions.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                    {followUpQuestions.map((item, index) => <li key={`why-question-${index}-${item}`}>{item}</li>)}
                  </ul>
                ) : <p className="mt-2 text-muted-foreground">No follow-up questions returned.</p>}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OperationalGoalProgressDialog({
  open,
  goal,
  metric,
  progress,
  loading,
  error,
  aiInsight,
  aiLoading = false,
  aiError = '',
  onRetry,
  onRetryAI,
  askWhyOpen = false,
  askWhyData,
  askWhyLoading = false,
  askWhyError = '',
  onAskWhy,
  onRetryAskWhy,
  onAskWhyOpenChange,
  onOpenChange,
  variant = 'dialog',
}) {
  const percentValue = progress?.progressPercent === null || progress?.progressPercent === undefined
    ? null
    : Math.max(0, Math.min(100, Number(progress.progressPercent)));
  const band = progressBand(percentValue);

  const content = (
    <div className="space-y-5">
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-[12px] border border-line bg-danger-soft p-4 text-sm text-ink shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{error}</p>
            {onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
          </div>
        </div>
      )}

      {!loading && !error && progress && (
        <>
          <Card className="overflow-hidden rounded-[18px] border border-line shadow-sm">
            <CardContent className="space-y-6 p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Measured {measuredAt(progress.measuredAt)} from live WMS data.</p>
                  <h2 className="mt-2 text-3xl font-semibold text-ink">{goal?.title || 'Goal progress'}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{goal?.goalText}</p>
                </div>
              </div>

              <Progress value={percentValue ?? 0} className={band.progressClass}>
                <ProgressLabel>Progress toward target</ProgressLabel>
                <ProgressValue className="text-base font-semibold text-ink">{formatPercent(progress.progressPercent)}</ProgressValue>
              </Progress>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricLine label="Current vs Target" value={currentVsTarget(progress, metric)} helper={metric?.unit ? `Measured in ${metric.unit}` : ''} />
                <MetricLine label="Percentage" value={formatPercent(progress.progressPercent)} />
                <MetricLine label="Remaining" value={remainingToTarget(progress)} />
                <MetricLine label="Time remaining" value={daysRemaining(goal?.periodEnd)} helper={`${formatDate(goal?.periodStart)} to ${formatDate(goal?.periodEnd)}`} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <Card className="rounded-[18px] border border-line shadow-sm">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div>
                  <h3 className="text-xl font-semibold text-ink">Trend summary</h3>
                  <p className="mt-3 text-base leading-7 text-ink">{trendSummary(progress, goal)}</p>
                </div>
                <div className="rounded-[14px] border border-line bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">We'll track</p>
                  <p className="mt-1 font-semibold text-ink">{metric?.label ?? labelFromId(goal?.metricId)}</p>
                  {metric?.description && <p className="mt-1 text-sm text-muted-foreground">{metric.description}</p>}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Goal period</p>
                  <p className="mt-1 text-sm font-medium text-ink">{formatDate(goal?.periodStart)} to {formatDate(goal?.periodEnd)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[18px] border border-line shadow-sm">
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-ink">AI Insight</h3>
                    <p className="mt-2 text-sm text-muted-foreground">A plain-language explanation of the live progress.</p>
                  </div>
                  {onAskWhy && <Button type="button" variant="outline" size="sm" onClick={onAskWhy}>Ask Why?</Button>}
                </div>

                {aiLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                )}
                {!aiLoading && aiError && (
                  <div role="status" className="rounded-[10px] border border-line bg-muted/30 p-3 text-sm text-muted-foreground">
                    <p>{aiError}</p>
                    {onRetryAI && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetryAI}>Try AI again</Button>}
                  </div>
                )}
                {!aiLoading && !aiError && aiInsight && (
                  <div className="space-y-4 text-sm">
                    <p className="text-ink">{aiInsight.insight}</p>
                    <div>
                      <h4 className="text-base font-semibold text-ink">Recommended actions</h4>
                      {aiInsight.recommendations?.length ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                          {aiInsight.recommendations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-2 text-muted-foreground">No recommendations returned.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</p>
                      <p className="mt-1 font-medium text-ink">{formatPercent(Number(aiInsight.confidence) * 100)}</p>
                      {aiInsight.confidence_reason && <p className="mt-1 text-muted-foreground">{aiInsight.confidence_reason}</p>}
                    </div>
                  </div>
                )}
                {!aiLoading && !aiError && !aiInsight && (
                  <p className="text-sm text-muted-foreground">AI insight has not been loaded yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );

  if (variant === 'page') {
    return (
      <>
        {content}
        <AskWhyDialog
          open={askWhyOpen}
          data={askWhyData}
          loading={askWhyLoading}
          error={askWhyError}
          onRetry={onRetryAskWhy}
          onOpenChange={onAskWhyOpenChange}
        />
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle>Goal progress</DialogTitle>
            <DialogDescription>
              {goal?.title ? `Live progress for ${goal.title}.` : 'Live progress from WMS data.'}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{content}</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AskWhyDialog
        open={askWhyOpen}
        data={askWhyData}
        loading={askWhyLoading}
        error={askWhyError}
        onRetry={onRetryAskWhy}
        onOpenChange={onAskWhyOpenChange}
      />
    </>
  );
}
