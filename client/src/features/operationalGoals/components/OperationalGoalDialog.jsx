import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { COMPARISON_TYPES, DIRECTIONS, GOAL_TYPES, OPERATIONAL_GOAL_METRICS } from './operationalGoalMetrics';

const emptyForm = {
  title: '',
  goalText: '',
  metricId: '',
  goalType: 'TARGET',
  direction: 'INCREASE',
  targetValue: '',
  periodStart: '',
  periodEnd: '',
  comparisonType: 'TARGET',
};

const labelFromId = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const toDateInput = (value) => (value ? String(value).slice(0, 10) : '');

const formFromGoal = (goal) => ({
  title: goal?.title ?? '',
  goalText: goal?.goalText ?? '',
  metricId: goal?.metricId ?? '',
  goalType: goal?.goalType ?? 'TARGET',
  direction: goal?.direction ?? 'INCREASE',
  targetValue: goal?.targetValue === null || goal?.targetValue === undefined ? '' : String(goal.targetValue),
  periodStart: toDateInput(goal?.periodStart),
  periodEnd: toDateInput(goal?.periodEnd),
  comparisonType: goal?.comparisonType ?? 'TARGET',
});

const errorId = (field) => `operational-goal-${field}-error`;

export default function OperationalGoalDialog({ open = true, goal, initialDraft = null, onOpenChange, onSubmit, busy = false, submitError = '', variant = 'dialog' }) {
  const [form, setForm] = useState(() => (goal?.id ? formFromGoal(goal) : initialDraft ? formFromGoal(initialDraft) : emptyForm));
  const [errors, setErrors] = useState({});

  const editing = Boolean(goal?.id);
  const selectedMetric = useMemo(
    () => OPERATIONAL_GOAL_METRICS.find((metric) => metric.id === form.metricId) ?? null,
    [form.metricId]
  );


  const update = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const updateMetric = (metricId) => {
    const metric = OPERATIONAL_GOAL_METRICS.find((item) => item.id === metricId);
    setForm((current) => ({
      ...current,
      metricId,
      goalType: metric?.supportedGoalTypes.includes(current.goalType) ? current.goalType : metric?.supportedGoalTypes[0] ?? 'TARGET',
      direction: metric?.supportedDirections.includes(current.direction) ? current.direction : metric?.supportedDirections[0] ?? 'INCREASE',
      comparisonType: current.comparisonType === 'PREVIOUS_PERIOD' && !metric?.comparisonType ? 'TARGET' : current.comparisonType,
    }));
    setErrors((current) => ({ ...current, metricId: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Enter a goal name.';
    if (!form.goalText.trim()) next.goalText = 'Enter a description.';
    if (!form.metricId) next.metricId = 'Choose what this goal should track.';
    if (!form.goalType) next.goalType = 'Choose a measurement type.';
    if (!form.direction) next.direction = 'Choose what this goal should do.';
    if (!form.periodStart) next.periodStart = 'Choose a period start date.';
    if (!form.periodEnd) next.periodEnd = 'Choose a period end date.';
    if (form.periodStart && form.periodEnd && form.periodStart > form.periodEnd) next.periodEnd = 'Period end must be on or after period start.';
    if (form.goalType === 'TARGET') {
      if (form.targetValue === '') next.targetValue = 'Enter a target value.';
      else if (!Number.isFinite(Number(form.targetValue))) next.targetValue = 'Enter a valid target value.';
    }
    if (selectedMetric) {
      if (!selectedMetric.supportedGoalTypes.includes(form.goalType)) next.goalType = `${selectedMetric.label} does not support ${labelFromId(form.goalType)} goals.`;
      if (!selectedMetric.supportedDirections.includes(form.direction)) next.direction = `${selectedMetric.label} does not support ${labelFromId(form.direction)} direction.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    await onSubmit({
      title: form.title.trim(),
      goal_text: form.goalText.trim(),
      metric_id: form.metricId,
      metric_filters: null,
      goal_type: form.goalType,
      direction: form.direction,
      target_value: form.goalType === 'TARGET' ? Number(form.targetValue) : null,
      period_start: form.periodStart,
      period_end: form.periodEnd,
      comparison_type: form.comparisonType,
    });
  };

  const availableGoalTypes = selectedMetric?.supportedGoalTypes ?? GOAL_TYPES;
  const availableDirections = selectedMetric?.supportedDirections ?? DIRECTIONS;
  const availableComparisonTypes = selectedMetric?.comparisonType ? COMPARISON_TYPES : ['TARGET'];

  const formHeader = variant === 'page' ? (
    <div className="shrink-0">
      <h2 className="text-2xl font-semibold text-ink">{editing ? 'Edit Operational Goal' : 'Review Goal'}</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        {editing ? 'Update your operational goal at any time. Changes will be reflected the next time progress is calculated.' : initialDraft ? "We've prepared a draft based on your goal. Review it, make any changes you'd like, then create the goal." : 'Define what the team should track. Progress is calculated from live WMS data in the next screen.'}
      </p>
    </div>
  ) : (
    <DialogHeader className="shrink-0">
      <DialogTitle>{editing ? 'Edit Operational Goal' : 'Review Goal'}</DialogTitle>
      <DialogDescription>
        {editing ? 'Update your operational goal at any time. Changes will be reflected the next time progress is calculated.' : initialDraft ? "We've prepared a draft based on your goal. Review it, make any changes you'd like, then create the goal." : 'Define what the team should track. Progress is calculated from live WMS data in the next screen.'}
      </DialogDescription>
    </DialogHeader>
  );

  const formFooter = (
    <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create Goal'}</Button>
    </div>
  );

  const formContent = (

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          {formHeader}

          <div className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {submitError && <div role="alert" className="rounded-[10px] border border-line bg-danger-soft p-3 text-sm text-ink">{submitError}</div>}

            <section className="space-y-4 rounded-[18px] border border-line bg-muted/10 p-4 sm:p-5">
              <div>
                <h3 className="text-lg font-semibold text-ink">What this goal is about</h3>
                <p className="mt-1 text-sm text-muted-foreground">Name the outcome clearly so the team understands what success looks like.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="operational-goal-title">Goal Name</Label>
                  <Input id="operational-goal-title" value={form.title} onChange={update('title')} disabled={busy} aria-invalid={Boolean(errors.title) || undefined} aria-describedby={errors.title ? errorId('title') : undefined} />
                  {errors.title && <p id={errorId('title')} className="text-xs text-danger">{errors.title}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operational-goal-metric">We'll track</Label>
                  <Select value={form.metricId} onValueChange={updateMetric} disabled={busy}>
                    <SelectTrigger id="operational-goal-metric" aria-invalid={Boolean(errors.metricId) || undefined} aria-describedby={errors.metricId ? errorId('metricId') : undefined}>
                      <SelectValue placeholder="Choose what to track" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATIONAL_GOAL_METRICS.map((metric) => (
                        <SelectItem key={metric.id} value={metric.id}>{metric.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.metricId && <p id={errorId('metricId')} className="text-xs text-danger">{errors.metricId}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="operational-goal-text">Description</Label>
                <Textarea id="operational-goal-text" value={form.goalText} onChange={update('goalText')} rows={3} disabled={busy} aria-invalid={Boolean(errors.goalText) || undefined} aria-describedby={errors.goalText ? errorId('goalText') : undefined} />
                {errors.goalText && <p id={errorId('goalText')} className="text-xs text-danger">{errors.goalText}</p>}
              </div>
              {selectedMetric && (
                <div className="rounded-[14px] border border-line bg-card p-4 text-sm shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">We'll track</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{selectedMetric.label}</p>
                  <p className="mt-1 text-muted-foreground">We'll measure {selectedMetric.description.charAt(0).toLowerCase() + selectedMetric.description.slice(1)}</p>
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-[18px] border border-line bg-muted/10 p-4 sm:p-5">
              <div>
                <h3 className="text-lg font-semibold text-ink">How success will be measured</h3>
                <p className="mt-1 text-sm text-muted-foreground">Set the target, direction and comparison for progress reporting.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="operational-goal-type">Measurement type</Label>
                  <Select value={form.goalType} onValueChange={update('goalType')} disabled={busy}>
                    <SelectTrigger id="operational-goal-type" aria-invalid={Boolean(errors.goalType) || undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>{availableGoalTypes.map((type) => <SelectItem key={type} value={type}>{labelFromId(type)}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.goalType && <p className="text-xs text-danger">{errors.goalType}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operational-goal-direction">Your goal is to</Label>
                  <Select value={form.direction} onValueChange={update('direction')} disabled={busy}>
                    <SelectTrigger id="operational-goal-direction" aria-invalid={Boolean(errors.direction) || undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>{availableDirections.map((direction) => <SelectItem key={direction} value={direction}>{labelFromId(direction)}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.direction && <p className="text-xs text-danger">{errors.direction}</p>}
                </div>
                {form.goalType === 'TARGET' && (
                  <div className="space-y-2">
                    <Label htmlFor="operational-goal-target">Target</Label>
                    <Input id="operational-goal-target" inputMode="decimal" value={form.targetValue} onChange={update('targetValue')} disabled={busy} aria-invalid={Boolean(errors.targetValue) || undefined} aria-describedby={errors.targetValue ? errorId('targetValue') : undefined} />
                    <p className="text-xs text-muted-foreground">This is the value you'd like to achieve by the end of the goal period.</p>
                    {errors.targetValue && <p id={errorId('targetValue')} className="text-xs text-danger">{errors.targetValue}</p>}
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="operational-goal-period-start">Period Start</Label>
                  <Input id="operational-goal-period-start" type="date" value={form.periodStart} onChange={update('periodStart')} disabled={busy} aria-invalid={Boolean(errors.periodStart) || undefined} />
                  {errors.periodStart && <p className="text-xs text-danger">{errors.periodStart}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operational-goal-period-end">Period End</Label>
                  <Input id="operational-goal-period-end" type="date" value={form.periodEnd} onChange={update('periodEnd')} disabled={busy} aria-invalid={Boolean(errors.periodEnd) || undefined} />
                  {errors.periodEnd && <p className="text-xs text-danger">{errors.periodEnd}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operational-goal-comparison">Compare against</Label>
                  <Select value={form.comparisonType} onValueChange={update('comparisonType')} disabled={busy}>
                    <SelectTrigger id="operational-goal-comparison"><SelectValue /></SelectTrigger>
                    <SelectContent>{availableComparisonTypes.map((type) => <SelectItem key={type} value={type}>{labelFromId(type)}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Choose what this goal should be compared with when measuring progress.</p>
                </div>
              </div>
            </section>
          </div>

          {variant === 'page' ? formFooter : (
            <DialogFooter className="mt-5 shrink-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create Goal'}</Button>
            </DialogFooter>
          )}
        </form>
  );

  if (variant === 'page') {
    return (
      <div className="mt-5 rounded-[18px] border border-line bg-card p-5 shadow-sm sm:p-6">
        {formContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col">
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
