// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/PalletCheck.jsx
//
// One pallet at the gate, as three sequential screens (ACC-05),
// matching the shape ReceivingFlow.jsx and DecantingFlow.jsx already
// established:
//
//   1  Which pallet is this?    the ECD, the eligibility flags, an
//                                override reason if a manager needs
//                                to authorise one
//   2  Count what's loaded      one line, one number — repeats per
//                                item, same as receiving's per-line
//                                counting screen
//   3  Confirm the collection   read-back, driver's name and vehicle,
//                                the driver's signature, then finish
//
// There is no put-away step here — nothing about a collection has a
// location to record — so this is three steps, not receiving's four.
//
// Guided and Form modes read and write the exact same state, the same
// `mode` pattern ReceivingFlow.jsx/DecantingFlow.jsx use: Form is the
// same fields as one scrolling dialog instead of three screens.
//
// The one HARD block is an inactive ECD centre (BR-11) — nothing here
// can get past that, for anyone. Two more (a pallet booked for
// another day, or one packing hasn't closed off) need a manager's
// typed reason to proceed; a warehouse worker sees why and is told to
// find one, matching exactly what dispatch.service.js's collect()
// itself enforces — this screen is not the source of truth for any of
// that, evaluateEligibility() on the server is, but disagreeing with
// it here would just mean a worker fills in a whole form only to have
// the server refuse it at the very last tap.
//
// A dispatch note pops up after a successful collection, the same way
// DeliveryNotePDF/DecantingSheetPDF do — see DispatchNotePDF.jsx, fed
// by what recordCollection's response already returns (the full
// joined note, not just the bare event row — see dispatch.service.js's
// own getDispatchNote-after-collect pattern).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, NumberField, TextField, Notice, KeyValues,
  ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import useCoachmark from '../../staff/hooks/useCoachmark';
import { useAuth } from '../../../context/AuthContext';
import dispatchAPI, { newIdempotencyKey } from '../../../services/dispatchAPI';
import SignaturePad from '../../procurement/components/SignaturePad';
import DispatchNotePDF from './DispatchNotePDF';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';

const isManager = (user) => user?.role === 'manager' || user?.role === 'admin';

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
  { value: 'guided', label: 'Guided', hint: 'Step by step' },
  { value: 'full',   label: 'Form',   hint: 'Everything at once' },
];
const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

const TOTAL_STEPS = 3;
const STEP_META = {
  which: { n: 1, label: 'Which pallet' },
  count: { n: 2, label: 'Counting' },
  check: { n: 3, label: 'Confirm the collection' },
  done:  { n: 3, label: 'Collected' },
};

// The reasons this screen can put on a line without asking a worker
// to type free text — the same choice ReceivingFlow.jsx made for its
// own discrepancyReason, and for the same reason (ACC-09: no field a
// floor worker has to compose a sentence into).
const varianceReasonFor = (variance) =>
  variance === 0 ? null : variance < 0 ? 'Short count at dispatch' : 'Over count at dispatch';

