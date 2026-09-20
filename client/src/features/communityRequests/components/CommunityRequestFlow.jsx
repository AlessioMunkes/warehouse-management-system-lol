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
import CommunityRequestForm from './CommunityRequestForm';
import { Notice, ChoiceList } from '../../staff/components/StepPrimitives';

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
          <CommunityRequestForm onSubmit={handleLog} busy={logBusy} error={logError} />
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

          {loading ? (
            <div className="stf-skeleton" aria-label="Loading" />
          ) : requests.length === 0 ? (
            <div className="stf-empty">
              Nothing open right now. Every request that's come in has been resolved.
            </div>
          ) : (
            <div className="stf-list">
              {requests.map((r) => (
                <div key={r.id} className="stf-row is-static" style={{ flexWrap: 'wrap' }}>
                  <span className="stf-row-main">
                    <span className="stf-row-title">{r.callerName || 'Unnamed caller'}</span>
                    <span className="stf-row-meta">
                      {r.itemsRequested} · {fmtDateTime(r.requestedAt)}
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
