// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/PalletCheck.jsx
//
// One pallet at the gate: slip quantity vs what's physically there,
// side by side, then a signature to confirm collection. The signature
// is the proof of delivery URS 2.3 asks for.
//
// recordCollection calls POST /api/picking/:id/collect — see
// dispatchAPI.js and picking.repository.js's collectSlip. A pallet
// only collects from 'complete'; the confirm button stays disabled
// (with an explanation) for anything else, including a slip someone
// else already collected between the queue loading and this screen
// opening.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import dispatchAPI from '../../../services/dispatchAPI';
import { Actions, Button, Notice } from '../../staff/components/StepPrimitives';

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = '#2b3336';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  }, []);

  const posOf = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
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
    setSigned(true);
  };

  const stop = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (signed) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
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
      <Button variant="secondary" onClick={clear}>Clear</Button>
    </div>
  );
}

export default function PalletCheck({ palletId, onBack, onCollected }) {
  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signature, setSignature] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dispatchAPI.getPallet(palletId)
      .then((data) => { if (!cancelled) setSlip(data); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load this pallet.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [palletId]);

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  if (error && !slip) {
    return (
      <>
        <Notice tone="warn">{error}</Notice>
        <Actions><Button variant="secondary" onClick={onBack}>Gate queue</Button></Actions>
      </>
    );
  }
  if (!slip) return null;

  const items = slip.items || [];
  const shortItems = items.filter((i) => {
    const there = i.packed_quantity ?? i.required_quantity;
    return Number(there) < Number(i.required_quantity);
  });
  const readyToCollect = slip.status === 'complete';

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const note = shortItems.length > 0
        ? `${shortItems.length} item(s) short at the gate: ${shortItems.map((i) => i.product_name).join(', ')}`
        : null;
      await dispatchAPI.recordCollection(palletId, { signatureData: signature, collectedBy: null, note });
      onCollected();
    } catch (err) {
      setError(err.message || 'Could not save this collection. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>Check the pallet</h1>
        <p className="stf-step-sub">{slip.ecd_name} · {slip.child_count} children</p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {!readyToCollect ? (
        <Notice tone="warn">
          {slip.status === 'collected'
            ? 'This pallet has already been collected.'
            : 'This pallet is not staged for collection yet.'}
        </Notice>
      ) : (
        <>
          <div className="stf-list">
            <div className="stf-row is-static">
              <span className="stf-row-main" style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .6fr', gap: 8 }}>
                <span className="stf-row-meta">ITEM</span>
                <span className="stf-row-meta">SLIP</span>
                <span className="stf-row-meta">THERE</span>
              </span>
            </div>
            {items.map((item) => {
              const there = item.packed_quantity ?? item.required_quantity;
              const short = Number(there) < Number(item.required_quantity);
              return (
                <div key={item.id} className={`stf-row is-static${short ? ' is-warn' : ''}`}>
                  <span className="stf-row-main" style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .6fr', gap: 8 }}>
                    <span className="stf-row-title">{item.product_name}</span>
                    <span className="stf-row-value">{item.required_quantity}</span>
                    <span className="stf-row-value">{there}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {shortItems.length > 0 ? (
            <Notice tone="warn">
              {shortItems.length} short. Ask for a correction before you hand over, or confirm as-is and it will
              be noted.
            </Notice>
          ) : null}

          <SignaturePad onChange={setSignature} />
          <p className="stf-field-hint">
            Once signed, this pallet is recorded as collected and the stock comes off the system.
          </p>

          <Actions>
            <Button disabled={!signature || submitting} onClick={handleConfirm}>
              {submitting ? 'Saving…' : 'Confirm collection'}
            </Button>
            <Button variant="secondary" onClick={onBack}>Gate queue</Button>
          </Actions>
        </>
      )}
    </section>
  );
}
