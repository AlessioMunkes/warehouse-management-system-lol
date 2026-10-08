// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/components/CommunityRequestFlow.jsx
//
// The phone-first counterpart to CommunityRequestsPage.jsx's desktop
// table — same pattern FeedTheSoilPage.jsx already uses: one URL, two
// shapes picked by role. A manager gets the ManagerLayout table; a
// warehouse worker gets this, inside StaffShell.
//
// Two tabs, not a wizard: logging a request and packing approved ones
// are two different tasks a worker moves between all day.
//
//   Log a request   a caller phoned in or walked in; a manager approves
//                   it (choosing the products) before anyone packs.
//   To pack         approved requests that are not waiting for new
//                   items. Claim one (or open the one assigned to you),
//                   fetch what the list says, then confirm what
//                   actually went out. Fewer than approved is fine;
//                   stock only leaves when you confirm.
//
// Workers no longer resolve a request themselves: it has to be
// approved first, and nothing leaves the building without a
// confirmation.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import communityRequestAPI from '../../../services/communityRequestAPI';
import { useAuth } from '../../../context/AuthContext';
import { Notice, TextField, Actions, Button } from '../../staff/components/StepPrimitives';
import ListTools, { NoMatches } from '../../staff/components/ListTools';
import useListSearch from '../../staff/hooks/useListSearch';
import { fmtQty } from '@/lib/quantity';
import {
  FUTURE_REQUEST_MESSAGE, isFutureRequestedAt, localDateTimeValue, withRequestedAtForServer,
} from '../requestedAt';

// Item and caller — matches the desktop table's own "Search by item or
// caller name" (CommunityRequestsPage.jsx), plus the chosen products.
// Module level so its identity is stable, same reasoning as every other
// *Text helper in this codebase.
const requestText = (r) => [
  r.itemsRequested, r.callerName, ...r.items.map((i) => i.productName),
].filter(Boolean).join(' ');

const TABS = [
  { key: 'log',  label: 'Log a request' },
  { key: 'pack', label: 'To pack' },
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

  const requestedAtFuture = isFutureRequestedAt(form.requestedAt);

  const submit = () => {
    setTouchedItems(true);
    if (itemsMissing || requestedAtFuture) return;
    onSubmit(withRequestedAtForServer(form));
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
        id="stf-cr-quantity-note" label="Quantity and collection notes"
        value={form.quantityNote} onChange={set('quantityNote')}
        placeholder="Say how much and when they collect, e.g. 80 plates, Monday"
        hint="Approximate is fine."
      />

      <div className="stf-field">
        <label className="stf-field-label" htmlFor="stf-cr-requested-at">Date &amp; time of request</label>
        <input
          id="stf-cr-requested-at"
          className="stf-input is-text"
          type="datetime-local"
          value={form.requestedAt}
          max={localDateTimeValue()}
          onChange={(e) => set('requestedAt')(e.target.value)}
          aria-invalid={requestedAtFuture || undefined}
        />
        <p className="stf-field-hint">
          {requestedAtFuture ? FUTURE_REQUEST_MESSAGE : 'Leave as is to use the current time.'}
        </p>
      </div>

      <Actions>
        <Button disabled={busy} onClick={submit}>{busy ? 'Saving' : 'Log request'}</Button>
      </Actions>
    </>
  );
}

// Is this request mine to pack: claimed by me, or assigned to me?
const isMine = (r, userId) => userId != null
  && (Number(r.handledBy) === Number(userId) || Number(r.assignedTo) === Number(userId));

// Who has it, as the worker should read it.
const holderText = (r, userId) => {
  if (r.handledBy != null) {
    return Number(r.handledBy) === Number(userId) ? 'Claimed by you' : `Claimed by ${r.handledByName ?? 'someone else'}`;
  }
  if (r.assignedTo != null) {
    return Number(r.assignedTo) === Number(userId) ? 'Assigned to you' : `Assigned to ${r.assignedToName ?? 'someone else'}`;
  }
  return null;
};

