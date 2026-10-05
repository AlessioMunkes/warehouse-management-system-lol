import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const labelFromId = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const formatTarget = (value) => {
  if (value === null || value === undefined) return 'No target value';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 }).format(numeric);
};

const toFormDraft = (draft) => ({
  title: draft.title ?? '',
  goalText: draft.goal_text ?? draft.goalText ?? '',
  metricId: draft.metric_id ?? draft.metricId ?? '',
  goalType: draft.goal_type ?? draft.goalType ?? 'TARGET',
  direction: draft.direction ?? 'INCREASE',
  targetValue: draft.target_value ?? draft.targetValue ?? null,
  periodStart: draft.period_start ?? draft.periodStart ?? '',
  periodEnd: draft.period_end ?? draft.periodEnd ?? '',
  comparisonType: draft.comparison_type ?? draft.comparisonType ?? 'TARGET',
  metricFilters: draft.metric_filters ?? draft.metricFilters ?? null,
});

function DraftCard({ draft, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-[12px] border p-4 text-left text-sm shadow-sm transition ${selected ? 'border-primary bg-primary/5' : 'border-line bg-card hover:bg-muted/30'}`}
      aria-pressed={selected}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{draft.variant}</p>
          <p className="mt-1 font-semibold text-ink">{draft.title}</p>
        </div>
        {draft.confidence !== undefined && (
          <span className="w-fit rounded-[6px] border border-line px-2 py-1 text-xs text-muted-foreground">
            Confidence {Math.round(Number(draft.confidence) * 100)}%
          </span>
        )}
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Metric</dt><dd className="mt-1 font-medium text-ink">{labelFromId(draft.metric_id)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Goal Type</dt><dd className="mt-1 font-medium text-ink">{labelFromId(draft.goal_type)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Direction</dt><dd className="mt-1 font-medium text-ink">{labelFromId(draft.direction)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Target Value</dt><dd className="mt-1 font-medium text-ink">{formatTarget(draft.target_value)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Period</dt><dd className="mt-1 font-medium text-ink">{draft.period_start} – {draft.period_end}</dd></div>
      </dl>
      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
        <p className="mt-1 text-ink">{draft.goal_text}</p>
      </div>
      {draft.reasoning && <p className="mt-3 text-muted-foreground">{draft.reasoning}</p>}
      {draft.confidence_reason && <p className="mt-2 text-xs text-muted-foreground">{draft.confidence_reason}</p>}
    </button>
  );
}

export default function OperationalGoalAIAssistDialog({ open, onOpenChange, onDraft, onSubmitDraft, busy = false, error = '' }) {
  const [goalText, setGoalText] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(1);
  const [localError, setLocalError] = useState('');

  const requestDraft = async (event) => {
    event.preventDefault();
    setLocalError('');
    if (goalText.trim().length < 5) {
      setLocalError('Describe the goal before generating drafts.');
      return;
    }
    const result = await onDraft(goalText.trim());
    const options = Array.isArray(result?.drafts) ? result.drafts : result ? [result] : [];
    setDrafts(options);
    setSelectedIndex(Math.min(1, Math.max(0, options.length - 1)));
  };

  const useDraft = () => {
    const selected = drafts[selectedIndex];
    if (!selected) return;
    onSubmitDraft(toFormDraft(selected));
    setGoalText('');
    setDrafts([]);
    setSelectedIndex(1);
  };

  const close = (next) => {
    if (!next && !busy) {
      setGoalText('');
      setDrafts([]);
      setSelectedIndex(1);
      setLocalError('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col">
        <form onSubmit={requestDraft} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" aria-hidden="true" /> AI Goal Assistant</DialogTitle>
            <DialogDescription>
              Describe the goal in plain language. The assistant will prepare three drafts for you to review before anything is saved.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="operational-goal-ai-text">Natural-language goal</Label>
              <Textarea
                id="operational-goal-ai-text"
                value={goalText}
                onChange={(event) => setGoalText(event.target.value)}
                rows={4}
                disabled={busy}
                placeholder="Example: Increase volunteer attendance to 200 check-ins this quarter."
              />
              {localError && <p className="text-xs text-danger">{localError}</p>}
            </div>

            {error && <div role="alert" className="rounded-[10px] border border-line bg-danger-soft p-3 text-sm text-ink">{error}</div>}

            {drafts.length > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-ink">Choose a draft</p>
                  <p className="mt-1 text-sm text-muted-foreground">Select Conservative, Balanced or Ambitious. You can still edit the goal before creating it.</p>
                </div>
                {drafts.map((draft, index) => (
                  <DraftCard
                    key={`${draft.variant ?? index}-${draft.title}`}
                    draft={draft}
                    selected={selectedIndex === index}
                    onSelect={() => setSelectedIndex(index)}
                  />
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
            {drafts.length > 0 ? <Button type="button" onClick={useDraft} disabled={busy}>Use Draft</Button> : null}
            <Button type="submit" disabled={busy}>{busy ? 'Generating...' : drafts.length ? 'Generate Drafts again' : 'Generate Drafts'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