export default function PalletCheck({ palletId, onBack, onCollected }) {
  const { user } = useAuth();

  const [gateView, setGateView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [phase, setPhase] = useState('which');
  const [lineIndex, setLineIndex] = useState(0);
  const [lines, setLines] = useState([]);

  const [overrideReason, setOverrideReason] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [signature, setSignature] = useState(null);

  const [mode, setMode] = useState(readStoredMode);
  const [formOpen, setFormOpen] = useState(false);
  const [shellNode, setShellNode] = useState(null);
  useEffect(() => {
    const resolve = () => setShellNode(document.querySelector('.stf-shell'));
    resolve();
  }, []);
  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('dispatch-view-toggle');

  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pdfNote, setPdfNote] = useState(null);

  // A fresh pallet is a fresh session — DispatchPage keeps this
  // component mounted across pallets (only `palletId` changes), so
  // none of the previous pallet's state, or its idempotency key, may
  // survive into this one.
  useEffect(() => {
    let cancelled = false;
    // Wrapped rather than called directly at the top of the effect —
    // react-hooks/set-state-in-effect flags a bare synchronous
    // setState in an effect body; the same workaround ReceivingFlow.jsx
    // and DecantingFlow.jsx use for their own shellNode-resolving effect.
    const resetForNewPallet = () => {
      setLoading(true);
      setLoadError(null);
      setPhase('which');
      setLineIndex(0);
      setOverrideReason('');
      setDriverName('');
      setVehicleReg('');
      setSignature(null);
      setFormOpen(false);
      setPdfNote(null);
      setError(null);
      setAttemptKey(newIdempotencyKey());
    };
    resetForNewPallet();

    dispatchAPI.getGateView(palletId)
      .then((view) => {
        if (cancelled) return;
        setGateView(view);
        setLines(
          (view.items || []).map((item) => ({
            itemId:   item.id,
            name:     item.product_name,
            sku:      item.sku,
            unit:     item.unit,
            required: Number(item.required_quantity ?? 0),
            packed:   item.packed_quantity === null ? null : Number(item.packed_quantity),
            loaded:   item.packed_quantity === null ? '' : String(item.packed_quantity),
          }))
        );
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [palletId]);

  const step = STEP_META[phase];
  const showToggle = phase !== 'done';
  const eligibility = gateView?.eligibility || {};
  // Only lines that were actually packed can be loaded — the same
  // filter dispatch.repository.js's collect() applies server-side, so
  // a line the packer never confirmed does not show as something to
  // count at the gate.
  const packedLines = lines.filter((l) => l.packed !== null && l.packed > 0);
  const currentLine = packedLines[lineIndex];
  const hasLines = packedLines.length > 0;

  const needsOverride = eligibility.wrongDay || eligibility.slipNotPacked;
  const overrideReasonText = [
    eligibility.wrongDay ? `${gateView?.ecd_name} is booked for another day` : null,
    eligibility.slipNotPacked ? 'packing has not closed this pallet off yet' : null,
  ].filter(Boolean).join(', and ');
  const canStart = !eligibility.ecdInactive && (!needsOverride || (isManager(user) && overrideReason.trim()));

  const handleModeChange = (next) => {
    setMode(next);
    if (next === 'full') setFormOpen(true);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* nothing we can do */ }
    dismissCoachmark();
  };

  useEffect(() => {
    if (!showCoachmark || !showToggle) return undefined;
    const timer = setTimeout(dismissCoachmark, 5000);
    return () => clearTimeout(timer);
  }, [showCoachmark, showToggle, dismissCoachmark]);

  const startCollection = () => {
    if (mode === 'full') { setFormOpen(true); return; }
    setLineIndex(0);
    setPhase(hasLines ? 'count' : 'check');
  };

  const patchLineAt = (index, patch) =>
    setLines((all) => {
      const target = packedLines[index];
      if (!target) return all;
      return all.map((line) => (line.itemId === target.itemId ? { ...line, ...patch } : line));
    });

  const goToNextLine = () => {
    if (lineIndex + 1 < packedLines.length) {
      setLineIndex(lineIndex + 1);
    } else {
      setPhase('check');
    }
  };

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
      setFormOpen(false);
      // recordCollection's response already carries the full joined
      // note (see dispatch.service.js's own getDispatchNote-after-
      // collect pattern) — no second fetch needed for the pop-up.
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

      {mode === 'full' ? null : <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} />}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which pallet (Guided) ──────────────────────── */}
      {phase === 'which' && mode !== 'full' && (
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
              This pallet was not collected by 16:00pm. Collecting it
              now records a late collection.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      {/* ── 2 · Count what's loaded ────────────────────────── */}
      {mode !== 'full' && phase === 'count' && currentLine && (
        <StepScreen
          title={currentLine.name}
          sub={`Packing counted ${currentLine.packed}. Count what's actually going onto the vehicle.`}
          actions={
            <Actions>
              <Button disabled={currentLine.loaded === ''} onClick={goToNextLine}>
                {lineIndex + 1 < packedLines.length ? 'Next item' : 'Confirm the collection'}
              </Button>
              {lineIndex > 0 ? (
                <Button variant="secondary" onClick={() => setLineIndex(lineIndex - 1)}>
                  Back to the last item
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setPhase('which')}>Back</Button>
              )}
            </Actions>
          }
        >
          <NumberField
            id="stf-loaded"
            label="How many are going on the vehicle?"
            value={currentLine.loaded}
            flagged={currentLine.loaded !== '' && Number(currentLine.loaded) !== currentLine.packed}
            onChange={(value) => patchLineAt(lineIndex, { loaded: value })}
          />

          <KeyValues
            pairs={[
              ['Code', currentLine.sku],
              ['Packed', `${currentLine.packed} ${currentLine.unit}`],
              ['Item', `${lineIndex + 1} of ${packedLines.length}`],
            ]}
          />

          {currentLine.loaded !== '' && Number(currentLine.loaded) !== currentLine.packed ? (
            <Notice tone="warn">
              That's different from what packing recorded. Saving the record will alert the manager.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      {/* ── 3 · Confirm the collection ─────────────────────── */}
      {mode !== 'full' && phase === 'check' && (
        <StepScreen
          title="Does this look right?"
          sub="Tap any line to change it, then get the driver's signature."
          actions={
            <Actions>
              <Button disabled={saving || !driverName.trim() || !signature} onClick={finish}>
                {saving ? 'Saving' : 'Confirm collection'}
              </Button>
            </Actions>
          }
        >
          {packedLines.length > 0 ? (
            <div className="stf-list">
              {packedLines.map((line, i) => {
                const varied = line.loaded !== '' && Number(line.loaded) !== line.packed;
                return (
                  <button
                    key={line.itemId}
                    type="button"
                    className={`stf-row${varied ? ' is-warn' : ''}`}
                    onClick={() => { setLineIndex(i); setPhase('count'); }}
                  >
                    {varied ? <span className="stf-notice-mark" aria-hidden="true">!</span> : null}
                    <span className="stf-row-main">
                      <span className="stf-row-title">{line.name}</span>
                      <span className="stf-row-meta">
                        {line.loaded || 0} {line.unit} loaded · packed {line.packed} {line.unit}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

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
        </StepScreen>
      )}

      {/* ── Form mode: an entry screen, plus one scrolling dialog ── */}
      {phase !== 'done' && mode === 'full' && (
        <StepScreen
          title="Fill in one form"
          actions={
            <Actions>
              <Button disabled={!canStart} onClick={() => setFormOpen(true)}>
                Start this collection
              </Button>
              <Button variant="secondary" onClick={onBack}>Back to the gate queue</Button>
            </Actions>
          }
        >
          {eligibility.ecdInactive ? (
            <Notice tone="warn">
              {gateView.ecd_name} is not an active centre, so this pallet
              cannot be released. Ask manager to activate the centre first.
            </Notice>
          ) : null}
          {!eligibility.ecdInactive && needsOverride && !isManager(user) ? (
            <Notice tone="warn">
              {overrideReasonText}. Ask a manager to authorise this collection at the gate.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          container={shellNode ?? undefined}
          className="max-w-[560px] w-[calc(100%-2rem)] max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden"
        >
          <DialogHeader className="stf-dialog-head">
            <DialogTitle>{gateView.ecd_name}</DialogTitle>
            <DialogDescription>
              Check every line, then get the driver&rsquo;s name and signature.
            </DialogDescription>
          </DialogHeader>

          <div className="stf-dialog-scroll">
            <div className="stf-dialog-fields">
              {needsOverride && isManager(user) ? (
                <div className="stf-field">
                  <label className="stf-field-label" htmlFor="stf-full-override-reason">
                    Reason for authorising this collection
                  </label>
                  <textarea
                    id="stf-full-override-reason"
                    className="stf-input is-text"
                    rows={2}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder={`${overrideReasonText}. Say why this can still go out today.`}
                  />
                </div>
              ) : null}

              <div className="stf-formrows">
                {packedLines.map((line, i) => {
                  const varied = line.loaded !== '' && Number(line.loaded) !== line.packed;
                  return (
                    <div key={line.itemId} className={`stf-formrow${varied ? ' is-warn' : ''}`}>
                      <div className="stf-formrow-head">
                        <span className="stf-formrow-title">{line.name}</span>
                        <span className="stf-formrow-meta">
                          Code: {line.sku} · Packed: {line.packed} {line.unit}
                        </span>
                      </div>

                      <NumberField
                        id={`stf-full-loaded-${line.itemId}`}
                        label="How many are going on the vehicle?"
                        value={line.loaded}
                        flagged={varied}
                        onChange={(value) => patchLineAt(i, { loaded: value })}
                      />

                      {varied ? (
                        <Notice tone="warn">
                          That's different from what packing recorded. Saving the record will
                          alert the manager of the difference.
                        </Notice>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <TextField
                id="stf-full-driver-name"
                label="Driver's name"
                value={driverName}
                onChange={setDriverName}
              />
              <TextField
                id="stf-full-vehicle-reg"
                label="Vehicle registration (optional)"
                value={vehicleReg}
                onChange={setVehicleReg}
              />

              <SignatureField value={signature} onChange={setSignature} />
            </div>
          </div>

          <div className="stf-dialog-footer">
            <Actions>
              <Button disabled={saving || !driverName.trim() || !signature} onClick={finish}>
                {saving ? 'Saving' : 'Confirm collection'}
              </Button>
            </Actions>
          </div>
        </DialogContent>
      </Dialog>

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
