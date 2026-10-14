// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/FeedTheSoilFlow.jsx
//
// The staff-floor shape of Feed the Soil kit tracking. The lifecycle:
//
//   assign   a kit (bucket) is given to a community member — it stays
//            with them, it is never checked back in
//   log      the owner brings it in, ideally weekly, and the compost
//            is weighed — one record per visit, logged against the
//            same kit again and again over its life
//   dispatch that logged compost eventually leaves for a farmer or
//            drop-off point, a record-level action independent of any
//            others (no data exists on which farmer got how much from
//            which record, so this does not invent a batch concept —
//            it only records where that one record's compost went)
//
// The screen opens on Kits. The compost records are its History,
// reached from the header (StaffFeedTheSoilPage), not a second tab:
//   Records  the flat, cross-kit list, drawn by HistoryScreen like
//            every other worker history: date range, search, sort and
//            filters (status, owner, suburb, where it went). A row
//            names the kit AND its owner, with the date and weight, so
//            the list can be read without opening each one.
//   Kits     search by owner or suburb, assign a new kit, or open one
//            to see who owns it (name + suburb only — no address or
//            contact details, by design) and its full log history.
//
// A record and a kit are two different things to open: tapping a kit
// shows who owns it and every record logged against it; tapping a
// record — from either tab — shows that one collection's own detail
// (date, weight, status, and where it went once dispatched), not the
// kit's. Kit detail's own record rows are a date and a weight and open
// the same record detail on tap.
//
// Whose kit it is comes first on both detail screens: the kit and its
// owner are the title, and the owner card sits above the records, not
// beside or under them. Asked for from the floor, where it read as
// secondary information.
//
// Built from the same StepPrimitives/TaskPage/usePaged vocabulary as
// Receiving, Packing and Decanting.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import {
  Actions, Button, TextField, DateField, NumberField, Notice, KeyValues,
} from '../staff/StepPrimitives';
import TaskPage from '../staff/TaskPage';
import { SearchHeading } from '../staff/ListTools';
import HistoryScreen, { HistoryRow } from '../staff/HistoryScreen';
import { withinRange, byNewest, byOldest, byNumber, byText } from '../staff/historyView';
import usePaged from '../staff/usePaged';
import Paged from '../staff/Paged';
import { readDraft, writeDraft, clearDraft } from '../staff/useDraft';
import collectionKitAPI from '../../services/collectionKitAPI';
import formatKitCode from './kitCode';
import SuccessDialog from '../staff/SuccessDialog';
import { OFFLINE_TITLE, offlineLine } from '../staff/successText';
import { todayISO } from '../packing/spareSlips';
import StatusBadge from '@/components/ui/status-badge';
import { workerStatus } from '../staff/workerStatus';

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '-';

const fmtKg = (value) => (value === null || value === undefined ? '-' : `${Number(value).toLocaleString('en-ZA')} kg`);

const STATUS_LABEL = { assigned: 'Assigned', logged: 'Logged', dispatched: 'Dispatched' };

// The manager's badge: amber with the household, blue waiting to go
// to a farm, green gone.
const KitStatusBadge = ({ status }) => (
  <StatusBadge {...workerStatus('kit', status)}>{STATUS_LABEL[status] ?? status}</StatusBadge>
);

// What last happened to a kit, and when: dispatched, logged, or only
// assigned if nothing has been collected from it yet. This replaced a
// status badge, which said "Logged" about the kit when it was really
// the state of its last record.
const lastAction = (kit) => {
  if (kit.status === 'dispatched' && kit.last_dispatched_at) return `Last dispatched ${fmtDate(kit.last_dispatched_at)}`;
  if (kit.last_logged_at) return `Last logged ${fmtDate(kit.last_logged_at)}`;
  return `Assigned ${fmtDate(kit.assigned_at)}`;
};

