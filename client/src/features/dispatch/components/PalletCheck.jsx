// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/PalletCheck.jsx
//
// One pallet at the gate: what the slip says against what actually
// goes into the vehicle, then the driver's name and signature.
//
// WHAT CHANGED, and why it is not cosmetic
//
// 1. LOADED QUANTITY IS NOW CAPTURED. The whole reason stock is
//    deducted at the gate rather than at packing is that the gate is
//    where a human counts the goods a second time. The old screen
//    showed packed_quantity read-only and sent no line data, so every
//    dispatch deducted the packer's Monday figure and the re-check
//    counted for nothing. Each line is now editable and defaults to
//    the packed quantity, because "it all matched" is the common case
//    and must stay a single tap.
//
// 2. THE DRIVER IS NAMED. BR-13 makes the signature proof of
//    collection; a signature with nobody's name against it proves
//    very little. The server requires driverName and rejected every
//    request the old screen sent, which hardcoded collectedBy: null.
//
// 3. THE SERVER'S ELIGIBILITY FLAGS ARE OBEYED. wrongDay, writtenOff
//    and slipNotPacked need a manager's recorded reason; an inactive
//    centre (BR-11) is the one thing that cannot proceed at all.
//    These are read off the gate view rather than re-derived, so this
//    screen and the collect endpoint cannot disagree.
//
// 4. THE SUBMIT IS REPLAYABLE. One idempotency key is generated when
//    the screen opens and reused on every retry, so a driver in a
//    dead spot who taps Confirm twice does not get their stock
//    deducted twice.
//
// The governing principle is unchanged: nothing here stops food
// leaving the building over a data disagreement. A short count, a
// flagged line, a collection after 16:00 — all proceed. They are
// recorded, and where a person needs to own the decision, that person
// is asked for a reason.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import dispatchAPI, { newIdempotencyKey } from '../../../services/dispatchAPI';
import { useAuth } from '../../../context/AuthContext';
import { Actions, Button, Notice, TextField } from '../../staff/components/StepPrimitives';

