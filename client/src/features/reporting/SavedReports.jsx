// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/SavedReports.jsx
//
// Saved reports on the Operations page. SavedReportsBar lists them (pinned
// first) with a Manage view for email schedules, pinning, "send now" and
// removing. SaveReport is the "Save this report" form under a result.
// Scheduled emails go only to the report's owner.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Bookmark, Pin, PinOff, Send, Trash2, Mail } from 'lucide-react';
import { deleteSaved, saveReport, sendSavedNow, updateSaved } from '../../services/reportingAPI';

const MUTED = 'var(--ink-soft)';
const LINE = 'var(--line)';

const SCHEDULES = [
  ['none', 'No email'],
  ['weekly', 'Email me weekly (Mondays)'],
  ['monthly', 'Email me monthly (the 1st)'],
];
const scheduleWord = { weekly: 'weekly', monthly: 'monthly' };

export function SavedReportsBar({ items, onOpen, onChanged }) {
  const [managing, setManaging] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [note, setNote] = useState(null);
  if (!items?.length) return null;

  const act = async (id, fn, done) => {
    setBusyId(id);
    setNote(null);
    try {
      const res = await fn();
      if (done) setNote(done(res?.data ?? res));
      await onChanged?.();
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-6 rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4" style={{ borderColor: LINE }} aria-label="Saved reports">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 inline-flex items-center gap-1.5 text-sm font-semibold">
          <Bookmark aria-hidden="true" className="h-4 w-4" /> Saved reports
        </h2>
        {items.map((s) => (
          <button key={s.id} type="button" onClick={() => onOpen(s)}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium hover:bg-ink/5"
            style={{ borderColor: s.pinned ? 'var(--ink)' : LINE }}>
            {s.pinned && <Pin aria-label="Pinned" className="h-3 w-3" />}
            {s.title}
            {s.schedule !== 'none' && <Mail aria-label={`Emailed ${scheduleWord[s.schedule]}`} className="h-3 w-3" style={{ color: MUTED }} />}
          </button>
        ))}
        <button type="button" onClick={() => setManaging((m) => !m)} aria-expanded={managing}
          className="ml-auto text-xs underline underline-offset-2">
          {managing ? 'Done' : 'Manage'}
        </button>
      </div>

      {note && <p role="status" className="mt-2 text-xs" style={{ color: MUTED }}>{note}</p>}

      {managing && (
        <ul className="mt-3 divide-y text-sm" style={{ borderColor: LINE }}>
          {items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2" style={{ borderColor: LINE }}>
              <span className="min-w-40 flex-1 font-medium">{s.title}</span>
              <label className="inline-flex items-center gap-1 text-xs">
                <span className="sr-only">Email schedule for {s.title}</span>
                <select value={s.schedule} disabled={busyId === s.id}
                  onChange={(e) => act(s.id, () => updateSaved(s.id, { schedule: e.target.value }))}
                  className="rounded-lg border bg-surface px-1.5 py-0.5" style={{ borderColor: LINE }}>
                  {SCHEDULES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <button type="button" disabled={busyId === s.id} title={s.pinned ? 'Unpin' : 'Pin to the top'}
                aria-label={s.pinned ? `Unpin ${s.title}` : `Pin ${s.title}`}
                onClick={() => act(s.id, () => updateSaved(s.id, { pinned: !s.pinned }))}
                className="rounded-lg border p-1" style={{ borderColor: LINE }}>
                {s.pinned ? <PinOff aria-hidden="true" className="h-3.5 w-3.5" /> : <Pin aria-hidden="true" className="h-3.5 w-3.5" />}
              </button>
              <button type="button" disabled={busyId === s.id} aria-label={`Email ${s.title} to me now`} title="Email it to me now"
                onClick={() => act(s.id, () => sendSavedNow(s.id),
                  (r) => (r?.stubbed ? `Email is switched off on this server, so "${s.title}" was not really sent.` : `"${s.title}" sent to ${r?.to}.`))}
                className="rounded-lg border p-1" style={{ borderColor: LINE }}>
                <Send aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={busyId === s.id} aria-label={`Remove ${s.title}`} title="Remove"
                onClick={() => { if (window.confirm(`Remove "${s.title}"?`)) act(s.id, () => deleteSaved(s.id)); }}
                className="rounded-lg border p-1" style={{ borderColor: LINE, color: 'var(--rag-bad)' }}>
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
              {s.last_error && <span className="w-full text-xs" style={{ color: 'var(--rag-bad)' }}>Last email failed: {s.last_error}</span>}
              {!s.last_error && s.last_sent_at && (
                <span className="w-full text-xs" style={{ color: MUTED }}>Last emailed {new Date(s.last_sent_at).toLocaleDateString('en-GB')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SaveReport({ kind, spec, defaultTitle, preset, onSaved }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [schedule, setSchedule] = useState('none');
  const [pinned, setPinned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  if (done) return <p role="status" className="text-xs" style={{ color: MUTED }}>Saved. It is at the top of the page under Saved reports.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">
        <Bookmark aria-hidden="true" className="h-3.5 w-3.5" /> Save this report
      </button>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveReport({ kind, spec, title, schedule, pinned, preset });
      setDone(true);
      await onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-xs">
      <label className="inline-flex items-center gap-1">
        <span style={{ color: MUTED }}>Name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus
          className="w-64 rounded-lg border bg-surface px-1.5 py-0.5" style={{ borderColor: LINE }} />
      </label>
      <label className="inline-flex items-center gap-1">
        <span className="sr-only">Email schedule</span>
        <select value={schedule} onChange={(e) => setSchedule(e.target.value)}
          className="rounded-lg border bg-surface px-1.5 py-0.5" style={{ borderColor: LINE }}>
          {SCHEDULES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="inline-flex cursor-pointer items-center gap-1">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to the top
      </label>
      <button type="submit" disabled={busy || !title.trim()} className="rounded-lg bg-ink px-2 py-0.5 font-bold text-on-ink disabled:opacity-50">
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="underline underline-offset-2">Cancel</button>
      {schedule !== 'none' && (
        <span className="w-full" style={{ color: MUTED }}>
          The email goes to your own address and covers the last full {schedule === 'weekly' ? 'week' : 'month'}.
        </span>
      )}
      {error && <span role="alert" className="w-full" style={{ color: 'var(--rag-bad)' }}>{error}</span>}
    </form>
  );
}
