// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/components/CommunityRequestFlow.jsx
//
// The phone-first counterpart to CommunityRequestsPage.jsx's desktop
// table — same pattern FeedTheSoilPage.jsx already uses: one URL, two
// shapes picked by role. A manager gets the ManagerLayout table; a
// warehouse worker gets this, inside StaffShell.
//
// Two tabs, not a wizard: logging a request and working the open
// queue are two different tasks a worker moves between all day, not
// steps in one flow. Reuses CommunityRequestForm as-is — its shadcn
// fields already read consistently inside StaffShell now that the
// worker and manager colour/type tokens are unified (see staff.css).
//
// Claim and resolve stay separate actions here exactly as they are on
// the desktop table (see communityRequestAPI.js's own note): a
// request can be resolved whether or not anyone claimed it first.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import communityRequestAPI, { RESOLVE_OUTCOMES, OUTCOME_LABELS } from '../../../services/communityRequestAPI';
import { Notice, ChoiceList, TextField, Actions, Button } from '../../staff/components/StepPrimitives';
import ListTools, { NoMatches } from '../../staff/components/ListTools';
import useListSearch from '../../staff/hooks/useListSearch';

// Item and caller — matches the desktop table's own "Search by item or
// caller name" (CommunityRequestsPage.jsx). Module level so its
// identity is stable, same reasoning as every other *Text helper in
// this codebase.
const requestText = (r) => [r.itemsRequested, r.callerName].filter(Boolean).join(' ');

const TABS = [
  { key: 'log',  label: 'Log a request' },
  { key: 'open', label: 'Open requests' },
];

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';

// The phone-first equivalent of CommunityRequestForm.jsx — same
// fields, same validation (itemsRequested is the only required one,
// BR-28), same requestedAt null-mapping, but built on StepPrimitives'
// .stf-* fields instead of the shadcn Field/Button/Input/Textarea the
// original uses.
//
// WHY A SEPARATE FORM RATHER THAN REUSING THAT ONE
// CommunityRequestForm.jsx is shared with the manager's desktop table
// (CommunityRequestsPage.jsx) and is built on shadcn on purpose — the
// manager's own vocabulary, same as every other manager form. Reused
// as-is here, it put a shadcn button (Tailwind's font, index.css's
// --primary) next to every other worker screen's .stf-btn-primary CTA
// (staff.css's own --stf-ink, Montserrat) — close enough to read as
// the same button and different enough that "Log request" and Feed
// the Soil's "Log a collection" looked like two different systems
// side by side, which is exactly what was reported. Same trade-off
// DecantingFlow/DecantingPlanner and FeedTheSoilFlow/
// FeedTheSoilManagerView already make: one small form per audience,
// not one straddling both.
function LogRequestForm({ onSubmit, busy, error }) {
  const [form, setForm] = useState({
    callerName: '', callerContact: '', itemsRequested: '', quantityNote: '', requestedAt: '',
  });
  const [touchedItems, setTouchedItems] = useState(false);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const itemsMissing = !form.itemsRequested.trim();
  const itemsInvalid = touchedItems && itemsMissing;

  const submit = () => {
    setTouchedItems(true);
    if (itemsMissing) return;
    onSubmit({ ...form, requestedAt: form.requestedAt === '' ? null : form.requestedAt });
  };

  return (
    <>
      {error ? <Notice tone="warn">{error}</Notice> : null}

      <div className="stf-field">
        <label className="stf-field-label" htmlFor="stf-cr-items">What was requested</label>
        <textarea
          id="stf-cr-items"
          className="stf-input is-text"
          style={{ minHeight: '72px', paddingTop: '12px', paddingBottom: '12px' }}
          rows={3}
          value={form.itemsRequested}
          onChange={(e) => set('itemsRequested')(e.target.value)}
          onBlur={() => setTouchedItems(true)}
          placeholder="e.g. Samp, sugar beans, cooking oil"
        />
        <p className="stf-field-hint">
          {itemsInvalid ? 'Describe what was requested.' : 'No stock code required.'}
        </p>
      </div>

      <TextField
        id="stf-cr-caller-name" label="Caller name"
        value={form.callerName} onChange={set('callerName')}
        placeholder="Optional"
      />
      <TextField
        id="stf-cr-caller-contact" label="Preferred contact"
        value={form.callerContact} onChange={set('callerContact')}
        placeholder="Phone, WhatsApp, email…"
      />
      <TextField
        id="stf-cr-quantity-note" label="Quantity note"
        value={form.quantityNote} onChange={set('quantityNote')}
        placeholder="e.g. Enough for roughly 80 plates"
        hint="Approximate is fine."
      />

      <div className="stf-field">
        <label className="stf-field-label" htmlFor="stf-cr-requested-at">Date &amp; time of request</label>
        <input
          id="stf-cr-requested-at"
          className="stf-input is-text"
          type="datetime-local"
          value={form.requestedAt}
          onChange={(e) => set('requestedAt')(e.target.value)}
        />
        <p className="stf-field-hint">Defaults to now.</p>
      </div>

      <Actions>
        <Button disabled={busy} onClick={submit}>{busy ? 'Saving' : 'Log request'}</Button>
      </Actions>
    </>
  );
}

