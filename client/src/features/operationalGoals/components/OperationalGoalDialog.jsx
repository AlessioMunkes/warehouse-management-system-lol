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
  metricFiltersText: '',
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
  metricFiltersText: goal?.metricFilters ? JSON.stringify(goal.metricFilters, null, 2) : '',
});

const errorId = (field) => `operational-goal-${field}-error`;

export default function OperationalGoalDialog({ open, goal, initialDraft = null, onOpenChange, onSubmit, busy = false, submitError = '' }) {
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
      metricFiltersText: '',
    }));
    setErrors((current) => ({ ...current, metricId: '', metricFiltersText: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Enter a goal name.';
    if (!form.goalText.trim()) next.goalText = 'Enter a description.';
    if (!form.metricId) next.metricId = 'Choose a metric.';
    if (!form.goalType) next.goalType = 'Choose a goal type.';
    if (!form.direction) next.direction = 'Choose a direction.';
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
    if (form.metricFiltersText.trim()) {
      try {
        const parsed = JSON.parse(form.metricFiltersText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) next.metricFiltersText = 'Metric filters must be a JSON object.';
        const unsupported = selectedMetric
          ? Object.keys(parsed).filter((key) => !selectedMetric.supportedFilters.includes(key))
          : [];
        if (unsupported.length) next.metricFiltersText = `Unsupported filters for this metric: ${unsupported.join(', ')}.`;
      } catch {
        next.metricFiltersText = 'Enter valid JSON for metric filters.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    const metricFiltersText = form.metricFiltersText.trim();
    await onSubmit({
      title: form.title.trim(),
      goal_text: form.goalText.trim(),
      metric_id: form.metricId,
      metric_filters: metricFiltersText ? JSON.parse(metricFiltersText) : null,
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

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? 'Edit operational goal' : 'New operational goal'}</DialogTitle>
            <DialogDescription>
              {initialDraft && !editing ? 'Review and edit the AI draft before creating the goal.' : 'Define what the team should track. Progress is calculated from live WMS data in the next screen.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {submitError && <div role="alert" className="rounded-[10px] border border-line bg-danger-soft p-3 text-sm text-ink">{submitError}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="operational-goal-title">Goal Name</Label>
                <Input id="operational-goal-title" value={form.title} onChange={update('title')} disabled={busy} aria-invalid={Boolean(errors.title) || undefined} aria-describedby={errors.title ? errorId('title') : undefined} />
                {errors.title && <p id={errorId('title')} className="text-xs text-danger">{errors.title}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="operational-goal-metric">Metric</Label>
                <Select value={form.metricId} onValueChange={updateMetric} disabled={busy}>
                  <SelectTrigger id="operational-goal-metric" aria-invalid={Boolean(errors.metricId) || undefined} aria-describedby={errors.metricId ? errorId('metricId') : undefined}>
                    <SelectValue placeholder="Choose a metric" />
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
              <div className="rounded-[10px] border border-line bg-muted/30 p-3 text-sm">
                <p className="font-medium text-ink">{selectedMetric.label}</p>
                <p className="mt-1 text-muted-foreground">{selectedMetric.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">Domain: {selectedMetric.domain}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="operational-goal-type">Goal Type</Label>
                <Select value={form.goalType} onValueChange={update('goalType')} disabled={busy}>
                  <SelectTrigger id="operational-goal-type" aria-invalid={Boolean(errors.goalType) || undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>{availableGoalTypes.map((type) => <SelectItem key={type} value={type}>{labelFromId(type)}</SelectItem>)}</SelectContent>
                </Select>
                {errors.goalType && <p className="text-xs text-danger">{errors.goalType}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="operational-goal-direction">Direction</Label>
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
                  <Label htmlFor="operational-goal-target">Target Value</Label>
                  <Input id="operational-goal-target" inputMode="decimal" value={form.targetValue} onChange={update('targetValue')} disabled={busy} aria-invalid={Boolean(errors.targetValue) || undefined} aria-describedby={errors.targetValue ? errorId('targetValue') : undefined} />
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
                <Label htmlFor="operational-goal-comparison">Comparison</Label>
                <Select value={form.comparisonType} onValueChange={update('comparisonType')} disabled={busy}>
                  <SelectTrigger id="operational-goal-comparison"><SelectValue /></SelectTrigger>
                  <SelectContent>{availableComparisonTypes.map((type) => <SelectItem key={type} value={type}>{labelFromId(type)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {selectedMetric?.supportedFilters?.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="operational-goal-filters">Metric Filters</Label>
                <Textarea
                  id="operational-goal-filters"
                  value={form.metricFiltersText}
                  onChange={update('metricFiltersText')}
                  rows={4}
                  disabled={busy}
                  placeholder={`Optional JSON object. Supported filters: ${selectedMetric.supportedFilters.join(', ')}`}
                  aria-invalid={Boolean(errors.metricFiltersText) || undefined}
                />
                <p className="text-xs text-muted-foreground">Supported filters: {selectedMetric.supportedFilters.join(', ')}</p>
                {errors.metricFiltersText && <p className="text-xs text-danger">{errors.metricFiltersText}</p>}
              </div>
            )}
          </div>

          <DialogFooter className="mt-5 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create goal'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}






