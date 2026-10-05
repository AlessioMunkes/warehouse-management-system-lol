import { Badge } from '@/components/ui/badge';
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

function StatCard({ label, value }) {
  return (
    <Card className="rounded-[12px] border border-line shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
      </CardContent>
    </Card>
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
}) {
  const percentValue = progress?.progressPercent === null || progress?.progressPercent === undefined
    ? null
    : Math.max(0, Math.min(100, Number(progress.progressPercent)));
  const evidenceRows = askWhyData?.evidence || [];
  const followUpQuestions = askWhyData?.follow_up_questions || [];

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Goal progress</DialogTitle>
          <DialogDescription>
            {goal?.title ? `Live progress for ${goal.title}.` : 'Live progress from WMS data.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
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
              <div className="rounded-[12px] border border-line bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">Progress Summary</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Measured {measuredAt(progress.measuredAt)} from live WMS data.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onAskWhy && <Button type="button" variant="outline" size="sm" onClick={onAskWhy}>❓ Ask Why?</Button>}
                    <Badge variant="outline" className="w-fit rounded-[6px] px-2 py-0 text-[11px]">
                      {labelFromId(progress.status)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4">
                  <Progress value={percentValue ?? 0}>
                    <ProgressLabel>Progress %</ProgressLabel>
                    <ProgressValue>{formatPercent(progress.progressPercent)}</ProgressValue>
                  </Progress>
                </div>
              </div>

              <div className="rounded-[12px] border border-line bg-card p-4 text-sm shadow-sm">
                <p className="font-semibold text-ink">AI Insight</p>
                {aiLoading && (
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                )}
                {!aiLoading && aiError && (
                  <div role="status" className="mt-3 rounded-[10px] border border-line bg-muted/30 p-3 text-muted-foreground">
                    <p>{aiError}</p>
                    {onRetryAI && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetryAI}>Try AI again</Button>}
                  </div>
                )}
                {!aiLoading && !aiError && aiInsight && (
                  <div className="mt-3 space-y-4">
                    <p className="text-ink">{aiInsight.insight}</p>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Evidence</p>
                      {aiInsight.evidence?.length ? (
                        <dl className="mt-2 divide-y divide-line rounded-[10px] border border-line">
                          {aiInsight.evidence.map((item, index) => (
                            <div key={`evidence-${index}-${item.label}`} className="grid gap-1 px-3 py-2 sm:grid-cols-[180px_1fr]">
                              <dt className="text-muted-foreground">{item.label}</dt>
                              <dd className="font-medium text-ink">{String(item.value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="mt-2 text-muted-foreground">No evidence returned.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Recommendations</p>
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
                  <p className="mt-3 text-muted-foreground">AI insight has not been loaded yet.</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Current Value" value={formatNumber(progress.currentValue)} />
                <StatCard label="Target" value={formatNumber(progress.targetValue, 'No target')} />
                <StatCard label="Previous Period" value={formatNumber(progress.previousValue, 'Not applicable')} />
                <StatCard label="Status" value={labelFromId(progress.status)} />
              </div>

              <div className="rounded-[12px] border border-line bg-card p-4 text-sm shadow-sm">
                <p className="font-semibold text-ink">Goal Details</p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Metric</dt>
                    <dd className="mt-1 font-medium text-ink">{metric?.label ?? labelFromId(goal?.metricId)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Domain</dt>
                    <dd className="mt-1 font-medium text-ink">{metric?.domain ?? 'Not set'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Period</dt>
                    <dd className="mt-1 font-medium text-ink">{formatDate(goal?.periodStart)} � {formatDate(goal?.periodEnd)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Direction</dt>
                    <dd className="mt-1 font-medium text-ink">{labelFromId(goal?.direction)}</dd>
                  </div>
                </dl>
                {metric?.description && <p className="mt-3 text-muted-foreground">{metric.description}</p>}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={askWhyOpen} onOpenChange={onAskWhyOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle>Ask Why?</DialogTitle>
          <DialogDescription>
            AI explanation using the current goal, live progress and deterministic evidence only.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          {askWhyLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {!askWhyLoading && askWhyError && (
            <div role="alert" className="rounded-[10px] border border-line bg-danger-soft p-3 text-ink">
              <p>{askWhyError}</p>
              {onRetryAskWhy && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetryAskWhy}>Try again</Button>}
            </div>
          )}
          {!askWhyLoading && !askWhyError && askWhyData && (
            <>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Explanation</p>
                <p className="mt-2 text-ink">{askWhyData.explanation}</p>
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
                <p className="mt-1 font-medium text-ink">{formatPercent(Number(askWhyData.confidence) * 100)}</p>
                {askWhyData.confidence_reason && <p className="mt-1 text-muted-foreground">{askWhyData.confidence_reason}</p>}
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
          <Button type="button" variant="outline" onClick={() => onAskWhyOpenChange?.(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