const asNumber = (text) => {
  const n = Number(text);
  return text !== '' && Number.isFinite(n) ? n : null;
};

// The pack screen: what to fetch, then what actually went out. Starts
// with everything that was approved; lower a quantity if less went out.
function PackScreen({ request, onConfirm, onBack, busy, error }) {
  const [released, setReleased] = useState(() =>
    Object.fromEntries(request.items.map((i) => [i.productId, String(i.quantityApproved)])));

  const problem = (i) => {
    const n = asNumber(released[i.productId]);
    if (n === null || n < 0) return 'Enter how many went out, zero or more.';
    if (n > i.quantityApproved) return `No more than ${fmtQty(i.quantityApproved, i.unit)}.`;
    return null;
  };
  const anyProblem = request.items.some((i) => problem(i));
  const nothingOut = !anyProblem && request.items.every((i) => Number(released[i.productId]) === 0);

  const submit = () => {
    if (anyProblem || nothingOut) return;
    onConfirm(request.items.map((i) => ({
      productId: i.productId, quantityReleased: Number(released[i.productId]),
    })));
  };

  return (
    <>
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>{request.callerName || 'Unnamed caller'}</h1>
        <p className="stf-step-sub">Fetch these items. Then confirm what went out.</p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <p className="stf-row-meta">
        {request.itemsRequested}
        {request.quantityNote ? ` · ${request.quantityNote}` : ''}
      </p>

      {request.items.map((i) => (
        <div key={i.productId} className="stf-field">
          <label className="stf-field-label" htmlFor={`stf-cr-out-${i.productId}`}>
            {i.productName} · fetch {fmtQty(i.quantityApproved, i.unit)}
          </label>
          <input
            id={`stf-cr-out-${i.productId}`}
            className="stf-input is-text"
            type="number" inputMode="decimal" min="0" step="any"
            value={released[i.productId]}
            onChange={(e) => setReleased((r) => ({ ...r, [i.productId]: e.target.value }))}
            aria-label={`Went out: ${i.productName}`}
            aria-invalid={problem(i) ? true : undefined}
          />
          <p className="stf-field-hint">
            {problem(i) ?? `Went out, in ${i.unit || 'units'}. Lower it if less went out.`}
          </p>
        </div>
      ))}

      {nothingOut ? (
        <Notice tone="warn">Nothing went out. Ask a manager to decline the request instead.</Notice>
      ) : null}

      <Actions>
        <Button disabled={busy || anyProblem || nothingOut} onClick={submit}>
          {busy ? 'Saving' : 'Confirm what went out'}
        </Button>
        <button type="button" className="stf-btn stf-btn-secondary" onClick={onBack} disabled={busy}>
          Back to the list
        </button>
      </Actions>
    </>
  );
}

