// ─────────────────────────────────────────────────────────────
// client/src/features/users/components/UserForm.jsx
//
// EDIT ONLY. Creating a user now goes through InviteForm.jsx (email +
// role, an emailed link) — see UserDirectoryPage.jsx. This form still
// changes username, first name, last name and role for an existing
// account; it has never had a password field for that path (see
// user.service.js: updateUser has no password branch at all — there
// is still no change-password path anywhere in this codebase).
//
// SELF-LOCKOUT GUARD, CLIENT SIDE.
// When isSelf is true and the account being edited is currently an
// admin, the role select is disabled. The server enforces this too
// (user.service.js's updateUser) — this is belt-and-braces so editing
// your own account doesn't produce a confusing 400 for a choice the
// form should never have offered in the first place.
//
// Built on FieldGroup / Field / FieldLabel / FieldDescription /
// FieldError from @/components/ui/field, following SupplierForm.jsx.
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

// Display labels only — every stored/validated/API value stays
// warehouse_worker, matching the live users.role CHECK constraint.
const ROLE_OPTIONS = [
  { value: 'warehouse_worker', label: 'Worker' },
  { value: 'manager',          label: 'Manager' },
  { value: 'admin',            label: 'Admin' },
];

export default function UserForm({
  initial,
  isSelf = false,
  submitLabel = 'Save changes',
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const [form, setForm] = useState({
    username: '', firstName: '', lastName: '', role: 'warehouse_worker',
    ...initial,
  });
  const [touched, setTouched] = useState({});

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));

  const usernameMissing  = !String(form.username ?? '').trim();
  const firstNameMissing = !String(form.firstName ?? '').trim();
  const lastNameMissing  = !String(form.lastName ?? '').trim();
  const roleLocked       = isSelf && form.role === 'admin';

  const submit = () => {
    setTouched({ username: true, firstName: true, lastName: true });
    if (usernameMissing || firstNameMissing || lastNameMissing) return;

    onSubmit({
      username:  form.username,
      firstName: form.firstName,
      lastName:  form.lastName,
      role:      form.role,
    });
  };

  return (
    <FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}

      <div className="grid gap-7 sm:grid-cols-2">
        <Field data-invalid={(touched.username && usernameMissing) || undefined}>
          <FieldLabel htmlFor="user-username">Username</FieldLabel>
          <Input
            id="user-username"
            value={form.username}
            onChange={set('username')}
            onBlur={touch('username')}
            aria-invalid={(touched.username && usernameMissing) || undefined}
          />
          {touched.username && usernameMissing ? <FieldError>A username is required.</FieldError> : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="user-role">Role</FieldLabel>
          <Select
            value={form.role}
            onValueChange={(value) => setForm((f) => ({ ...f, role: value }))}
            disabled={roleLocked}
          >
            <SelectTrigger id="user-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roleLocked ? <FieldDescription>You cannot change your own role.</FieldDescription> : null}
        </Field>

        <Field data-invalid={(touched.firstName && firstNameMissing) || undefined}>
          <FieldLabel htmlFor="user-first-name">First name</FieldLabel>
          <Input
            id="user-first-name"
            value={form.firstName}
            onChange={set('firstName')}
            onBlur={touch('firstName')}
            aria-invalid={(touched.firstName && firstNameMissing) || undefined}
          />
          {touched.firstName && firstNameMissing ? <FieldError>A first name is required.</FieldError> : null}
        </Field>

        <Field data-invalid={(touched.lastName && lastNameMissing) || undefined}>
          <FieldLabel htmlFor="user-last-name">Last name</FieldLabel>
          <Input
            id="user-last-name"
            value={form.lastName}
            onChange={set('lastName')}
            onBlur={touch('lastName')}
            aria-invalid={(touched.lastName && lastNameMissing) || undefined}
          />
          {touched.lastName && lastNameMissing ? <FieldError>A last name is required.</FieldError> : null}
        </Field>
      </div>

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
