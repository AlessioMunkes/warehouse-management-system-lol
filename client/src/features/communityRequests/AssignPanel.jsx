// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/AssignPanel.jsx
//
// Choose who packs an approved request. Anyone can still claim an
// unclaimed request; assigning also lets that person confirm what went
// out. Choosing nobody clears the packer.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import DetailPanel from '@/components/ui/detail-panel';

const NOBODY = 'nobody';

const nameOf = (w) => `${w.first_name ?? ''} ${w.last_name ?? ''}`.trim();

export default function AssignPanel({ request, workers, busy = false, error = null, onSubmit, onCancel }) {
  const [value, setValue] = useState(request.assignedTo ? String(request.assignedTo) : NOBODY);

  const chosen = (workers ?? []).find((w) => String(w.id) === value);
  const label = value === NOBODY ? 'Nobody' : (chosen ? nameOf(chosen) : request.assignedToName ?? '');

  return (
    <DetailPanel
      open
      onClose={onCancel}
      eyebrow="Assign packer"
      title={request.callerName || 'An unnamed caller'}
    >
      <FieldGroup>
        {error ? <FieldError>{error}</FieldError> : null}

        {workers === null ? (
          <Skeleton className="h-10 w-full" aria-busy="true" />
        ) : (
          <Field>
            <FieldLabel htmlFor="cr-assign-packer">Packer</FieldLabel>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id="cr-assign-packer" className="w-full">
                <SelectValue>{label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY}>Nobody</SelectItem>
                {workers.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>{nameOf(w)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose who packs this request. If you choose nobody, anyone on the floor can claim it.
            </p>
          </Field>
        )}

        <Field orientation="horizontal">
          <Button
            type="button"
            onClick={() => onSubmit(value === NOBODY ? null : Number(value))}
            disabled={busy || workers === null}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? 'Saving' : 'Assign packer'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        </Field>
      </FieldGroup>
    </DetailPanel>
  );
}