// ── Signature pad ─────────────────────────────────────────────
// Unchanged in shape. The one fix: whether anything was drawn is now
// tracked on a ref as well as in state. `stop` used to read the state
// value captured in its own render, which is a race that only shows
// up as an occasional signature silently not registering — the worst
// possible bug on the one field that is legally load-bearing.
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const inked     = useRef(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = '#2b3336';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
  }, []);

  const posOf = (e) => {
    const rect  = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    // The canvas is 600x170 internally but CSS-scaled to the phone's
    // width. Without this ratio the ink lands away from the fingertip.
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
  };

  const start = (e) => {
    e.preventDefault();
    const { x, y } = posOf(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = posOf(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    inked.current = true;
    if (!signed) setSigned(true);
  };

  const stop = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    setSigned(false);
    onChange(null);
  };

  return (
    <div className="stf-field">
      <label className="stf-field-label" htmlFor="stf-signature">Driver signature</label>
      <canvas
        id="stf-signature"
        ref={canvasRef}
        className="stf-sign-canvas"
        width={600}
        height={170}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={stop}
      />
      <Button variant="secondary" onClick={clear} disabled={!signed}>Clear</Button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

// A South African keyboard produces both "12,5" and "12.5"; only one
// of them is a number. Same normalisation NumberField applies.
const toNumber = (value) => {
  const n = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
};

// A line only leaves the building if the packer actually put
// something on the pallet. This mirrors the server's own filter in
// dispatch.repository.collect — a flagged line with no quantity has
// nothing to load, so it is shown but not counted.
const isDispatchable = (item) =>
  ['confirmed', 'flagged'].includes(item.status) &&
  item.packed_quantity !== null &&
  Number(item.packed_quantity) > 0;

const GRID = { display: 'grid', gridTemplateColumns: '1.3fr .5fr .7fr', gap: 8, alignItems: 'center' };

const isManagerRole = (role) => role === 'manager' || role === 'admin';

export default function PalletCheck({ palletId, onBack, onCollected }) {
  const { user } = useAuth();

  const [gate, setGate]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome]   = useState(null);

  const [driverName, setDriverName]         = useState('');
  const [vehicleReg, setVehicleReg]         = useState('');
  const [signature, setSignature]           = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  // itemId -> string, as typed. Kept as strings so a half-typed "1."
  // doesn't collapse to 1 under the person's fingers.
  const [loaded, setLoaded]   = useState({});
  const [reasons, setReasons] = useState({});

  // ONE key for the life of this screen. Regenerating it per tap
  // would make every retry look like a fresh collection to the
  // server and deduct the stock again.
  const [idempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    let cancelled = false;

    dispatchAPI.getGateView(palletId)
      .then((data) => {
        if (cancelled) return;
        setGate(data);
        // Default every line to what was packed. The gate confirms a
        // count; it does not re-enter one from scratch.
        const defaults = {};
        for (const item of data.items || []) {
          if (isDispatchable(item)) defaults[item.id] = String(Number(item.packed_quantity));
        }
        setLoaded(defaults);
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load this pallet.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [palletId]);

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  if (error && !gate) {
    return (
      <>
        <Notice tone="warn">{error}</Notice>
        <Actions><Button variant="secondary" onClick={onBack}>Gate queue</Button></Actions>
      </>
    );
  }
  if (!gate) return null;

  // ── Done screen ─────────────────────────────────────────────
  // Only reached when the collection saved but the server sent
  // something back worth reading. A clean collection returns straight
  // to the queue.
  if (outcome) {
    return (
      <section className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Collection recorded</h1>
          <p className="stf-step-sub">{gate.ecd_name}</p>
        </div>

        {outcome.replayed ? (
          <Notice>This collection had already been saved. Nothing was recorded twice.</Notice>
        ) : null}

        {outcome.shortfalls?.length ? (
          <Notice tone="warn">
            The system now shows less of {outcome.shortfalls.length === 1 ? 'one item' : `${outcome.shortfalls.length} items`} in
            the building than it thought. The pallet has gone; tell a manager so the count can be checked.
          </Notice>
        ) : null}

        {outcome.unitMismatches?.length ? (
          <Notice tone="warn">
            Some items went out in a different unit to the one on record. A manager needs to look at those lines.
          </Notice>
        ) : null}

        <Actions>
          <Button onClick={onBack}>Gate queue</Button>
        </Actions>
      </section>
    );
  }

  const items        = gate.items || [];
  const dispatchable = items.filter(isDispatchable);
  const eligibility  = gate.eligibility || {};
  const manager      = isManagerRole(user?.role);

  // ── What the server will insist on ──────────────────────────
  // Same three conditions dispatch.service.collect checks, phrased
  // the way somebody at a gate would say them.
  const needsOverride = [];
  if (eligibility.wrongDay)      needsOverride.push('this pallet is booked for another day');
  if (eligibility.slipNotPacked) needsOverride.push('packing has not closed this pallet off yet');
  if (eligibility.writtenOff)    needsOverride.push('it was already written off as not collected at 16:00');

  // ── Line validation ─────────────────────────────────────────
  const lineErrors = {};
  for (const item of dispatchable) {
    const raw    = loaded[item.id];
    const value  = toNumber(raw);
    const packed = Number(item.packed_quantity);

    if (String(raw ?? '').trim() === '' || Number.isNaN(value) || value < 0) {
      lineErrors[item.id] = 'Enter how many went into the vehicle.';
    } else if (value !== packed && !String(reasons[item.id] || '').trim()) {
      // The count differing from the pallet is exactly the thing this
      // screen exists to catch. Recording the number without the
      // reason leaves a manager a discrepancy and no story.
      lineErrors[item.id] = 'Say why this differs from the pallet.';
    }
  }

  const hasLineErrors  = Object.keys(lineErrors).length > 0;
  const overrideNeeded = needsOverride.length > 0;
  const blockedByRole  = overrideNeeded && !manager;

  const canSubmit =
    !eligibility.ecdInactive &&
    !eligibility.alreadyDispatched &&
    !blockedByRole &&
    !hasLineErrors &&
    Boolean(driverName.trim()) &&
    Boolean(signature) &&
    (!overrideNeeded || Boolean(overrideReason.trim())) &&
    !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Sparse: only the lines that actually differ. Everything else
      // keeps its packed quantity server-side, which is both less to
      // send and less to get wrong.
      const lines = dispatchable
        .filter((item) => toNumber(loaded[item.id]) !== Number(item.packed_quantity))
        .map((item) => ({
          itemId:         item.id,
          loadedQuantity: toNumber(loaded[item.id]),
          varianceReason: String(reasons[item.id] || '').trim() || null,
        }));

      const result = await dispatchAPI.recordCollection(palletId, {
        driverName:     driverName.trim(),
        vehicleReg:     vehicleReg.trim() || null,
        signature,
        lines,
        idempotencyKey,
        overrideReason: overrideNeeded ? overrideReason.trim() : null,
      });

      // Only hold the screen when there is something to read.
      if (result?.shortfalls?.length || result?.unitMismatches?.length || result?.replayed) {
        setOutcome(result);
      } else {
        onCollected(result);
      }
    } catch (err) {
      setError(err.message || 'Could not save this collection. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Hard block (BR-11) ──────────────────────────────────────
  if (eligibility.ecdInactive) {
    return (
      <section className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Check the pallet</h1>
          <p className="stf-step-sub">{gate.ecd_name}</p>
        </div>
        <Notice tone="warn">
          {gate.ecd_name} is not an active centre with approved quantities, so a pallet cannot be released to it.
          A manager needs to activate the centre first.
        </Notice>
        <Actions><Button variant="secondary" onClick={onBack}>Gate queue</Button></Actions>
      </section>
    );
  }

  // ── Already gone ────────────────────────────────────────────
  if (eligibility.alreadyDispatched) {
    return (
      <section className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Already collected</h1>
          <p className="stf-step-sub">{gate.ecd_name}</p>
        </div>
        <Notice>
          This pallet was collected
          {gate.driver_name ? ` by ${gate.driver_name}` : ''}
          {gate.collected_at ? ` at ${new Date(gate.collected_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : ''}.
        </Notice>
        <Actions><Button variant="secondary" onClick={onBack}>Gate queue</Button></Actions>
      </section>
    );
  }

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>Check the pallet</h1>
        <p className="stf-step-sub">
          {gate.ecd_name}
          {gate.child_count ? ` · ${gate.child_count} children` : ''}
          {gate.pallet_ref ? ` · ${gate.pallet_ref}` : ''}
        </p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* Override-gated exceptions, named plainly. ACC-09: tell the
          person what is wrong AND what to do about it. */}
      {overrideNeeded ? (
        <Notice tone="warn">
          {needsOverride.join(', and ')}.{' '}
          {manager
            ? 'You can authorise it below — record a short reason.'
            : 'Ask a manager to authorise this collection at the gate.'}
        </Notice>
      ) : null}

      {eligibility.hasFlaggedLines ? (
        <Notice tone="warn">Packing flagged one or more items on this pallet. Check them against the shelf before you load.</Notice>
      ) : null}

      {dispatchable.length === 0 ? (
        <Notice tone="warn">Nothing was packed onto this pallet, so there is nothing to load.</Notice>
      ) : null}

      {/* ── The count ──────────────────────────────────────────
          SLIP is what the packer put on the pallet. LOADED is what
          goes into the vehicle, and it is the number that comes off
          the stock. */}
      <div className="stf-list">
        <div className="stf-row stf-row--check is-static">
          <span className="stf-row-main" style={GRID}>
            <span className="stf-row-meta">ITEM</span>
            <span className="stf-row-meta">SLIP</span>
            <span className="stf-row-meta">LOADED</span>
          </span>
        </div>

        {items.map((item) => {
          const packed   = item.packed_quantity === null ? null : Number(item.packed_quantity);
          const loadable = isDispatchable(item);
          const value    = loaded[item.id] ?? '';
          const differs  = loadable && toNumber(value) !== packed;
          const problem  = lineErrors[item.id];

          return (
            <div
              key={item.id}
              className={`stf-row stf-row--check${loadable ? '' : ' is-static'}${problem || differs ? ' is-warn' : ''}`}
            >
              <span className="stf-row-main" style={GRID}>
                <span className="stf-row-title">
                  {item.product_name}
                  <span className="stf-row-meta"> {item.unit}</span>
                </span>
                <span className="stf-row-value">{packed ?? '—'}</span>

                {loadable ? (
                  <input
                    className={`stf-input${problem ? ' is-flagged' : ''}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Quantity of ${item.product_name} loaded into the vehicle`}
                    value={value}
                    onChange={(e) =>
                      setLoaded((prev) => ({ ...prev, [item.id]: e.target.value.replace(',', '.') }))
                    }
                  />
                ) : (
                  <span className="stf-row-value">—</span>
                )}
              </span>

              {/* The reason field appears only once the numbers
                  actually disagree — no dead field on twenty clean
                  lines. */}
              {differs ? (
                <TextField
                  id={`stf-variance-${item.id}`}
                  label="Why the difference?"
                  value={reasons[item.id] || ''}
                  onChange={(v) => setReasons((prev) => ({ ...prev, [item.id]: v }))}
                  placeholder="e.g. one bag split in the yard"
                />
              ) : null}

              {problem ? <p className="stf-field-hint">{problem}</p> : null}

              {item.flag_reason ? (
                <p className="stf-field-hint">Packing noted: {item.flag_reason}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ── Who is taking it ───────────────────────────────────── */}
      <TextField
        id="stf-driver-name"
        label="Driver or collector's name"
        hint="Whoever signs for the pallet."
        value={driverName}
        onChange={setDriverName}
        autoComplete="off"
      />

      <TextField
        id="stf-vehicle-reg"
        label="Vehicle registration (optional)"
        value={vehicleReg}
        onChange={setVehicleReg}
        autoComplete="off"
      />

      {overrideNeeded && manager ? (
        <TextField
          id="stf-override-reason"
          label="Reason for authorising this collection"
          hint="Recorded against the collection, in your name."
          value={overrideReason}
          onChange={setOverrideReason}
          autoComplete="off"
        />
      ) : null}

      <SignaturePad onChange={setSignature} />

      <p className="stf-field-hint">
        Once signed, this pallet is recorded as collected and the loaded quantities come off the stock.
      </p>

      <Actions>
        <Button disabled={!canSubmit} onClick={handleConfirm}>
          {submitting ? 'Saving…' : 'Confirm collection'}
        </Button>
        <Button variant="secondary" onClick={onBack} disabled={submitting}>Gate queue</Button>
      </Actions>
    </section>
  );
}