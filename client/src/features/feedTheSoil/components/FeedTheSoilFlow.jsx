// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/components/FeedTheSoilFlow.jsx
//
// The staff-floor shape of Feed the Soil kit tracking. The lifecycle,
// corrected from an earlier "kit goes out, kit comes back" model that
// had it backwards:
//
//   assign   a kit (bucket) is given to a community member — it stays
//            with them, it is never checked back in
//   log      the owner brings it in, ideally weekly, and the compost
//            is weighed — one record per visit, logged against the
//            same kit again and again over its life
//   dispatch that logged compost eventually leaves for a farmer, a
//            quick one-tap action on the record, independent of any
//            others (no data exists on which farmer got how much from
//            which record, so this does not invent a batch concept)
//
// Two top-level views, switched with FilterSegments (the same control
// the history screens use for date ranges):
//   Records  the flat, cross-kit list — what needs attention. Sorted
//            server-side: not-yet-dispatched first, dispatched at the
//            bottom, newest first within each group.
//   Kits     search by owner or suburb, assign a new kit, or open one
//            to see who owns it (name + suburb only — no address or
//            contact details, by design) and its full log history.
//
// Built from the same StepPrimitives/TaskPage/usePaged vocabulary as
// Receiving, Packing and Decanting.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import {
  Actions, Button, TextField, DateField, NumberField, Notice, KeyValues,
} from '../../staff/components/StepPrimitives';
import TaskPage from '../../staff/components/TaskPage';
import ListTools, { FilterSegments } from '../../staff/components/ListTools';
import usePaged from '../../staff/hooks/usePaged';
import Paged from '../../staff/components/Paged';
import { readDraft, writeDraft, clearDraft } from '../../staff/hooks/useDraft';
import collectionKitAPI from '../../../services/collectionKitAPI';

const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

const fmtKg = (value) => (value === null || value === undefined ? '—' : `${Number(value).toLocaleString('en-ZA')} kg`);

const STATUS_LABEL = { assigned: 'Assigned', logged: 'Logged', dispatched: 'Dispatched' };

const STATUS_BADGE_CLASS = { logged: ' is-warn', dispatched: ' is-done' };

const StatusBadge = ({ status }) => (
  <span className={`stf-badge${STATUS_BADGE_CLASS[status] ?? ''}`}>
    {STATUS_LABEL[status] ?? status}
  </span>
);

