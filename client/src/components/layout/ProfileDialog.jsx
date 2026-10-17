// ─────────────────────────────────────────────────────────────
// client/src/components/layout/ProfileDialog.jsx
//
// Profile, from the account menu: who you are signed in as, and the two
// things you can change yourself, your email and your password. Both
// ask for your current password (the server checks it), so a session
// left open on a shared floor tablet is not enough to take the account
// over. Name, username and role are changed by an admin on Users.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ErrorBanner from '@/components/ui/error-banner';
import Notice from '@/components/ui/notice';
import { useAuth } from '../../context/AuthContext';
import accountAPI from '../../services/accountAPI';

const MIN_PASSWORD = 8;

const Row = ({ label, value, action }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {/* A person's own details are data, never translated. */}
      <dd className="text-sm font-medium break-words" translate="no">{value}</dd>
    </div>
    {action}
  </div>
);

const Field = ({ id, label, ...props }) => (
  <label htmlFor={id} className="grid gap-1.5 text-sm">
    <span className="font-medium">{label}</span>
    <Input id={id} {...props} />
  </label>
);

function EmailForm({ current, onDone, onCancel }) {
  const { user, refreshFromClaim } = useAuth();
  const [email, setEmail] = useState(current ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ready = email.trim() !== '' && password !== '';

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try {
      const saved = await accountAPI.changeEmail(password, email.trim());
      refreshFromClaim({ ...user, email: saved });
      onDone('Email changed.');
    } catch (err) {
      setError(err.message || 'Could not change your email. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-line p-3">
      <Field id="profile-email" label="New email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field id="profile-email-password" label="Current password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <ErrorBanner message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!ready || busy} loading={busy}>{busy ? 'Saving' : 'Save email'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function PasswordForm({ onDone, onCancel }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const tooShort = next !== '' && next.length < MIN_PASSWORD;
  const mismatch = again !== '' && again !== next;
  const ready = current !== '' && next.length >= MIN_PASSWORD && again === next;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try {
      await accountAPI.changePassword(current, next);
      onDone('Password changed. Use it the next time you log in.');
    } catch (err) {
      setError(err.message || 'Could not change your password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-line p-3">
      <Field id="profile-current-password" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Field id="profile-new-password" label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={tooShort || undefined} />
      {tooShort ? <p className="text-xs text-danger">{`Use at least ${MIN_PASSWORD} characters.`}</p> : null}
      <Field id="profile-new-password-again" label="New password again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={mismatch || undefined} />
      {mismatch ? <p className="text-xs text-danger">The two new passwords do not match.</p> : null}
      <ErrorBanner message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!ready || busy} loading={busy}>{busy ? 'Saving' : 'Save password'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export default function ProfileDialog({ open, onOpenChange, user, roleLabel }) {
  const [editing, setEditing] = useState(null);     // 'email' | 'password' | null
  const [notice, setNotice] = useState(null);
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const done = (message) => { setEditing(null); setNotice(message); };
  const change = (what) => (
    <Button type="button" variant="outline" size="sm" onClick={() => { setNotice(null); setEditing(what); }}>Change</Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) { setEditing(null); setNotice(null); } onOpenChange(next); }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>
            Change your email or password here. An admin changes your name and role.
          </DialogDescription>
        </DialogHeader>
        <Notice message={notice} onClear={() => setNotice(null)} />
        <dl>
          <Row label="Name" value={fullName || 'Not recorded'} />
          <Row label="Username" value={user?.username || 'Not recorded'} />
          <Row label="Email" value={user?.email || 'No email on record'} action={editing === 'email' ? null : change('email')} />
          {editing === 'email' ? (
            <div className="py-2.5"><EmailForm current={user?.email} onDone={done} onCancel={() => setEditing(null)} /></div>
          ) : null}
          <Row label="Password" value="••••••••" action={editing === 'password' ? null : change('password')} />
          {editing === 'password' ? (
            <div className="py-2.5"><PasswordForm onDone={done} onCancel={() => setEditing(null)} /></div>
          ) : null}
          <Row label="Role" value={roleLabel} />
        </dl>
      </DialogContent>
    </Dialog>
  );
}