// Same construction as NotesField.jsx in the donation flow — a
// .stf-input textarea, not the single-line TextField from
// StepPrimitives, because an outcome note is a sentence, not a value.
function NoteField({ value, onChange, error }) {
  return (
    <div className="stf-field">
      <label className="stf-field-label" htmlFor="stf-cr-note">Note</label>
      <textarea
        id="stf-cr-note"
        className="stf-input is-text"
        style={{ minHeight: '72px', paddingTop: '12px', paddingBottom: '12px' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What was given, referred, or why it was declined."
      />
      {error ? <p className="stf-field-hint">{error}</p> : null}
    </div>
  );
}

function ResolveForm({ onSubmit, onCancel, busy, error }) {
  const [outcome, setOutcome] = useState('fulfilled');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const noteMissing = !note.trim();

  const submit = () => {
    setTouched(true);
    if (noteMissing) return;
    onSubmit({ outcome, outcomeNote: note });
  };

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <ChoiceList
        legend="Outcome"
        options={RESOLVE_OUTCOMES.map((o) => ({ value: o, label: OUTCOME_LABELS[o] }))}
        value={outcome}
        onChange={setOutcome}
      />
      <NoteField
        value={note}
        onChange={setNote}
        error={touched && noteMissing ? 'A note is required to resolve a request.' : null}
      />
      <div className="stf-actions is-row">
        <button type="button" className="stf-btn stf-btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="stf-btn stf-btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Save outcome'}
        </button>
      </div>
    </div>
  );
}

export default function CommunityRequestFlow({ onCrumbChange }) {
  const [tab, setTab] = useState('log');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [logBusy, setLogBusy] = useState(false);
  const [logError, setLogError] = useState(null);
  const [claimingId, setClaimingId] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const search = useListSearch(requests, requestText);

  useEffect(() => {
    onCrumbChange?.(tab === 'log' ? 'Log a request' : 'Open requests');
  }, [tab, onCrumbChange]);

  useEffect(() => {
    if (tab !== 'open') return;
    let cancelled = false;
    setLoading(true);
    communityRequestAPI.getRequests({ outcome: 'pending' })
      .then((rows) => { if (!cancelled) { setRequests(rows); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load requests.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, reloadToken]);

  const changeTab = (nextTab) => {
    setTab(nextTab);
    setResolvingId(null);
    setNotice(null);
  };

  const handleLog = async (payload) => {
    setLogBusy(true);
    setLogError(null);
    try {
      await communityRequestAPI.logRequest(payload);
      setNotice('Request logged.');
      setTab('open');
      setReloadToken((t) => t + 1);
    } catch (err) {
      setLogError(err.message || 'Could not log the request.');
    } finally {
      setLogBusy(false);
    }
  };

  const handleClaim = async (id) => {
    setClaimingId(id);
    setError(null);
    try {
      await communityRequestAPI.claimRequest(id);
      setNotice('Request claimed.');
      setReloadToken((t) => t + 1);
    } catch (err) {
      setError(err.message || 'Could not claim this request.');
    } finally {
      setClaimingId(null);
    }
  };

  const handleResolve = async ({ outcome, outcomeNote }) => {
    setResolveBusy(true);
    setResolveError(null);
    try {
      await communityRequestAPI.resolveRequest(resolvingId, { outcome, outcomeNote });
      setResolvingId(null);
      setNotice(`Marked ${OUTCOME_LABELS[outcome].toLowerCase()}.`);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setResolveError(err.message || 'Could not resolve this request.');
    } finally {
      setResolveBusy(false);
    }
  };

  return (
    <div className="stf-step">
      <div className="stf-segments" role="tablist" aria-label="Benevolent requests">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`stf-segment${tab === t.key ? ' is-active' : ''}`}
            onClick={() => changeTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice ? <Notice>{notice}</Notice> : null}

      {tab === 'log' ? (
        <>
          <div className="stf-step-head">
            <h1 className="stf-step-title" tabIndex={-1}>Log a request</h1>
            <p className="stf-step-sub">
              A member of the public phoned in or walked in asking for goods.
              This only logs it — nothing here moves stock.
            </p>
          </div>
          <LogRequestForm onSubmit={handleLog} busy={logBusy} error={logError} />
        </>
      ) : (
        <>
          <div className="stf-step-head">
            <h1 className="stf-step-title" tabIndex={-1}>Open requests</h1>
            <p className="stf-step-sub">
              Not yet resolved. Claim one to take ownership, or resolve it straight away.
            </p>
          </div>

          {error ? <Notice tone="warn">{error}</Notice> : null}

          {!loading && requests.length > 0 ? (
            <ListTools
              id="stf-cr-search"
              query={search.query}
              onQuery={search.setQuery}
              placeholder="Search by item or caller name"
            />
          ) : null}

          {loading ? (
            <div className="stf-skeleton" aria-label="Loading" />
          ) : requests.length === 0 ? (
            <div className="stf-empty">
              Nothing open right now. Every request that's come in has been resolved.
            </div>
          ) : search.filtered.length === 0 ? (
            <NoMatches
              query={search.query}
              onClear={() => search.setQuery('')}
              noun="requests"
            />
          ) : (
            <div className="stf-list">
              {search.filtered.map((r) => (
                <div key={r.id} className="stf-row is-static" style={{ flexWrap: 'wrap' }}>
                  <span className="stf-row-main">
                    <span className="stf-row-title">{r.callerName || 'Unnamed caller'}</span>
                    <span className="stf-row-meta">
                      {r.itemsRequested}
                      {r.quantityNote ? ` · ${r.quantityNote}` : ''}
                    </span>
                    <span className="stf-row-meta">
                      {fmtDateTime(r.requestedAt)}
                      {r.callerContact ? ` · ${r.callerContact}` : ''}
                      {r.handledByName ? ` · Claimed by ${r.handledByName}` : ''}
                    </span>
                  </span>

                  {resolvingId === r.id ? null : (
                    <span style={{ display: 'flex', gap: 8 }}>
                      {!r.handledByName ? (
                        <button
                          type="button"
                          className="stf-btn stf-btn-secondary"
                          onClick={() => handleClaim(r.id)}
                          disabled={claimingId === r.id}
                        >
                          {claimingId === r.id ? 'Claiming…' : 'Claim'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="stf-btn stf-btn-primary"
                        onClick={() => { setResolvingId(r.id); setResolveError(null); }}
                      >
                        Resolve
                      </button>
                    </span>
                  )}

                  {resolvingId === r.id ? (
                    <div style={{ width: '100%' }}>
                      <ResolveForm
                        onSubmit={handleResolve}
                        onCancel={() => setResolvingId(null)}
                        busy={resolveBusy}
                        error={resolveError}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