export default function FeedTheSoilFlow({ onCrumbChange }) {
  // 'browse' (tab: records | kits) | 'kitDetail' | 'assign' | 'log'
  const [phase, setPhase] = useState('browse');
  const [tab, setTab] = useState('records');

  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);

  const [kits, setKits] = useState([]);
  const [kitsLoading, setKitsLoading] = useState(true);
  const [kitSearch, setKitSearch] = useState('');

  const [browseError, setBrowseError] = useState(null);
  const [dispatchingId, setDispatchingId] = useState(null);

  const [selectedKit, setSelectedKit] = useState(null);
  const [kitDetailLoading, setKitDetailLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  // ── Assign form state ─────────────────────────────────────
  const [ownerName, setOwnerName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [assignedAt, setAssignedAt] = useState(todayISO());

  // ── Log form state ────────────────────────────────────────
  const [kgCompost, setKgCompost] = useState('');
  const [loggedAt, setLoggedAt] = useState(todayISO());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const crumb = phase === 'kitDetail' ? (selectedKit ? `Kit / ${selectedKit.owner_name}` : 'Kit')
      : phase === 'assign' ? 'Assign a kit'
      : phase === 'log' ? 'Log compost'
      : tab === 'records' ? 'Compost records' : 'Kits';
    onCrumbChange?.(crumb);
  }, [phase, tab, selectedKit, onCrumbChange]);

  const loadRecords = useCallback(async () => {
    setBrowseError(null);
    try {
      const res = await collectionKitAPI.listRecords();
      setRecords(res?.data ?? res ?? []);
    } catch (err) {
      setBrowseError(err.message || 'Could not load compost records.');
    }
  }, []);

  const loadKits = useCallback(async (search) => {
    setBrowseError(null);
    try {
      const res = await collectionKitAPI.listKits(search);
      setKits(res?.data ?? res ?? []);
    } catch (err) {
      setBrowseError(err.message || 'Could not load kits.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRecordsLoading(true);
    loadRecords().finally(() => { if (!cancelled) setRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [loadRecords]);

  useEffect(() => {
    let cancelled = false;
    setKitsLoading(true);
    loadKits(kitSearch).finally(() => { if (!cancelled) setKitsLoading(false); });
    return () => { cancelled = true; };
    // Deliberately not debounced, same reasoning as ListTools' own
    // comment: the list is already in memory server-side and small.
  }, [loadKits, kitSearch]);

  const recordsPaged = usePaged(records);
  const kitsPaged = usePaged(kits);

  const openKit = async (id) => {
    setPhase('kitDetail');
    setKitDetailLoading(true);
    setBrowseError(null);
    try {
      const res = await collectionKitAPI.getKit(id);
      setSelectedKit(res?.data ?? res);
    } catch (err) {
      setBrowseError(err.message || 'Could not load this kit.');
      setPhase('browse');
    } finally {
      setKitDetailLoading(false);
    }
  };

  const backToBrowse = (targetTab) => {
    setPhase('browse');
    setFormError(null);
    if (targetTab) setTab(targetTab);
    loadKits(kitSearch);
    loadRecords();
  };

  // ── Dispatch — inline, no screen change ────────────────────
  const dispatchRecord = async (recordId) => {
    setDispatchingId(recordId);
    setBrowseError(null);
    try {
      await collectionKitAPI.markDispatched(recordId);
      await loadRecords();
      if (phase === 'kitDetail' && selectedKit) await openKit(selectedKit.id);
    } catch (err) {
      setBrowseError(err.message || 'Could not mark this record dispatched.');
    } finally {
      setDispatchingId(null);
    }
  };

  // ── Assign a kit ───────────────────────────────────────────
  const ASSIGN_DRAFT_KEY = 'feedTheSoil-assign';
  const startAssign = () => {
    const draft = readDraft(ASSIGN_DRAFT_KEY);
    setOwnerName(draft?.ownerName ?? '');
    setSuburb(draft?.suburb ?? '');
    setAssignedAt(draft?.assignedAt ?? todayISO());
    setFormError(null);
    setPhase('assign');
  };
  useEffect(() => {
    if (phase !== 'assign') return;
    writeDraft(ASSIGN_DRAFT_KEY, { ownerName, suburb, assignedAt });
  }, [phase, ownerName, suburb, assignedAt]);

  const ownerMissing = !ownerName.trim();

  const submitAssign = async () => {
    if (ownerMissing) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await collectionKitAPI.createKit({ ownerName: ownerName.trim(), suburb: suburb.trim(), assignedAt });
      clearDraft(ASSIGN_DRAFT_KEY);
      const kit = res?.data ?? res;
      await loadKits(kitSearch);
      await openKit(kit.id);
    } catch (err) {
      setFormError(err.message || 'Could not assign the kit.');
    } finally {
      setBusy(false);
    }
  };

  // ── Log compost ────────────────────────────────────────────
  const logDraftKey = (kitId) => `feedTheSoil-log-${kitId}`;
  const startLog = (kit) => {
    setSelectedKit(kit);
    const draft = readDraft(logDraftKey(kit.id));
    setKgCompost(draft?.kgCompost ?? '');
    setLoggedAt(draft?.loggedAt ?? todayISO());
    setNotes(draft?.notes ?? '');
    setFormError(null);
    setPhase('log');
  };
  useEffect(() => {
    if (phase !== 'log' || !selectedKit) return;
    writeDraft(logDraftKey(selectedKit.id), { kgCompost, loggedAt, notes });
  }, [phase, selectedKit, kgCompost, loggedAt, notes]);

  const kgInvalid = kgCompost === '' || Number.isNaN(Number(kgCompost)) || Number(kgCompost) < 0;

  const submitLog = async () => {
    if (!selectedKit || kgInvalid) return;
    setBusy(true);
    setFormError(null);
    try {
      await collectionKitAPI.logCompost(selectedKit.id, {
        kgCompost: Number(kgCompost), loggedAt, notes: notes.trim(),
      });
      clearDraft(logDraftKey(selectedKit.id));
      await loadRecords();
      await openKit(selectedKit.id);
    } catch (err) {
      setFormError(err.message || 'Could not log the compost collected.');
    } finally {
      setBusy(false);
    }
  };

  // ── Records row ────────────────────────────────────────────
  const RecordRow = ({ record, showOwner = true }) => (
    <div className="stf-row is-static">
      <span className="stf-row-main">
        <span className="stf-row-title">
          {showOwner ? `${record.owner_name}${record.suburb ? ` · ${record.suburb}` : ''}` : fmtDate(record.logged_at)}
        </span>
        <span className="stf-row-meta">
          {showOwner ? `Kit #${record.kit_id} · ${fmtDate(record.logged_at)} · ` : ''}
          {fmtKg(record.kg_compost)}
          {record.status === 'dispatched' ? ` · dispatched ${fmtDateTime(record.dispatched_at)}` : ''}
          {record.logged_by_name ? ` · Logged by ${record.logged_by_name}` : ''}
        </span>
      </span>
      <StatusBadge status={record.status} />
      {record.status === 'logged' ? (
        <button
          type="button" className="stf-btn stf-btn-secondary"
          disabled={dispatchingId === record.id}
          onClick={() => dispatchRecord(record.id)}
        >
          {dispatchingId === record.id ? 'Dispatching…' : 'Dispatch'}
        </button>
      ) : null}
    </div>
  );

  // ── Records tab ────────────────────────────────────────────
  if (phase === 'browse' && tab === 'records') {
    return (
      <TaskPage title="Feed the Soil" sub="Compost logged from every collection kit, most recent first. Dispatched records sink to the bottom.">
        {browseError ? <Notice tone="warn">{browseError}</Notice> : null}
        <FilterSegments label="View" value={tab} onChange={setTab} options={[{ key: 'records', label: 'Records' }, { key: 'kits', label: 'Kits' }]} />

        {recordsLoading ? (
          <div className="stf-skeleton" aria-label="Loading" />
        ) : records.length === 0 ? (
          <div className="stf-empty">No compost has been logged yet.</div>
        ) : (
          <>
            <div className="stf-list">
              {recordsPaged.slice.map((r) => <RecordRow key={r.id} record={r} />)}
            </div>
            <Paged {...recordsPaged} noun="records" />
          </>
        )}
      </TaskPage>
    );
  }

  // ── Kits tab ───────────────────────────────────────────────
  if (phase === 'browse' && tab === 'kits') {
    return (
      <TaskPage
        title="Feed the Soil"
        sub="Every collection kit assigned to a community member."
        actions={<Actions><Button onClick={startAssign}>Assign a kit</Button></Actions>}
      >
        {browseError ? <Notice tone="warn">{browseError}</Notice> : null}
        <FilterSegments label="View" value={tab} onChange={setTab} options={[{ key: 'records', label: 'Records' }, { key: 'kits', label: 'Kits' }]} />

        <ListTools
          id="fts-kit-search" query={kitSearch} onQuery={setKitSearch}
          placeholder="Search by owner or suburb"
        />

        {kitsLoading ? (
          <div className="stf-skeleton" aria-label="Loading" />
        ) : kits.length === 0 ? (
          <div className="stf-empty">
            {kitSearch ? `No kits match "${kitSearch}".` : 'No kits have been assigned yet.'}
          </div>
        ) : (
          <>
            <div className="stf-list">
              {kitsPaged.slice.map((kit) => (
                <div
                  key={kit.id} className="stf-row" role="button" tabIndex={0}
                  onClick={() => openKit(kit.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openKit(kit.id); } }}
                >
                  <span className="stf-row-main">
                    <span className="stf-row-title">{kit.owner_name}</span>
                    <span className="stf-row-meta">
                      Kit #{kit.id}{kit.suburb ? ` · ${kit.suburb}` : ''}
                      {kit.last_logged_at ? ` · last logged ${fmtDate(kit.last_logged_at)}` : ''}
                    </span>
                  </span>
                  <StatusBadge status={kit.status} />
                  <button
                    type="button" className="stf-btn stf-btn-secondary"
                    onClick={(e) => { e.stopPropagation(); startLog(kit); }}
                  >
                    Log compost
                  </button>
                </div>
              ))}
            </div>
            <Paged {...kitsPaged} noun="kits" />
          </>
        )}
      </TaskPage>
    );
  }

  // ── Kit detail ─────────────────────────────────────────────
  if (phase === 'kitDetail') {
    if (kitDetailLoading || !selectedKit) {
      return <TaskPage title="Kit" sub="Loading…"><div className="stf-skeleton" aria-label="Loading" /></TaskPage>;
    }
    return (
      <TaskPage
        title={selectedKit.owner_name}
        sub={`Kit #${selectedKit.id}${selectedKit.suburb ? ` · ${selectedKit.suburb}` : ''} · assigned ${fmtDate(selectedKit.assigned_at)}`}
        actions={
          <Actions>
            <Button onClick={() => startLog(selectedKit)}>Log compost</Button>
            <Button variant="secondary" onClick={() => backToBrowse('kits')}>Back to kits</Button>
          </Actions>
        }
        side={
          <div className="stf-summary">
            <p className="stf-summary-title">This kit</p>
            <KeyValues
              pairs={[
                ['Owner', selectedKit.owner_name],
                ['Suburb', selectedKit.suburb || '—'],
                ['Status', STATUS_LABEL[selectedKit.status] ?? selectedKit.status],
                ['Assigned', fmtDate(selectedKit.assigned_at)],
              ]}
            />
          </div>
        }
      >
        {browseError ? <Notice tone="warn">{browseError}</Notice> : null}

        {selectedKit.records.length === 0 ? (
          <div className="stf-empty">No compost logged yet for this kit.</div>
        ) : (
          <div className="stf-list">
            {selectedKit.records.map((r) => <RecordRow key={r.id} record={r} showOwner={false} />)}
          </div>
        )}
      </TaskPage>
    );
  }

  // ── Assign a kit ───────────────────────────────────────────
  if (phase === 'assign') {
    return (
      <TaskPage
        title="Assign a kit"
        sub="A new collection kit given to a community member."
        note={ownerMissing ? 'Still needed: the owner\'s name.' : null}
        actions={
          <Actions>
            <Button disabled={busy || ownerMissing} onClick={submitAssign}>{busy ? 'Assigning' : 'Assign kit'}</Button>
            <Button variant="secondary" onClick={() => backToBrowse('kits')}>Cancel</Button>
          </Actions>
        }
      >
        {formError ? <Notice tone="warn">{formError}</Notice> : null}

        <TextField id="fts-owner" label="Owner's name" value={ownerName} onChange={setOwnerName} placeholder="e.g. Jane M." />
        <TextField id="fts-suburb" label="Suburb (optional)" value={suburb} onChange={setSuburb} placeholder="e.g. Delft" />
        <DateField id="fts-assigned" label="Date assigned" value={assignedAt} onChange={setAssignedAt} />

        <Notice>Only the owner's name and suburb are kept. No address or contact details.</Notice>
      </TaskPage>
    );
  }

  // ── Log compost ────────────────────────────────────────────
  if (phase === 'log' && selectedKit) {
    return (
      <TaskPage
        title={`Log compost · ${selectedKit.owner_name}`}
        sub={`Kit #${selectedKit.id}${selectedKit.suburb ? ` · ${selectedKit.suburb}` : ''}`}
        note={kgInvalid ? 'Still needed: the weight of compost collected.' : null}
        actions={
          <Actions>
            <Button disabled={busy || kgInvalid} onClick={submitLog}>{busy ? 'Logging' : 'Log compost'}</Button>
            {/* Re-fetches rather than just flipping phase: "Log compost"
                can be reached straight from a Kits-tab row, where
                selectedKit is only the list shape (no .records yet) —
                kitDetail needs the full one regardless of entry point. */}
            <Button variant="secondary" onClick={() => openKit(selectedKit.id)}>Cancel</Button>
          </Actions>
        }
      >
        {formError ? <Notice tone="warn">{formError}</Notice> : null}

        <NumberField
          id="fts-kg" label="Kilograms of compost collected"
          value={kgCompost} onChange={setKgCompost} flagged={kgCompost !== '' && kgInvalid}
        />
        <DateField id="fts-logged" label="Date collected" value={loggedAt} onChange={setLoggedAt} />
        <TextField id="fts-notes" label="Notes (optional)" value={notes} onChange={setNotes} />
      </TaskPage>
    );
  }

  return null;
}
