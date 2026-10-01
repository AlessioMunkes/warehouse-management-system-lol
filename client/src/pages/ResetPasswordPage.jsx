// ─────────────────────────────────────────────────────────────
// client/src/pages/ResetPasswordPage.jsx
//
// Public, no session — same footing as InviteAcceptPage.jsx, which
// this is structured on directly: resolve the token on mount, show a
// distinct terminal screen per failure reason, otherwise a form.
//
// FOUR TERMINAL STATES, not three. InviteAcceptPage has
// revoked/expired/accepted; this has expired/used/superseded/not-found
// — 'superseded' is the one difference, for passwordReset.service.js's
// own reason (a reset link has no admin-facing "cancel", but it can be
// made stale by a newer request for the same account).
//
// NO ROLE, NO USERNAME. Unlike accepting an invite, this never creates
// an account — it only ever changes the password on one that already
// exists, resolved entirely from the token. The form below asks for
// nothing but the new password, twice.
//
// NO-REFERRER. Inserted and removed with this page's own lifetime via
// a <meta> tag (there's no per-route document to put it in statically
// — this is a SPA). The URL this page is loaded at contains the raw
// reset token; without this, following a link in the markup below (or
// loading a request with a Referer header) would hand that token to
// whatever the browser's default referrer policy sends it to.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2, Eye, EyeOff, Clock, MailWarning, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field, FieldGroup, FieldLabel, FieldError,
} from '@/components/ui/field';
import {
  InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton,
} from '@/components/ui/input-group';
import passwordResetAPI from '@/services/passwordResetAPI';

// The Montserrat stack and 26px radius are the worker-UI retone's
// current tokens (staff.css's --stf-font-sans / --stf-radius) — this
// page isn't inside .stf-shell so it can't read those as CSS
// variables, but the literal values are copied here rather than
// invented, same as guest.css's own header explains doing for its
// borrowed tokens.
const PAGE_FONT = '"Montserrat", "Open Sans", Helvetica, sans-serif';
const CURRENT_RADIUS = 'rounded-[26px]';
// --brand IS #ef3a40 (see index.css) — a theme token, not the literal
// hex. NoHardcodedColours.test.js forbids writing the hex itself
// outside a short, documented allowlist this page isn't on.
const ACCENT_BUTTON = 'bg-brand text-on-brand hover:bg-brand-deep';

const MIN_PASSWORD_LENGTH = 8;

// ── Terminal states: reason -> what to tell them ────────────────
const STATUS_COPY = {
  expired: {
    icon: Clock,
    title: 'This reset link has expired',
    body: 'Reset links only last 1 hour. Request a new one below.',
  },
  used: {
    icon: CheckCircle,
    title: 'This reset link has already been used',
    body: 'If that was you, sign in with your new password. If not, request a new link and let your manager know.',
  },
  superseded: {
    icon: RefreshCw,
    title: 'A newer reset link was sent',
    body: 'Another reset was requested for this account after this link was sent. Use the newest email, or request another below.',
  },
  not_found: {
    icon: MailWarning,
    title: "This reset link doesn't work",
    body: 'Check that you copied the whole link, or request a new one below.',
  },
};

const StatusScreen = ({ reason }) => {
  const navigate = useNavigate();
  const copy = STATUS_COPY[reason] ?? STATUS_COPY.not_found;
  const Icon = copy.icon;
  return (
    <Card className={`mx-auto max-w-md ${CURRENT_RADIUS} border border-line`}>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Icon className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-2 flex flex-col items-center gap-2">
          <Button
            type="button"
            className={ACCENT_BUTTON}
            onClick={() => navigate('/login?forgot=1')}
          >
            Request a new link
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/login')}>
            Back to login
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [statusReason, setStatusReason] = useState(null); // set when the token isn't usable

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Scoped to this page's lifetime only — see the file header.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    passwordResetAPI.resolveReset(token)
      .then(() => { /* { valid: true } — nothing else to read off it */ })
      .catch((err) => {
        if (cancelled) return;
        // reason is set for 410s (expired/used/superseded); a plain
        // 404 (bad/garbled token) or 400 (empty) has none — both read
        // as "this link doesn't work" to someone who never had a
        // usable one to begin with.
        setStatusReason(err.reason ?? 'not_found');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }));
  const passwordInvalid = password.length < MIN_PASSWORD_LENGTH;
  const confirmMismatch = password !== confirmPassword;

  const submit = async (event) => {
    event.preventDefault();
    setTouched({ password: true, confirmPassword: true });
    if (passwordInvalid || confirmMismatch) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await passwordResetAPI.confirmReset(token, password);
      navigate('/login', { state: { message: 'Password updated, sign in.' } });
    } catch (err) {
      if (err.reason) {
        // The link became unusable (expired/used/superseded) in the
        // moments between this page loading and submitting.
        setStatusReason(err.reason);
      } else {
        setSubmitError(err.message || 'Could not reset your password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ fontFamily: PAGE_FONT }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (statusReason) {
    return (
      <main className="min-h-screen bg-canvas px-4 py-8 text-ink" style={{ fontFamily: PAGE_FONT }}>
        <StatusScreen reason={statusReason} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink" style={{ fontFamily: PAGE_FONT }}>
      <Card className={`mx-auto max-w-md ${CURRENT_RADIUS} border border-line`}>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your new password takes effect immediately.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              {submitError ? <FieldError>{submitError}</FieldError> : null}

              <Field data-invalid={(touched.password && passwordInvalid) || undefined}>
                <FieldLabel htmlFor="reset-password">New password</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={touch('password')}
                    autoComplete="new-password"
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
                <FieldLabel htmlFor="reset-confirm-password">Confirm new password</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="reset-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={touch('confirmPassword')}
                    autoComplete="new-password"
                    aria-invalid={(touched.confirmPassword && confirmMismatch) || undefined}
                  />
                </InputGroup>
                {touched.confirmPassword && confirmMismatch ? <FieldError>Passwords do not match.</FieldError> : null}
              </Field>

              <Button type="submit" disabled={submitting} className={ACCENT_BUTTON}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                {submitting ? 'Updating password' : 'Update password'}
              </Button>

              <Button type="button" variant="ghost" onClick={() => navigate('/login')}>
                Back to login
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
