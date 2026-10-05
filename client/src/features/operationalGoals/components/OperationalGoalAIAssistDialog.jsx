import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
  metricFilters: null,
});

export default function OperationalGoalAIAssistDialog({ onOpenChange, onDraft, onSubmitDraft, busy = false, error = '' }) {
  const [goalText, setGoalText] = useState('');
  const [localError, setLocalError] = useState('');

  const requestDraft = async (event) => {
    event.preventDefault();
    setLocalError('');
    if (goalText.trim().length < 5) {
      setLocalError('Describe the goal before generating it.');
      return;
    }
    const result = await onDraft(goalText.trim());
    const draft = result?.draft ?? result;
    if (!draft) return;
    onSubmitDraft(toFormDraft(draft));
  };

  return (
    <Card className="mt-5 overflow-hidden rounded-[18px] border border-line shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={requestDraft} className="space-y-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Create Operational Goal
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Create Operational Goal</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Describe what you'd like to achieve. We'll prepare a measurable operational goal for you to review before anything is saved.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="operational-goal-ai-text">What would you like to achieve?</Label>
            <Textarea
              id="operational-goal-ai-text"
              value={goalText}
              onChange={(event) => setGoalText(event.target.value)}
              rows={7}
              disabled={busy}
              placeholder={[
                'Increase volunteer attendance next quarter.',
                'Reduce ECD non-collections this quarter.',
                'Increase donation value this financial year.',
                'Increase dispatch volume by 200 this quarter.',
              ].join('\n')}
            />
            <div className="grid gap-2 pt-1 text-xs text-muted-foreground sm:grid-cols-2">
              <span className="rounded-full bg-muted px-3 py-2">Increase volunteer attendance next quarter.</span>
              <span className="rounded-full bg-muted px-3 py-2">Reduce ECD non-collections this quarter.</span>
              <span className="rounded-full bg-muted px-3 py-2">Increase donation value this financial year.</span>
              <span className="rounded-full bg-muted px-3 py-2">Increase dispatch volume by 200 this quarter.</span>
            </div>
            {localError && <p className="text-xs text-danger">{localError}</p>}
          </div>

          {error && <div role="alert" className="rounded-[10px] border border-line bg-danger-soft p-3 text-sm text-ink">{error}</div>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Generating...' : 'Generate Goal'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
