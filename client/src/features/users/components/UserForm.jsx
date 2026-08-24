// ─────────────────────────────────────────────────────────────
// client/src/features/users/components/UserForm.jsx
//
// Create and edit in one component, same reasoning as
// SupplierForm.jsx: the fields overlap almost entirely and two copies
// would drift.
//
// PASSWORD IS SET-ON-CREATE ONLY.
// The field only renders when there is no `initial` (i.e. create
// mode). Editing an existing user never shows or submits a password —
// resetting one is a deliberate future addition, not this form's job
// (see user.service.js: updateUser has no password branch at all).
// confirmPassword is client-only state, used to catch a typo before
// submit — it is never included in the payload sent to the server.
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
  InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton,
} from '@/components/ui/input-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

// Display labels only — every stored/validated/API value stays
// warehouse_worker, matching the live users.role CHECK constraint.
const ROLE_OPTIONS = [
  { value: 'warehouse_worker', label: 'Worker' },
  { value: 'manager',          label: 'Manager' },
  { value: 'admin',            label: 'Admin' },
];

const BLANK = {
  username: '', firstName: '', lastName: '', role: 'warehouse_worker',
  password: '', confirmPassword: '',
};

export default function UserForm({
  initial = null,
  isSelf = false,
  submitLabel = 'Create user',
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({ ...BLANK, ...(initial ?? {}) });
  const [touched, setTouched] = useState({});
  // Shared by both password inputs — one toggle reveals or hides them
  // together, same as the SHOW/HIDE control on LoginPage.jsx.
  const [showPassword, setShowPassword] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));

  const usernameMissing  = !String(form.username ?? '').trim();
  const firstNameMissing = !String(form.firstName ?? '').trim();
  const lastNameMissing  = !String(form.lastName ?? '').trim();
  const passwordInvalid  = !isEdit && String(form.password ?? '').length < MIN_PASSWORD_LENGTH;
  const confirmMismatch  = !isEdit && form.password !== form.confirmPassword;
  const roleLocked       = isEdit && isSelf && form.role === 'admin';

  const submit = () => {
    setTouched({
      username: true, firstName: true, lastName: true,
      password: true, confirmPassword: true,
    });
    if (usernameMissing || firstNameMissing || lastNameMissing || passwordInvalid || confirmMismatch) return;

    const payload = {
      username:  form.username,
      firstName: form.firstName,
      lastName:  form.lastName,
      role:      form.role,
    };
    // confirmPassword never leaves the browser — it exists only to
    // catch a typo before submit.
    if (!isEdit) payload.password = form.password;

    onSubmit(payload);
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

      {!isEdit ? (
        <div className="grid gap-7 sm:grid-cols-2">
          <Field data-invalid={(touched.password && passwordInvalid) || undefined}>
            <FieldLabel htmlFor="user-password">Password</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="user-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                onBlur={touch('password')}
                aria-invalid={(touched.password && passwordInvalid) || undefined}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>At least {MIN_PASSWORD_LENGTH} characters.</FieldDescription>
            {touched.password && passwordInvalid ? (
              <FieldError>Password must be at least {MIN_PASSWORD_LENGTH} characters.</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={(touched.confirmPassword && confirmMismatch) || undefined}>
            <FieldLabel htmlFor="user-confirm-password">Confirm password</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="user-confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                onBlur={touch('confirmPassword')}
                aria-invalid={(touched.confirmPassword && confirmMismatch) || undefined}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {touched.confirmPassword && confirmMismatch ? (
              <FieldError>Passwords do not match.</FieldError>
            ) : null}
          </Field>
        </div>
      ) : null}

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
