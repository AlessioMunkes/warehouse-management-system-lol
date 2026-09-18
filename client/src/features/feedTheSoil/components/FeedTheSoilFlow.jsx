// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/components/FeedTheSoilFlow.jsx
//
// The staff-floor shape of Feed the Soil kit logging: a list of kits
// with Out/Returned segments (FilterSegments, the same control the
// history screens use for date ranges), a "Log a kit going out"
// action, and a return step opened by tapping an out kit. Built from
// the same StepPrimitives/TaskPage vocabulary as DecantingFlow.jsx and
// ReceivingFlow.jsx, so a worker who already knows one staff flow
// already knows this one — the ManagerLayout table + shadcn Card forms
// this replaces (see FeedTheSoilManagerView.jsx) were the wrong
// vocabulary for a phone held with one hand at the compost skip.
//
// NOT A MULTI-PANEL WIZARD.
// Unlike decanting, there is nothing here to split into "weigh it,
// then bag it, then count it back" — logging a kit or closing one out
// is one small, flat form. TaskPage still earns its keep: a sticky
// commit bar with a `note` naming what's missing beats a bare disabled
// button, and `side` gives the worker a running summary of the kit
// while they fill it in, the same reasons DecantingFlow uses it for
// its own single "work" step.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Actions, Button, TextField, DateField, NumberField, Notice, KeyValues,
} from '../../staff/components/StepPrimitives';
import TaskPage from '../../staff/components/TaskPage';
import { FilterSegments } from '../../staff/components/ListTools';
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

const LOG_DRAFT_KEY = 'feedTheSoil-log';