export default function CommunityRequestFlow({ onCrumbChange }) {
  const { user } = useAuth() ?? {};
  const userId = user?.id ?? null;

  const [tab, setTab] = useState('log');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [logBusy, setLogBusy] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logKey, setLogKey] = useState(0);
  const [claimingId, setClaimingId] = useState(null);
  const [packing, setPacking] = useState(null);       // the request being packed
  const [packBusy, setPackBusy] = useState(false);
  const [packError, setPackError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const search = useListSearch(requests, requestText);

  useEffect(() => {
    onCrumbChange?.(tab === 'log' ? 'Log a request' : 'To pack');
  }, [tab, onCrumbChange]);

  // Approved requests that are not waiting for new items.
  useEffect(() => {
    if (tab !== 'pack') return;
    let cancelled = false;
    setLoading(true);
    communityRequestAPI.getRequests({ outcome: 'approved' })
      .then((rows) => {
        // The error is not cleared here: a refused claim reloads the list,
        // and the reason must stay on screen while it does.
        if (!cancelled) setRequests(rows.filter((r) => !r.itemsShortAt));
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load requests.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, reloadToken]);

  const changeTab = (nextTab) => {
    setTab(nextTab);
    setPacking(null);
    setNotice(null);
    setError(null);
  };

  const handleLog = async (payload) => {
    setLogBusy(true);
    setLogError(null);
    try {
      const logged = await communityRequestAPI.logRequest(payload, { keepOffline: true });
      setNotice(logged.queued
        ? 'No signal, so this is saved on your phone. It sends itself when you are back in range. Do not log it again.'
        : 'Request logged. A manager approves it before anyone packs.');
      setLogKey((k) => k + 1);   // a clean form for the next call
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
      setNotice('Request claimed. Open it when you are ready to pack.');
      setReloadToken((t) => t + 1);
    } catch (err) {
      // Someone else got there first, or a manager changed it: the
      // server's message says which, and the list is refreshed.
      setError(err.message || 'Could not claim this request.');
      setReloadToken((t) => t + 1);
    } finally {
      setClaimingId(null);
    }
  };

  const handleConfirm = async (items) => {
    setPackBusy(true);
    setPackError(null);
    try {
      const done = await communityRequestAPI.confirmRequest(packing.id, items);
      setPacking(null);
      setNotice(done.queued
        ? 'No signal, so this is saved on your phone. It sends itself when you are back in range. Do not confirm it again.'
        : done.outcome === 'partially_fulfilled'
          ? 'Done. Marked partly fulfilled, with what went out.'
          : 'Done. Marked fulfilled.');
      setReloadToken((t) => t + 1);
    } catch (err) {
      setPackError(err.message || 'Could not confirm this request.');
    } finally {
      setPackBusy(false);
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
              Log what the caller asks for. A manager approves it before anyone packs.
            </p>
          </div>
          <LogRequestForm key={logKey} onSubmit={handleLog} busy={logBusy} error={logError} />
        </>
      ) : packing ? (
        <PackScreen
          request={packing}
          onConfirm={handleConfirm}
          onBack={() => { setPacking(null); setPackError(null); }}
          busy={packBusy}
          error={packError}
        />
      ) : (
        <>
          <div className="stf-step-head">
            <h1 className="stf-step-title" tabIndex={-1}>To pack</h1>
            <p className="stf-step-sub">
              Claim a request to pack it. Then confirm what went out.
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
            <div className="stf-empty">Nothing to pack right now.</div>
          ) : search.filtered.length === 0 ? (
            <NoMatches
              query={search.query}
              onClear={() => search.setQuery('')}
              noun="requests"
            />
          ) : (
            <div className="stf-list">
              {search.filtered.map((r) => {
                const mine = isMine(r, userId);
                const holder = holderText(r, userId);
                return (
                  <div key={r.id} className="stf-row is-static" style={{ flexWrap: 'wrap' }}>
                    <span className="stf-row-main">
                      <span className="stf-row-title">{r.callerName || 'Unnamed caller'}</span>
                      <span className="stf-row-meta">
                        {r.items.map((i) => `${i.productName} · ${fmtQty(i.quantityApproved, i.unit)}`).join(', ')}
                      </span>
                      {r.quantityNote ? <span className="stf-row-meta">{r.quantityNote}</span> : null}
                      <span className="stf-row-meta">
                        {fmtDateTime(r.requestedAt)}
                        {r.callerContact ? ` · ${r.callerContact}` : ''}
                        {holder ? ` · ${holder}` : ''}
                      </span>
                    </span>

                    <span style={{ display: 'flex', gap: 8 }}>
                      {mine ? (
                        <button
                          type="button"
                          className="stf-btn stf-btn-primary"
                          onClick={() => { setPacking(r); setPackError(null); setNotice(null); }}
                        >
                          Start packing
                        </button>
                      ) : r.handledBy == null ? (
                        <button
                          type="button"
                          className="stf-btn stf-btn-secondary"
                          onClick={() => handleClaim(r.id)}
                          disabled={claimingId === r.id}
                        >
                          {claimingId === r.id ? 'Claiming…' : 'Claim'}
                        </button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
