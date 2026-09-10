// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/PalletCheck.jsx
//
// One pallet at the gate.
//
// SHAPE (changed)
// This used to be three sequential screens inside a dialog, with a
// second, near-duplicate render tree for Form mode. It is now two
// screens on the page itself:
//
//   1  Which pallet   the beneficiary, the eligibility flags, and a
//                     manager's override reason where one is needed
//   2  Load and release   every line at once, the driver, the signature
//
// Guided and Form are no longer different trees. They are the same
// list; Guided focuses one row at a time and offers Next, Form leaves
// every row collapsed and inline-editable. The worker can see the
// whole pallet either way, and can tap any line to jump to it — which
// is what "Guided" was previously unable to offer.
//
// The one HARD block is an inactive beneficiary centre (BR-11) —
// nothing here gets past that, for anyone. A pallet packing has not
// closed off needs a manager's typed reason; a warehouse worker is
// told to find one. This screen is not the source of truth for any of
// that — evaluateEligibility() on the server is — but disagreeing
// with it here would mean filling in a whole form only to be refused
// at the last tap.
//
// wrongDay is deliberately NOT an override condition, matching
// dispatch.service.js's collect(): a pallet booked for another day is
// recorded rather than gated, same as a written-off one.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, TextField, Notice, KeyValues,
  ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import TaskPage from '../../staff/components/TaskPage';
import WorkList from '../../staff/components/WorkList';
import { readDraft, writeDraft, clearDraft } from '../../staff/hooks/useDraft';
import useCoachmark from '../../staff/hooks/useCoachmark';
import { useAuth } from '../../../context/AuthContext';
import dispatchAPI, { newIdempotencyKey } from '../../../services/dispatchAPI';
import SignaturePad from '../../procurement/components/SignaturePad';
import DispatchNotePDF from './DispatchNotePDF';

const isManager = (user) => user?.role === 'manager' || user?.role === 'admin';

// Postgres NUMERIC arrives from node-postgres as a string, so
// packed_quantity is "1.000" and "35.000". String() kept that
// verbatim, which put "1.000" in the box for one crate and left the
// caret behind three meaningless zeros. Number() first.
const qtyToInput = (value) => (value === null || value === undefined ? '' : String(Number(value)));

const SignatureField = ({ value, onChange }) => (
  <div className="stf-signature-field">
    <span className="stf-field-label">Driver&rsquo;s signature</span>
    <SignaturePad
      onChange={onChange}
      canvasClassName="stf-sign-canvas"
      clearButtonClassName="stf-signature-clear"
    />
    {!value ? (
      <p className="stf-field-hint">Ask the driver to sign above before you finish.</p>
    ) : null}
  </div>
);

const MODE_KEY = 'stf_dispatch_view_mode';
const MODES = [
  { value: 'guided', label: 'Guided', hint: 'One line at a time' },
  { value: 'full',   label: 'Form',   hint: 'Every line at once' },
];
const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

const TOTAL_STEPS = 2;
const STEP_META = {
  which: { n: 1, label: 'Which pallet' },
  work:  { n: 2, label: 'Load and release' },
  done:  { n: 2, label: 'Collected' },
};

// The reasons this screen can put on a line without asking a worker to
// type free text (ACC-09: no field a floor worker has to compose a
// sentence into).
const varianceReasonFor = (variance) =>
  variance === 0 ? null : variance < 0 ? 'Short count at dispatch' : 'Over count at dispatch';