export default function FeedTheSoilFlow({ onCrumbChange }) {
  const [phase, setPhase] = useState('list'); // list | log | return | done
  const [lastAction, setLastAction] = useState(null); // 'logged' | 'returned', for the done screen

  const [kits, setKits] = useState([]);
  const [segment, setSegment] = useState('out'); // out | returned
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [returningKit, setReturningKit] = useState(null);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  // ── Log-a-kit form state ──────────────────────────────────
  // Seeded empty here — startLog() below is the one entry point into
  // this phase and re-reads any saved draft fresh every time, which
  // also covers re-opening the form after Cancel, not just first load.
  const [kitLabel, setKitLabel] = useState('');
  const [location, setLocation] = useState('');
  const [dateOut, setDateOut] = useState(todayISO());
  const [wasteKg, setWasteKg] = useState('');

  // ── Return form state ─────────────────────────────────────
  const [compostKg, setCompostKg] = useState('');

  useEffect(() => { onCrumbChange?.(phase === 'list' ? 'Kits' : phase === 'log' ? 'Log a kit' : phase === 'return' ? 'Mark returned' : 'Saved'); }, [phase, onCrumbChange]);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const res = await collectionKitAPI.listKits();
      setKits(res?.data ?? res ?? []);
    } catch (err) {
      setListError(err.message || 'Could not load kits.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  // Persist the log-a-kit draft as it's typed, same as ReceivingFlow —
  // a tablet that sleeps mid-entry should not cost a retyped label and
  // weight. Cleared on submit or on leaving the form.
  useEffect(() => {
    if (phase !== 'log') return;
    writeDraft(LOG_DRAFT_KEY, { kitLabel, location, dateOut, wasteKg });
  }, [phase, kitLabel, location, dateOut, wasteKg]);

  const outKits = useMemo(() => kits.filter((k) => k.status === 'out'), [kits]);
  const returnedKits = useMemo(() => kits.filter((k) => k.status === 'returned'), [kits]);
  const visibleKits = segment === 'out' ? outKits : returnedKits;

  const startLog = () => {
    const draft = readDraft(LOG_DRAFT_KEY);
    setKitLabel(draft?.kitLabel ?? '');
    setLocation(draft?.location ?? '');
    setDateOut(draft?.dateOut ?? todayISO());
    setWasteKg(draft?.wasteKg ?? '');
    setFormError(null);
    setPhase('log');
  };

  const startReturn = (kit) => {
    setReturningKit(kit);
    setCompostKg('');
    setFormError(null);
    setPhase('return');
  };

  const backToList = () => {
    setPhase('list');
    setReturningKit(null);
    setFormError(null);
  };

  const labelMissing = !kitLabel.trim();
  const wasteInvalid = wasteKg === '' || Number.isNaN(Number(wasteKg)) || Number(wasteKg) < 0;
  const compostInvalid = compostKg === '' || Number.isNaN(Number(compostKg)) || Number(compostKg) < 0;

  const submitLog = async () => {
    if (labelMissing || wasteInvalid) return;
    setBusy(true);
    setFormError(null);
    try {
      await collectionKitAPI.logKitOut({
        kitLabel: kitLabel.trim(),
        location: location.trim(),
        dateOut,
        kgFoodWasteCollected: Number(wasteKg),
      });
      clearDraft(LOG_DRAFT_KEY);
      setLastAction('logged');
      setPhase('done');
      await load();
    } catch (err) {
      setFormError(err.message || 'Could not log the kit.');
    } finally {
      setBusy(false);
    }
  };

  const submitReturn = async () => {
    if (!returningKit || compostInvalid) return;
    setBusy(true);
    setFormError(null);
    try {
      await collectionKitAPI.markReturned(returningKit.id, Number(compostKg));
      setLastAction('returned');
      setPhase('done');
      await load();
    } catch (err) {
      setFormError(err.message || 'Could not mark the kit returned.');
    } finally {
      setBusy(false);
    }
  };

  // ── List ───────────────────────────────────────────────────
  if (phase === 'list') {
    return (
      <TaskPage
        title="Feed the Soil"
        sub="Kits (buckets) of food waste swapped for compost. Log one going out, and again when it comes back."
        actions={
          <Actions>
            <Button onClick={startLog}>Log a kit going out</Button>
          </Actions>
        }
      >
        {listError ? <Notice tone="warn">{listError}</Notice> : null}

        <FilterSegments
          label="Kit status"
          value={segment}
          onChange={setSegment}
          options={[
            { key: 'out', label: 'Out', count: outKits.length },
            { key: 'returned', label: 'Returned', count: returnedKits.length },
          ]}
        />

        {loading ? (
          <div className="stf-skeleton" aria-label="Loading" />
        ) : visibleKits.length === 0 ? (
          <div className="stf-empty">
            {segment === 'out' ? 'No kits are currently out.' : 'No kits have been marked returned yet.'}
          </div>
        ) : (
          <div className="stf-list">
            {visibleKits.map((kit) => (
              <div
                key={kit.id}
                className={`stf-row${kit.status === 'out' ? '' : ' is-static'}`}
                {...(kit.status === 'out' ? {
                  role: 'button', tabIndex: 0,
                  onClick: () => startReturn(kit),
                  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startReturn(kit); } },
                } : {})}
              >
                <span className="stf-row-main">
                  <span className="stf-row-title">{kit.kit_label}</span>
                  <span className="stf-row-meta">
                    {kit.location ? `${kit.location} · ` : ''}
                    Out {fmtDate(kit.date_out)} · {fmtKg(kit.kg_food_waste_collected)} waste
                    {kit.status === 'returned' ? ` · ${fmtKg(kit.kg_compost_returned)} compost back ${fmtDateTime(kit.returned_at)}` : ''}
                    {kit.logged_by_name ? ` · Logged by ${kit.logged_by_name}` : ''}
                  </span>
                </span>
                {kit.status === 'out' ? (
                  <button type="button" className="stf-btn stf-btn-secondary" onClick={() => startReturn(kit)}>
                    Mark returned
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </TaskPage>
    );
  }

  // ── Log a kit ──────────────────────────────────────────────
  if (phase === 'log') {
    const commit = (
      <Actions>
        <Button disabled={busy || labelMissing || wasteInvalid} onClick={submitLog}>
          {busy ? 'Logging' : 'Log kit'}
        </Button>
        <Button variant="secondary" onClick={backToList}>Cancel</Button>
      </Actions>
    );
    const blockers = [];
    if (labelMissing) blockers.push('the kit / bucket label');
    if (wasteInvalid) blockers.push('the weight of food waste collected');

    return (
      <TaskPage
        title="Log a kit going out"
        sub="One entry per bucket, when it physically leaves with food waste."
        note={blockers.length ? `Still needed: ${blockers.join(', ')}.` : null}
        actions={commit}
        side={
          <div className="stf-summary">
            <p className="stf-summary-title">This kit</p>
            <KeyValues
              pairs={[
                ['Label', kitLabel || '—'],
                ['Location', location || '—'],
                ['Date out', fmtDate(dateOut)],
                ['Waste', wasteKg ? `${wasteKg} kg` : '—'],
              ]}
            />
          </div>
        }
      >
        {formError ? <Notice tone="warn">{formError}</Notice> : null}

        <TextField
          id="fts-label" label="Kit / bucket label" value={kitLabel}
          onChange={setKitLabel} placeholder="e.g. Bucket A1"
        />
        <TextField
          id="fts-location" label="Location (optional)" value={location}
          onChange={setLocation} placeholder="e.g. Cape Town Warehouse"
        />
        <DateField id="fts-date" label="Date out" value={dateOut} onChange={setDateOut} />
        <NumberField
          id="fts-waste" label="Kilograms of food waste collected"
          value={wasteKg} onChange={setWasteKg} flagged={wasteKg !== '' && wasteInvalid}
        />
      </TaskPage>
    );
  }

  // ── Mark a kit returned ────────────────────────────────────
  if (phase === 'return' && returningKit) {
    const commit = (
      <Actions>
        <Button disabled={busy || compostInvalid} onClick={submitReturn}>
          {busy ? 'Saving' : 'Mark returned'}
        </Button>
        <Button variant="secondary" onClick={backToList}>Cancel</Button>
      </Actions>
    );

    return (
      <TaskPage
        title={`Mark "${returningKit.kit_label}" returned`}
        sub={`Went out ${fmtDate(returningKit.date_out)} with ${fmtKg(returningKit.kg_food_waste_collected)} of food waste.`}
        note={compostInvalid ? 'Still needed: the weight of compost returned.' : null}
        actions={commit}
      >
        {formError ? <Notice tone="warn">{formError}</Notice> : null}

        <NumberField
          id="fts-compost" label="Kilograms of compost returned"
          value={compostKg} onChange={setCompostKg} flagged={compostKg !== '' && compostInvalid}
        />
      </TaskPage>
    );
  }

  // ── Done ───────────────────────────────────────────────────
  return (
    <TaskPage
      title="Saved"
      sub={
        lastAction === 'returned'
          ? 'The compost is on the system and counts toward this month\'s Feed the Soil figure.'
          : 'The kit is on the system as out with food waste.'
      }
      actions={
        <Actions>
          <Button onClick={backToList}>Back to kits</Button>
        </Actions>
      }
    />
  );
}
