// ─────────────────────────────────────────────────────────────
// client/src/pages/InviteAcceptPage.jsx
//
// Public, no session — the invitee has never seen this system before.
// Modelled on Section18AFormPage.jsx's public-token shape, with one
// deliberate difference: three distinct terminal states instead of
// one generic failure message. "Cancelled" and "expired" read
// differently on purpose (see userInvite.service.js's three-way error
// split) — a cancelled invite means "ask your admin", an expired one
// means "ask your admin for a new link", and an already-used one
// means "you already have an account, go log in".
//
// ROLE IS NEVER SUBMITTED. The form below has no role field at all —
// the server reads it off the invite and ignores anything sent in the
// body (see userInvite.service.js's acceptInvite). This page only
// ever *displays* the role for the invitee's own information.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2, Eye, EyeOff, Ban, Clock, MailWarning } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Field, FieldGroup, FieldLabel, FieldError,
} from '@/components/ui/field';
import {
  InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton,
} from '@/components/ui/input-group';
import userInviteAPI from '@/services/userInviteAPI';

const ROLE_LABELS = {
  warehouse_worker: 'Worker',
  manager:           'Manager',
  admin:             'Admin',
};

const MIN_PASSWORD_LENGTH = 8;

// ── Terminal states: reason -> what to tell them ────────────────
const STATUS_COPY = {
  revoked: {
    icon: Ban,
    title: 'This invite was cancelled',
    body: "The admin who sent it cancelled it before you accepted. Ask them for a new invite if you still need an account.",
  },
  expired: {
    icon: Clock,
    title: 'This invite link has expired',
    body: 'Invite links only last 7 days. Ask your admin to send you a new one.',
  },
  accepted: {
    icon: CheckCircle,
    title: 'This invite has already been used',
    body: 'An account was already set up from this link. If that was you, go to the login page. If not, ask your admin.',
  },
  not_found: {
    icon: MailWarning,
    title: "This invite link doesn't work",
    body: 'Check that you copied the whole link. If it still doesn’t work, ask your admin to send a new one.',
  },
};

const StatusScreen = ({ reason }) => {
  const navigate = useNavigate();
  const copy = STATUS_COPY[reason] ?? STATUS_COPY.not_found;
  const Icon = copy.icon;
  return (
    <Card className="mx-auto max-w-md rounded-[12px] border border-line">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Icon className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <Button type="button" variant="outline" className="mt-2" onClick={() => navigate('/login')}>
          Go to login
        </Button>
      </CardContent>
    </Card>
  );
};