// The History list's sorts and filters (HistoryScreen). Module level
// so their identity is stable across renders.
const RECORD_SORTS = [
  { key: 'newest', label: 'Newest first', compare: byNewest((r) => r.logged_at) },
  { key: 'oldest', label: 'Oldest first', compare: byOldest((r) => r.logged_at) },
  { key: 'heaviest', label: 'Heaviest first', compare: byNumber((r) => r.kg_compost) },
  { key: 'owner', label: 'Owner A to Z', compare: byText((r) => r.owner_name) },
];
const RECORD_FILTERS = [
  { key: 'status', label: 'Status', valueOf: (r) => r.status, labelOf: (v) => STATUS_LABEL[v] ?? v },
  { key: 'owner', label: 'Owner', valueOf: (r) => r.owner_name },
  { key: 'suburb', label: 'Suburb', valueOf: (r) => r.suburb },
  { key: 'sentTo', label: 'Went to', valueOf: (r) => r.dispatched_to },
];
const recordSearchText = (r) =>
  [formatKitCode(r.kit_id), r.owner_name, r.suburb, r.dispatched_to].filter(Boolean).join(' ');

// The kit and whose it is, the way both detail screens are titled.
const kitTitle = (kitId, owner) => `${formatKitCode(kitId)} · ${owner}`;

