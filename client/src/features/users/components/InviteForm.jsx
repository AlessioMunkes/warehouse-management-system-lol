// ─────────────────────────────────────────────────────────────
// client/src/features/users/components/InviteForm.jsx
//
// Replaces UserForm's old create-mode. An admin picks a role and
// enters an email address — nothing else. The invitee sets their own
// username, name and password at accept time (see InviteAcceptPage),
// so the admin never sees or chooses a credential.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Field, FieldGroup, FieldLabel, FieldError,
} from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

// Display labels only — every stored/validated/API value stays
// warehouse_worker, matching the live users.role CHECK constraint.
const ROLE_OPTIONS = [
  { value: 'warehouse_worker', label: 'Worker' },
  { value: 'manager',          label: 'Manager' },
  { value: 'admin',            label: 'Admin' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteForm({
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const [email, setEmail] = useState('');
  const [role, setRole]   = useState('warehouse_worker');
  const [touched, setTouched] = useState(false);

  const trimmed = email.trim();
  const emailMissing   = !trimmed;
  const emailInvalid   = Boolean(trimmed) && !EMAIL_PATTERN.test(trimmed);

  const submit = () => {
    setTouched(true);
    if (emailMissing || emailInvalid) return;
    onSubmit({ email: trimmed, role });
  };

  return (
    <FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}

      <div className="grid gap-7 sm:grid-cols-2">
        <Field data-invalid={(touched && (emailMissing || emailInvalid)) || undefined}>
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={(touched && (emailMissing || emailInvalid)) || undefined}
          />
          {touched && emailMissing ? <FieldError>An email address is required.</FieldError> : null}
          {touched && !emailMissing && emailInvalid ? (
            <FieldError>That does not look like a valid email address.</FieldError>
          ) : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="invite-role">Role</FieldLabel>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field orientation="horizontal">
        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? 'Sending' : 'Send invite'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        ) : null}
      </Field>
    </FieldGroup>
  );
}