export default function InviteAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusReason, setStatusReason] = useState(null); // set on 404/410

  const [form, setForm] = useState({
    username: '', firstName: '', lastName: '', password: '', confirmPassword: '',
  });
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    userInviteAPI.resolveInvite(token)
      .then((data) => { if (!cancelled) setInvite(data); })
      .catch((err) => {
        if (cancelled) return;
        // reason is set for 410s (expired/revoked/accepted); a plain
        // 404 (bad/garbled token) or 400 (empty) has none — both read
        // as "this link doesn't work" to someone who never had a
        // valid one to begin with.
        setStatusReason(err.reason ?? 'not_found');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));

  const usernameMissing  = !form.username.trim();
  const firstNameMissing = !form.firstName.trim();
  const lastNameMissing  = !form.lastName.trim();
  const passwordInvalid  = form.password.length < MIN_PASSWORD_LENGTH;
  const confirmMismatch  = form.password !== form.confirmPassword;

  const submit = async (event) => {
    event.preventDefault();
    setTouched({ username: true, firstName: true, lastName: true, password: true, confirmPassword: true });
    if (usernameMissing || firstNameMissing || lastNameMissing || passwordInvalid || confirmMismatch) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // No role in this payload — see the file header. The server
      // would ignore one anyway, but it is not even offered here.
      await userInviteAPI.acceptInvite(token, {
        username:  form.username,
        firstName: form.firstName,
        lastName:  form.lastName,
        password:  form.password,
      });
      setDone(true);
    } catch (err) {
      if (err.reason) {
        // Someone else accepted, or an admin revoked it, in the
        // moments between this page loading and submitting.
        setStatusReason(err.reason);
      } else {
        setSubmitError(err.message || 'Could not complete your account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (statusReason) {
    return (
      <main className="min-h-screen bg-canvas px-4 py-8 text-ink">
        <StatusScreen reason={statusReason} />
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-canvas px-4 py-8 text-ink">
        <Card className="mx-auto max-w-md rounded-[12px] border border-line">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle className="size-10 text-good" />
            <h1 className="text-lg font-semibold">Your account is ready</h1>
            <p className="text-sm text-muted-foreground">
              Sign in with the username and password you just chose.
            </p>
            <Button className="mt-2" onClick={() => navigate('/login')}>Go to login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink">
      <Card className="mx-auto max-w-md rounded-[12px] border border-line">
        <CardHeader>
          <CardTitle>Set up your account</CardTitle>
          <p className="text-sm text-muted-foreground">
            {invite?.inviterName ? `${invite.inviterName} invited you` : "You've been invited"} to join
            as a <span className="font-medium text-foreground">{ROLE_LABELS[invite?.role] ?? invite?.role}</span>.
            {invite?.email ? <> This invite was sent to <span className="font-medium text-foreground">{invite.email}</span>.</> : null}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              {submitError ? <FieldError>{submitError}</FieldError> : null}

              <Field data-invalid={(touched.username && usernameMissing) || undefined}>
                <FieldLabel htmlFor="accept-username">Choose a username</FieldLabel>
                <Input
                  id="accept-username"
                  value={form.username}
                  onChange={set('username')}
                  onBlur={touch('username')}
                  aria-invalid={(touched.username && usernameMissing) || undefined}
                />
                {touched.username && usernameMissing ? <FieldError>A username is required.</FieldError> : null}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={(touched.firstName && firstNameMissing) || undefined}>
                  <FieldLabel htmlFor="accept-first-name">First name</FieldLabel>
                  <Input
                    id="accept-first-name"
                    value={form.firstName}
                    onChange={set('firstName')}
                    onBlur={touch('firstName')}
                    aria-invalid={(touched.firstName && firstNameMissing) || undefined}
                  />
                  {touched.firstName && firstNameMissing ? <FieldError>Required.</FieldError> : null}
                </Field>
                <Field data-invalid={(touched.lastName && lastNameMissing) || undefined}>
                  <FieldLabel htmlFor="accept-last-name">Last name</FieldLabel>
                  <Input
                    id="accept-last-name"
                    value={form.lastName}
                    onChange={set('lastName')}
                    onBlur={touch('lastName')}
                    aria-invalid={(touched.lastName && lastNameMissing) || undefined}
                  />
                  {touched.lastName && lastNameMissing ? <FieldError>Required.</FieldError> : null}
                </Field>
              </div>

              <Field data-invalid={(touched.password && passwordInvalid) || undefined}>
                <FieldLabel htmlFor="accept-password">Choose a password</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="accept-password"
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
                <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
                {touched.password && passwordInvalid ? (
                  <FieldError>Password must be at least {MIN_PASSWORD_LENGTH} characters.</FieldError>
                ) : null}
              </Field>

              <Field data-invalid={(touched.confirmPassword && confirmMismatch) || undefined}>
                <FieldLabel htmlFor="accept-confirm-password">Confirm password</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="accept-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={set('confirmPassword')}
                    onBlur={touch('confirmPassword')}
                    aria-invalid={(touched.confirmPassword && confirmMismatch) || undefined}
                  />
                </InputGroup>
                {touched.confirmPassword && confirmMismatch ? <FieldError>Passwords do not match.</FieldError> : null}
              </Field>

              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                {submitting ? 'Creating your account' : 'Create my account'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