// `history` and `onHistoryChange` belong to the page: its header carries
// the History link, the same place Receiving and Dispatch keep theirs.
// Kits are what this screen is for; the compost records are its history.
export default function FeedTheSoilFlow({ onCrumbChange, history = false, onHistoryChange }) {
  // 'browse' (kits, or the records when `history`) | 'kitDetail' |
  // 'recordDetail' | 'assign' | 'log' | 'dispatch'
  const [phase, setPhase] = useState('browse');
  const tab = history ? 'records' : 'kits';
  const setTab = (next) => onHistoryChange?.(next === 'records');

  // The History link works from any step: it always lands on the list.
  useEffect(() => {
    if (history) setPhase('browse');
  }, [history]);

  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  // The records API has no date range of its own, so History narrows
  // what is loaded, with the same four ranges as the other histories.
  const [recordRange, setRecordRange] = useState('all');

  const [kits, setKits] = useState([]);
  const [kitsLoading, setKitsLoading] = useState(true);
  const [kitSearch, setKitSearch] = useState('');

  const [browseError, setBrowseError] = useState(null);

  const [selectedKit, setSelectedKit] = useState(null);
  const [kitDetailLoading, setKitDetailLoading] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [recordDetailLoading, setRecordDetailLoading] = useState(false);
  // Where "Back" on record detail should return to — the kit's own
  // history list, or the flat Records tab — set when the record is
  // opened, not guessed afterward.
  const [recordOrigin, setRecordOrigin] = useState('records');

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  // Said on the list after a weigh-in that could not be sent and is
  // waiting on the phone.
  const [queuedNote, setQueuedNote] = useState(null);
  // The confirmation after assigning, logging or dispatching.
  const [success, setSuccess] = useState(null);
  const successDialog = (
    <SuccessDialog open={Boolean(success)} tone={success?.tone} title={success?.title} picture="ti-plant" onClose={() => setSuccess(null)}>
      {success?.body}
    </SuccessDialog>
  );

  // ── Assign form state ─────────────────────────────────────
  const [ownerName, setOwnerName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [assignedAt, setAssignedAt] = useState(todayISO());

  // ── Log form state ────────────────────────────────────────
  const [kgCompost, setKgCompost] = useState('');
  const [loggedAt, setLoggedAt] = useState(todayISO());
  const [notes, setNotes] = useState('');

  // ── Dispatch form state ───────────────────────────────────
  const [dispatchedTo, setDispatchedTo] = useState('');

  useEffect(() => {
    const crumb = phase === 'kitDetail' ? (selectedKit ? `Kit / ${selectedKit.owner_name}` : 'Kit')
      : phase === 'recordDetail' ? 'Record'
      : phase === 'dispatch' ? 'Mark dispatched'
      : phase === 'assign' ? 'Assign a new kit'
      : phase === 'log' ? 'Log compost'
      : tab === 'records' ? 'History' : 'Kits';
    onCrumbChange?.(crumb);
  }, [phase, tab, selectedKit, onCrumbChange]);

  const loadRecords = useCallback(async () => {
    setBrowseError(null);
    try {
      const res = await collectionKitAPI.listRecords({});
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
  }, [loadKits, kitSearch]);

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

  const openRecord = async (id, { fromKit = false } = {}) => {
    setRecordOrigin(fromKit ? 'kit' : 'records');
    setPhase('recordDetail');
    setRecordDetailLoading(true);
    setBrowseError(null);
    try {
      const res = await collectionKitAPI.getRecord(id);
      setSelectedRecord(res?.data ?? res);
    } catch (err) {
      setBrowseError(err.message || 'Could not load this record.');
      setPhase('browse');
    } finally {
      setRecordDetailLoading(false);
    }
  };

  const backToBrowse = (targetTab) => {
    setPhase('browse');
    setFormError(null);
    if (targetTab) setTab(targetTab);
    loadKits(kitSearch);
    loadRecords();
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
      setSuccess({ title: 'Kit assigned', body: `${formatKitCode(kit.id)} is with ${ownerName.trim()}.` });
    } catch (err) {
      setFormError(err.message || 'Could not assign the kit.');
    } finally {
      setBusy(false);
    }
  };

  // ── Log compost ────────────────────────────────────────────
  const logDraftKey = (kitId) => `feedTheSoil-log-${kitId}`;
  const startLog = (kit) => {
    setQueuedNote(null);
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
      const logged = await collectionKitAPI.logCompost(selectedKit.id, {
        kgCompost: Number(kgCompost), loggedAt, notes: notes.trim(),
      }, { keepOffline: true });
      clearDraft(logDraftKey(selectedKit.id));
      if (logged?.queued) {
        // No signal: it is on the phone, not yet on the kit's history.
        // Back to the list, with the reason on screen.
        backToBrowse();
        setSuccess({ tone: 'offline', title: OFFLINE_TITLE, body: offlineLine('Do not log it again.') });
        return;
      }
      await loadRecords();
      await openKit(selectedKit.id);
      setSuccess({ title: 'Compost logged', body: `${fmtKg(Number(kgCompost))} from ${formatKitCode(selectedKit.id)}.` });
    } catch (err) {
      setFormError(err.message || 'Could not log the compost collected.');
    } finally {
      setBusy(false);
    }
  };

  // ── Mark dispatched ────────────────────────────────────────
  const startDispatch = (record) => {
    setSelectedRecord(record);
    setDispatchedTo('');
    setFormError(null);
    setPhase('dispatch');
  };

  const dispatchMissing = !dispatchedTo.trim();

  const submitDispatch = async () => {
    if (!selectedRecord || dispatchMissing) return;
    setBusy(true);
    setFormError(null);
    try {
      await collectionKitAPI.markDispatched(selectedRecord.id, dispatchedTo.trim());
      await openRecord(selectedRecord.id, { fromKit: recordOrigin === 'kit' });
      setSuccess({ title: 'Compost dispatched', body: `Sent to ${dispatchedTo.trim()}.` });
    } catch (err) {
      setFormError(err.message || 'Could not mark this record dispatched.');
    } finally {
      setBusy(false);
    }
  };

  // ── A kit's own record row ─────────────────────────────────
  // Inside kit detail, where the kit is already known: the date and
  // the weight. Opens the record's own detail on tap. The cross-kit
  // History list draws HistoryRow instead.
  const RecordRow = ({ record, onOpen }) => (
    <div
      className="stf-row" role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      <span className="stf-row-main">
        <span className="stf-row-title">{fmtDate(record.logged_at)}</span>
        <span className="stf-row-meta">{fmtKg(record.kg_compost)}</span>
      </span>
      <KitStatusBadge status={record.status} />
    </div>
  );

  // ── History: the compost records ───────────────────────────
  // The same screen as every worker history (HistoryScreen). The
  // page's header carries the way back to the kits.
  if (phase === 'browse' && tab === 'records') {
    return (
      <>
        {successDialog}
        <HistoryScreen
          title="History"
          sub="Every compost record logged."
          error={browseError}
          notice={queuedNote}
          range={recordRange}
          onRangeChange={setRecordRange}
          loading={recordsLoading}
          rows={records.filter((r) => withinRange(r.logged_at, recordRange))}
          search={recordSearchText}
          searchPlaceholder="Search by kit, owner, suburb or farm"
          searchId="fts-record-search"
          sorts={RECORD_SORTS}
          filters={RECORD_FILTERS}
          empty={recordRange === 'all' ? 'No compost has been logged yet.' : 'No compost logged in this range.'}
          noun="records"
          renderRow={(r) => (
            <HistoryRow
              title={kitTitle(r.kit_id, r.owner_name)}
              meta={[
                fmtDate(r.logged_at),
                fmtKg(r.kg_compost),
                r.suburb,
                r.dispatched_to ? `Sent to ${r.dispatched_to}` : null,
              ].filter(Boolean).join(' · ')}
              badges={<KitStatusBadge status={r.status} />}
              action={{ label: 'View record', onClick: () => openRecord(r.id) }}
            />
          )}
        />
      </>
    );
  }

  // ── Kits: what this screen opens on ─────────────────────────
  if (phase === 'browse') {
    return (
      <>
        {successDialog}
      <TaskPage title="Feed the Soil" sub="Kits given out.">
        {browseError ? <Notice tone="warn">{browseError}</Notice> : null}
        {queuedNote ? <Notice>{queuedNote}</Notice> : null}

        <Actions>
          <Button onClick={startAssign}>Assign a new kit</Button>
        </Actions>

        <SearchHeading
          title="Collection kits"
          id="fts-kit-search" query={kitSearch} onQuery={setKitSearch}
          placeholder="Search by owner or suburb" buttonLabel="Search kits"
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
                    <span className="stf-row-title">{kitTitle(kit.id, kit.owner_name)}</span>
                    <span className="stf-row-meta">{[kit.suburb, lastAction(kit)].filter(Boolean).join(' · ')}</span>
                  </span>
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
      </>
    );
  }

  // ── Kit detail ─────────────────────────────────────────────
  if (phase === 'kitDetail') {
    if (kitDetailLoading || !selectedKit) {
      return <TaskPage title="Kit" sub="Loading…"><div className="stf-skeleton" aria-label="Loading" /></TaskPage>;
    }
    return (
      <>
        {successDialog}
      <TaskPage
        title={kitTitle(selectedKit.id, selectedKit.owner_name)}
        sub={[selectedKit.suburb, STATUS_LABEL[selectedKit.status] ?? selectedKit.status].filter(Boolean).join(' · ')}
        actions={
          <Actions>
            <Button onClick={() => startLog(selectedKit)}>Log compost</Button>
            <Button variant="secondary" onClick={() => backToBrowse('kits')}>Back to kits</Button>
          </Actions>
        }
      >
        {browseError ? <Notice tone="warn">{browseError}</Notice> : null}
        {queuedNote ? <Notice>{queuedNote}</Notice> : null}

        <div className="stf-summary stf-fts-owner">
          <p className="stf-summary-title">Owner</p>
          <p className="stf-fts-owner-name">{selectedKit.owner_name}</p>
          <KeyValues
            pairs={[
              ['Kit', formatKitCode(selectedKit.id)],
              ['Suburb', selectedKit.suburb || '-'],
              ['Assigned', fmtDate(selectedKit.assigned_at)],
              ['Collections', selectedKit.records.length],
              ['Total', fmtKg(selectedKit.records.reduce((sum, r) => sum + Number(r.kg_compost || 0), 0))],
            ]}
          />
        </div>

        <p className="stf-summary-title">Compost logs</p>
        {selectedKit.records.length === 0 ? (
          <div className="stf-empty">No compost logged yet for this kit.</div>
        ) : (
          <div className="stf-list">
            {selectedKit.records.map((r) => (
              <RecordRow key={r.id} record={r} onOpen={() => openRecord(r.id, { fromKit: true })} />
            ))}
          </div>
        )}
      </TaskPage>
      </>
    );
  }

  // ── Record detail ──────────────────────────────────────────
  if (phase === 'recordDetail') {
    if (recordDetailLoading || !selectedRecord) {
      return <TaskPage title="Record" sub="Loading…"><div className="stf-skeleton" aria-label="Loading" /></TaskPage>;
    }
    const backAction = () => (recordOrigin === 'kit' ? openKit(selectedRecord.kit_id) : backToBrowse('records'));
    return (
      <>
        {successDialog}
      <TaskPage
        title={kitTitle(selectedRecord.kit_id, selectedRecord.owner_name)}
        sub={`Compost record · ${STATUS_LABEL[selectedRecord.status] ?? selectedRecord.status}`}
        actions={
          <Actions>
            {selectedRecord.status === 'logged' ? (
              <Button onClick={() => startDispatch(selectedRecord)}>Mark dispatched</Button>
            ) : null}
            <Button variant="secondary" onClick={backAction}>
              {recordOrigin === 'kit' ? 'Back to kit' : 'Back to records'}
            </Button>
          </Actions>
        }
      >
        {browseError ? <Notice tone="warn">{browseError}</Notice> : null}
        {queuedNote ? <Notice>{queuedNote}</Notice> : null}

        {/* Whose kit, first. The button opens the kit's list of
            compost logs, so it says so. */}
        <div className="stf-summary stf-fts-owner">
          <p className="stf-summary-title">Owner</p>
          <p className="stf-fts-owner-name">{selectedRecord.owner_name}</p>
          <KeyValues
            pairs={[
              ['Kit', formatKitCode(selectedRecord.kit_id)],
              ['Suburb', selectedRecord.suburb || '-'],
            ]}
          />
          {recordOrigin !== 'kit' ? (
            <button
              type="button" className="stf-btn stf-btn-secondary"
              onClick={() => openKit(selectedRecord.kit_id)}
            >
              View kit logs
            </button>
          ) : null}
        </div>

        <p className="stf-summary-title">Collection</p>
        <KeyValues
          pairs={[
            ['Date collected', fmtDate(selectedRecord.logged_at)],
            ['Weight', fmtKg(selectedRecord.kg_compost)],
            ['Notes', selectedRecord.notes || '-'],
          ]}
        />

        {selectedRecord.status === 'dispatched' ? (
          <>
            <p className="stf-summary-title">Dispatch</p>
            <KeyValues
              pairs={[
                ['Dispatched', fmtDateTime(selectedRecord.dispatched_at)],
                ['Sent to', selectedRecord.dispatched_to || '-'],
              ]}
            />
          </>
        ) : null}
      </TaskPage>
      </>
    );
  }

  // ── Mark dispatched ────────────────────────────────────────
  if (phase === 'dispatch' && selectedRecord) {
    return (
      <>
        {successDialog}
      <TaskPage
        title="Mark dispatched"
        sub={`${formatKitCode(selectedRecord.kit_id)} · ${fmtKg(selectedRecord.kg_compost)} collected ${fmtDate(selectedRecord.logged_at)}`}
        note={dispatchMissing ? 'Still needed: where this compost went.' : null}
        actions={
          <Actions>
            <Button disabled={busy || dispatchMissing} onClick={submitDispatch}>
              {busy ? 'Marking dispatched' : 'Mark dispatched'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => openRecord(selectedRecord.id, { fromKit: recordOrigin === 'kit' })}
            >
              Cancel
            </Button>
          </Actions>
        }
      >
        {formError ? <Notice tone="warn">{formError}</Notice> : null}

        <TextField
          id="fts-dispatch-to" label="Farmer or drop-off point"
          value={dispatchedTo} onChange={setDispatchedTo} placeholder="e.g. Voorbrug Farm"
        />
      </TaskPage>
      </>
    );
  }

  // ── Assign a kit ───────────────────────────────────────────
  if (phase === 'assign') {
    return (
      <>
        {successDialog}
      <TaskPage
        title="Assign a new kit"
        sub="Give a kit to a community member."
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
      </>
    );
  }

  // ── Log compost ────────────────────────────────────────────
  if (phase === 'log' && selectedKit) {
    return (
      <>
        {successDialog}
      <TaskPage
        title={`Log compost · ${selectedKit.owner_name}`}
        sub={`${formatKitCode(selectedKit.id)}${selectedKit.suburb ? ` · ${selectedKit.suburb}` : ''}`}
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
      </>
    );
  }

  return null;
}
