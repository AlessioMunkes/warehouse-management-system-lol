// ─────────────────────────────────────────────────────────────
// client/src/features/beneficiaries/components/BeneficiaryForm.jsx
//
// Registration and edit in one component, same reasoning as
// ProductForm.jsx/SupplierForm.jsx.
//
// name AND cohort ARE REQUIRED, matching
// beneficiary.service.js's buildBeneficiaryPayload exactly.
// contactName/childCount are optional.
//
// approved_at is NOT a field here — see beneficiary.service.js's
// comment: approval is a deliberate separate action
// (BeneficiaryDirectoryPage's "Approve" button), not something this
// form can set. A brand-new centre is never slip-eligible the moment
// it's typed in.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Field, FieldGroup, FieldLabel, FieldDescription, FieldError,
} from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const COHORT_OPTIONS = [
  { value: 'week1', label: 'Week 1' },
  { value: 'week2', label: 'Week 2' },
];

const BLANK = { name: '', cohort: '', contactName: '', childCount: '' };

export default function BeneficiaryForm({
  initial = null,
  submitLabel = 'Add beneficiary',
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const [form, setForm] = useState({ ...BLANK, ...(initial ?? {}) });
  const [touchedName, setTouchedName] = useState(false);
  const [touchedCohort, setTouchedCohort] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const nameMissing = !String(form.name ?? '').trim();
  const nameInvalid = touchedName && nameMissing;
  const cohortMissing = !form.cohort;
  const cohortInvalid = touchedCohort && cohortMissing;

  const submit = () => {
    setTouchedName(true);
    setTouchedCohort(true);
    if (nameMissing || cohortMissing) return;
    onSubmit({
      ...form,
      childCount: form.childCount === '' || form.childCount === null ? null : Number(form.childCount),
    });
  };

  return (
    <FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}

      <Field data-invalid={nameInvalid || undefined}>
        <FieldLabel htmlFor="beneficiary-name">Beneficiary name</FieldLabel>
        <Input
          id="beneficiary-name"
          value={form.name}
          onChange={set('name')}
          onBlur={() => setTouchedName(true)}
          placeholder="Sunnyside ECD"
          aria-invalid={nameInvalid || undefined}
        />
        {nameInvalid ? <FieldError>A name is required.</FieldError> : null}
      </Field>

      <div className="grid gap-7 sm:grid-cols-2">
        <Field data-invalid={cohortInvalid || undefined}>
          <FieldLabel htmlFor="beneficiary-cohort">Cohort</FieldLabel>
          <Select
            value={form.cohort || undefined}
            onValueChange={(v) => { setForm((f) => ({ ...f, cohort: v })); setTouchedCohort(true); }}
          >
            <SelectTrigger id="beneficiary-cohort" aria-invalid={cohortInvalid || undefined}>
              <SelectValue placeholder="Select a cohort" />
            </SelectTrigger>
            <SelectContent>
              {COHORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cohortInvalid ? <FieldError>A cohort is required.</FieldError> : null}
          <FieldDescription>Which fortnightly rotation this centre collects on.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="beneficiary-contact">Contact person</FieldLabel>
          <Input id="beneficiary-contact" value={form.contactName} onChange={set('contactName')} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="beneficiary-children">Children served</FieldLabel>
        <Input
          id="beneficiary-children"
          type="number"
          min="0"
          value={form.childCount ?? ''}
          onChange={set('childCount')}
        />
        <FieldDescription>Leave blank if not yet known — used for impact reporting.</FieldDescription>
      </Field>

      <Field orientation="horizontal">
        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? 'Saving' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        ) : null}
      </Field>
    </FieldGroup>
  );
}