export default function PalletCheck({ palletId, onBack, onCollected }) {
  const { user } = useAuth();

  const [gateView, setGateView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [phase, setPhase] = useState('which');
  const [lines, setLines] = useState([]);
  const [focusId, setFocusId] = useState(null);

  const [overrideReason, setOverrideReason] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [signature, setSignature] = useState(null);

  const [mode, setMode] = useState(readStoredMode);
  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('dispatch-view-toggle');

  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pdfNote, setPdfNote] = useState(null);

  const draftKey = palletId ? `dispatch-${palletId}` : null;

  // A fresh pallet is a fresh session — DispatchPage keeps this
  // component mounted across pallets (only `palletId` changes), so
  // none of the previous pallet's state, or its idempotency key, may
  // survive into this one.
  useEffect(() => {
    let cancelled = false;
    // Wrapped rather than called directly at the top of the effect —
    // react-hooks/set-state-in-effect flags a bare synchronous
    // setState in an effect body.
    const resetForNewPallet = () => {
      setLoading(true);
      setLoadError(null);
      setPhase('which');
      setFocusId(null);
      setOverrideReason('');
      setDriverName('');
      setVehicleReg('');
      setSignature(null);
      setPdfNote(null);
      setError(null);
      setAttemptKey(newIdempotencyKey());
    };
    resetForNewPallet();

    dispatchAPI.getGateView(palletId)
      .then((view) => {
        if (cancelled) return;
        setGateView(view);

        // Exception-first: a pallet normally goes out exactly as it
        // was packed, so every line starts at the packed quantity and
        // the worker's job is to say what is different.
        const built = (view.items || []).map((item) => ({
          itemId:   item.id,
          name:     item.product_name,
          sku:      item.sku,
          unit:     item.unit,
          required: Number(item.required_quantity ?? 0),
          packed:   item.packed_quantity === null ? null : Number(item.packed_quantity),
          loaded:   qtyToInput(item.packed_quantity),
        }));

        // A draft only refills the numbers and the driver's details —
        // never the eligibility state, which is the server's to decide
        // and may have changed since the tablet went to sleep.
        const draft = readDraft(`dispatch-${palletId}`);
        if (draft) {
          setLines(built.map((l) => (
            draft.loaded && draft.loaded[l.itemId] !== undefined
              ? { ...l, loaded: draft.loaded[l.itemId] }
              : l
          )));
          if (draft.driverName) setDriverName(draft.driverName);
          if (draft.vehicleReg) setVehicleReg(draft.vehicleReg);
        } else {
          setLines(built);
        }
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [palletId]);

  const step = STEP_META[phase];
  const showToggle = phase === 'work';
  const eligibility = gateView?.eligibility || {};

  // Only lines that were actually packed can be loaded — the same
  // filter dispatch.repository.js's collect() applies server-side.
  const packedLines = useMemo(
    () => lines.filter((l) => l.packed !== null && l.packed > 0),
    [lines]
  );
  const hasLines = packedLines.length > 0;

  const needsOverride = eligibility.slipNotPacked;
  const overrideReasonText = eligibility.slipNotPacked
    ? 'packing has not closed this pallet off yet'
    : '';
  const canStart = !eligibility.ecdInactive && (!needsOverride || (isManager(user) && overrideReason.trim()));

  // Save the draft whenever the numbers or the driver change. Guarded
  // on phase so an untouched pallet does not leave a draft behind.
  useEffect(() => {
    if (phase !== 'work' || !draftKey) return;
    const loaded = {};
    for (const line of packedLines) loaded[line.itemId] = line.loaded;
    writeDraft(draftKey, { loaded, driverName, vehicleReg });
  }, [phase, draftKey, packedLines, driverName, vehicleReg]);

  const handleModeChange = (next) => {
    setMode(next);
    // Guided focuses the first line that still needs a look; Form has
    // no focused row at all.
    setFocusId(next === 'guided' ? (packedLines[0]?.itemId ?? null) : null);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* nothing we can do */ }
    dismissCoachmark();
  };

  useEffect(() => {
    if (!showCoachmark || !showToggle) return undefined;
    const timer = setTimeout(dismissCoachmark, 5000);
    return () => clearTimeout(timer);
  }, [showCoachmark, showToggle, dismissCoachmark]);

  const startCollection = () => {
    setPhase('work');
    setFocusId(mode === 'guided' ? (packedLines[0]?.itemId ?? null) : null);
  };

  const patchLine = (itemId, patch) =>
    setLines((all) => all.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line)));

  const acceptAllAsPacked = () =>
    setLines((all) => all.map((line) => (
      line.loaded === '' ? { ...line, loaded: qtyToInput(line.packed) } : line
    )));

  const focusIndex = packedLines.findIndex((l) => l.itemId === focusId);
  const goToNextLine = () => {
    const next = packedLines[focusIndex + 1];
    setFocusId(next ? next.itemId : null);
  };

  // What is stopping the commit, said out loud. A disabled primary
  // with no explanation is a dead end, and here the missing thing is
  // usually a field further down the page.
  const blockers = [];
  if (!driverName.trim()) blockers.push("the driver's name");
  if (!signature) blockers.push("the driver's signature");
  if (packedLines.some((l) => l.loaded === '')) blockers.push('a count on every line');
  const blockedNote = blockers.length
    ? `Still needed: ${blockers.join(', ')}.`
    : null;

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const overrides = packedLines
        .filter((line) => Number(line.loaded || 0) !== line.packed)
        .map((line) => ({
          itemId:         line.itemId,
          loadedQuantity: Number(line.loaded || 0),
          varianceReason: varianceReasonFor(Number(line.loaded || 0) - line.packed),
        }));

      const result = await dispatchAPI.recordCollection(palletId, {
        driverName,
        vehicleReg,
        signature,
        lines: overrides,
        idempotencyKey: attemptKey,
        overrideReason: needsOverride ? overrideReason : null,
      });

      setPhase('done');
      clearDraft(draftKey);
      // recordCollection's response already carries the full joined
      // note — no second fetch needed for the pop-up.
      setPdfNote(result.note);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const backToQueue = () => {
    setPdfNote(null);
    onCollected?.();
  };

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;
  if (loadError) return <Notice tone="warn">{loadError}</Notice>;
  if (!gateView) return null;

  const commit = (
    <Actions>
      <Button disabled={saving || blockers.length > 0} onClick={finish}>
        {saving ? 'Saving' : 'Confirm collection'}
      </Button>
      {mode === 'guided' && focusIndex >= 0 && focusIndex + 1 < packedLines.length ? (
        <Button variant="secondary" onClick={goToNextLine}>Next item</Button>
      ) : null}
      <Button variant="secondary" onClick={onBack}>Back to the gate queue</Button>
    </Actions>
  );

  return (
    <>
      {showToggle ? (
        <div className="stf-toggle-anchor">
          <ViewToggle options={MODES} value={mode} onChange={handleModeChange} />
          <Coachmark show={showCoachmark} onDismiss={dismissCoachmark}>
            Tap here to switch view
          </Coachmark>
        </div>
      ) : null}

      {phase !== 'done' ? <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} /> : null}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which pallet ───────────────────────────────── */}
      {phase === 'which' && (
        <StepScreen
          title={gateView.ecd_name}
          sub={gateView.pallet_ref ? `Pallet ${gateView.pallet_ref}` : 'Check the pallet before you release it.'}
          actions={
            <Actions>
              <Button disabled={!canStart} onClick={startCollection}>Start the collection</Button>
              <Button variant="secondary" onClick={onBack}>Back to the gate queue</Button>
            </Actions>
          }
        >
          <KeyValues
            pairs={[
              ['Cohort', gateView.cohort],
              ['Items', `${packedLines.length}`],
            ]}
          />

          {eligibility.ecdInactive ? (
            <Notice tone="warn">
              {gateView.ecd_name} is not an active centre with approved quantities, so this pallet
              cannot be released. Ask a manager to activate the centre first.
            </Notice>
          ) : null}

          {!eligibility.ecdInactive && needsOverride ? (
            isManager(user) ? (
              <div className="stf-field">
                <label className="stf-field-label" htmlFor="stf-override-reason">
                  Reason for authorising this collection
                </label>
                <textarea
                  id="stf-override-reason"
                  className="stf-input is-text"
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder={`${overrideReasonText}. Say why this can still go out today.`}
                />
              </div>
            ) : (
              <Notice tone="warn">
                {overrideReasonText}. Ask a manager to authorise this collection at the gate.
              </Notice>
            )
          ) : null}

          {eligibility.hasFlaggedLines ? (
            <Notice tone="warn">Packing flagged one or more lines on this pallet. Check them below.</Notice>
          ) : null}
          {eligibility.hasVariance ? (
            <Notice tone="warn">What was packed doesn&rsquo;t match the order on one or more lines.</Notice>
          ) : null}
          {eligibility.writtenOff ? (
            <Notice>
              This pallet was written off as not collected. It is still here — collecting it now
              records a late collection, nothing else changes.
            </Notice>
          ) : null}
          {eligibility.wrongDay ? (
            <Notice>
              {gateView.ecd_name} is booked for another day. Collecting it now still goes through —
              it&rsquo;s recorded as an off-schedule collection for your manager to see.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      {/* ── 2 · Load and release ───────────────────────────── */}
      {phase === 'work' && (
        <TaskPage
          title={gateView.ecd_name}
          sub="Check every line, then take the driver's name and signature."
          note={blockedNote}
          actions={commit}
          side={
            <div className="stf-summary">
              <p className="stf-summary-title">Driver</p>
              <TextField
                id="stf-driver-name"
                label="Driver's name"
                value={driverName}
                onChange={setDriverName}
              />
              <TextField
                id="stf-vehicle-reg"
                label="Vehicle registration (optional)"
                value={vehicleReg}
                onChange={setVehicleReg}
              />
              <SignatureField value={signature} onChange={setSignature} />
            </div>
          }
        >
          {needsOverride && isManager(user) ? (
            <div className="stf-field">
              <label className="stf-field-label" htmlFor="stf-work-override-reason">
                Reason for authorising this collection
              </label>
              <textarea
                id="stf-work-override-reason"
                className="stf-input is-text"
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={`${overrideReasonText}. Say why this can still go out today.`}
              />
            </div>
          ) : null}

          {hasLines ? (
            <WorkList
              lines={packedLines.map((line) => ({
                id:       line.itemId,
                title:    line.name,
                sku:      line.sku,
                unit:     line.unit,
                expected: line.packed,
                value:    line.loaded,
              }))}
              expectedLabel="packed"
              focusId={mode === 'guided' ? focusId : null}
              onFocus={(id) => setFocusId(mode === 'guided' ? id : null)}
              onChange={(id, value) => patchLine(id, { loaded: value })}
              onAcceptAll={acceptAllAsPacked}
              acceptAllLabel="Everything as packed"
              renderDetail={(row) => {
                const line = packedLines.find((l) => l.itemId === row.id);
                if (!line) return null;
                const varied = line.loaded !== '' && Number(line.loaded) !== line.packed;
                return (
                  <>
                    <KeyValues
                      pairs={[
                        ['Code', line.sku],
                        ['Packed', `${line.packed} ${line.unit}`],
                        ['Ordered', `${line.required} ${line.unit}`],
                      ]}
                    />
                    {varied ? (
                      <Notice tone="warn">
                        That&rsquo;s different from what packing recorded. Saving still records the
                        collection — a manager will see the difference.
                      </Notice>
                    ) : null}
                  </>
                );
              }}
            />
          ) : (
            <Notice>Nothing on this pallet was packed, so there is nothing to load.</Notice>
          )}
        </TaskPage>
      )}

      {/* ── Done ───────────────────────────────────────────── */}
      {phase === 'done' && (
        <StepScreen
          title="Collection confirmed"
          sub="The stock is off the system and the pallet is on its way."
          actions={
            <Actions>
              <Button onClick={backToQueue}>Back to the gate queue</Button>
            </Actions>
          }
        />
      )}

      {pdfNote ? (
        <DispatchNotePDF note={pdfNote} onClose={() => setPdfNote(null)} />
      ) : null}
    </>
  );
}
