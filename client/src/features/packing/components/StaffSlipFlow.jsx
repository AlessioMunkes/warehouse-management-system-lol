// ─────────────────────────────────────────────────────────────
// client/src/features/packing/components/StaffSlipFlow.jsx
//
// One pallet, phone-first: claim it if it's spare, tick or flag each
// item, then log it packed. Unlike Receiving and Decanting this is
// deliberately ONE screen with a checklist rather than one screen per
// item — the wireframe's packing mock is a list with a progress bar,
// not a wizard, because a packer needs to see the whole pallet while
// standing in front of it. That is Form mode, unchanged. Guided is new
// here — see the MODES/readStoredMode block below, same convention
// Receiving, Decanting and Dispatch already use: one pending item on
// screen at a time, Previous/Next between them, everything else (done
// or still pending) off screen until it is the one being decided. The
// progress bar above the list is what says how much is left either
// way, same as WorkList's own Guided mode leans on it rather than
// showing dimmed rows for the rest of the job.
//
// Wraps the same confirmItem / flagItem / completeSlip endpoints the
// manager's PackingDetail.jsx already uses — no new backend here, only
// a phone-shaped read of it. Batch numbers and use-by dates are NOT
// shown: picking_slip_items carries product/quantity/status only, no
// batch reference yet, so "oldest first" stays an instruction in the
// sub-text rather than a fabricated batch code on screen.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  fetchPickingSlip, assignSlip, confirmItem, flagItem, completeSlip,
} from '../../../services/pickingAPI';
import {
  Actions, Button, ChoiceList, Counter, Notice, ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import useCoachmark from '../../staff/hooks/useCoachmark';

const MODE_KEY = 'stf_packing_view_mode';
const MODES = [
  { value: 'guided', label: 'Guided', hint: 'One item at a time' },
  { value: 'full',   label: 'Form',   hint: 'Every item at once' },
];
const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

const COHORT_LABELS = { week1: 'Week 1', week2: 'Week 2' };
const REASON_OPTIONS = [
  { value: 'Short quantity', label: 'Short quantity' },
  { value: 'Damaged stock', label: 'Damaged stock' },
  { value: 'Substituted item', label: 'Substituted item' },
  { value: 'Other', label: 'Other' },
];

function isManager(user) {
  return user?.role === 'manager' || user?.role === 'admin';
}

function hasQuantityVariance(item) {
  if (item.status !== 'confirmed' || item.packed_quantity == null) return false;
  return Number(item.packed_quantity) !== Number(item.required_quantity);
}

function ItemDecisionPanel({ item, slipId, onDone }) {
  const [mode, setMode] = useState('idle');
  const [qty, setQty] = useState(Number(item.required_quantity) || 0);
  const [flagQty, setFlagQty] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (mode === 'idle') {
    return (
      <Actions row>
        <Button onClick={() => setMode('confirm')}>Confirm</Button>
        <Button variant="secondary" onClick={() => setMode('flag')}>Flag</Button>
      </Actions>
    );
  }

  if (mode === 'confirm') {
    return (
      <div className="stf-field-body">
        <Counter label={item.product_name} value={qty} onChange={setQty} />
        {error ? <Notice tone="warn">{error}</Notice> : null}
        <Actions row>
          <Button
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await confirmItem(slipId, item.id, qty);
                onDone();
              } catch (err) {
                setError(err.message || 'Could not confirm this item.');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? 'Saving' : 'Save'}
          </Button>
          <Button variant="secondary" onClick={() => setMode('idle')}>Cancel</Button>
        </Actions>
      </div>
    );
  }

  return (
    <div className="stf-field-body">
      <ChoiceList legend="Why is this flagged?" options={REASON_OPTIONS} value={reason} onChange={setReason} />
      <Counter label="Qty actually packed" value={flagQty === '' ? 0 : Number(flagQty)} onChange={(v) => setFlagQty(String(v))} />
      <p className="stf-field-hint">Whatever you set here comes off stock when the pallet is closed.</p>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <Actions row>
        <Button
          disabled={!reason || submitting}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            try {
              await flagItem(slipId, item.id, reason, flagQty === '' ? undefined : Number(flagQty));
              onDone();
            } catch (err) {
              setError(err.message || 'Could not flag this item.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? 'Saving' : 'Flag item'}
        </Button>
        <Button variant="secondary" onClick={() => setMode('idle')}>Cancel</Button>
      </Actions>
    </div>
  );
}

export default function StaffSlipFlow({ currentUser, slipId, onBack, onFinished }) {
  const manager = isManager(currentUser);

  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [palletRef, setPalletRef] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [mode, setMode] = useState(readStoredMode);
  const [focusId, setFocusId] = useState(null);
  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('packing-view-toggle');

  useEffect(() => {
    let cancelled = false;
    fetchPickingSlip(slipId)
      .then((data) => { if (!cancelled) { setSlip(data); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load this pallet.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slipId, reloadToken]);

  const reload = () => setReloadToken((t) => t + 1);

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  if (error && !slip) {
    return (
      <>
        <Notice tone="warn">{error}</Notice>
        <Actions>
          <Button variant="secondary" onClick={onBack}>Your pallets</Button>
        </Actions>
      </>
    );
  }
  if (!slip) return null;

  const locked = slip.status === 'complete' || slip.status === 'collected';
  const unassigned = !slip.assigned_to;
  // Either packer on a dual-assigned pallet may work it — matches
  // picking.repository.js's own ownership check, which the server
  // already enforces either way; this only keeps the client's own
  // gate from blocking someone the server would let through.
  const assignedToMe = slip.assigned_to === currentUser?.id || slip.assigned_to_2 === currentUser?.id;
  const canEdit = manager || assignedToMe;
  const items = slip.items || [];
  const confirmed = items.filter((i) => i.status === 'confirmed').length;
  const flagged = items.filter((i) => i.status === 'flagged').length;
  const pendingItems = items.filter((i) => i.status === 'pending');
  const pending = pendingItems.length;

  // Guided renders exactly one pending item, same as WorkList — so it
  // always needs a focused one. The caller sets it on entering Guided
  // (handleModeChange) or after a decision (advanceGuidedFocus); this
  // is the safety net for a list that arrives after that, the same
  // reason WorkList has its own.
  const guidedIndex = pendingItems.findIndex((i) => i.id === focusId);
  useEffect(() => {
    if (mode === 'guided' && pendingItems.length > 0 && guidedIndex < 0) {
      setFocusId(pendingItems[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pendingItems.length, guidedIndex]);

  const handleModeChange = (next) => {
    setMode(next);
    setFocusId(next === 'guided' ? (pendingItems[0]?.id ?? null) : null);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* nothing we can do */ }
    dismissCoachmark();
  };

  const goToPending = (i) => { if (pendingItems[i]) setFocusId(pendingItems[i].id); };

  // Guided shows exactly the one focused pending item and nothing
  // else — not even already-decided ones — same as WorkList: the
  // progress bar above already says how much of the pallet is done.
  // Gated on the toggle actually being live: a locked/read-only view
  // (a completed pallet pulled up for the record, someone else's slip
  // with nothing left pending) has no focus to show and no action to
  // take, so it always shows the full list regardless of the stored
  // mode — otherwise a finished pallet with zero pending items would
  // render an empty one.
  const guidedActive = canEdit && !locked && items.length > 0 && mode === 'guided';
  const activeGuidedIndex = guidedIndex >= 0 ? guidedIndex : 0;
  const shownItems = guidedActive
    ? (pendingItems[activeGuidedIndex] ? [pendingItems[activeGuidedIndex]] : [])
    : items;

  // Confirming or flagging the focused item IS "done with this one" in
  // Guided — the same gesture WorkList's confirm tick uses to move on,
  // computed against the pre-reload pendingItems since the item being
  // decided is still in it at this point.
  const advanceGuidedFocus = (decidedItemId) => {
    if (mode !== 'guided') return;
    const idx = pendingItems.findIndex((i) => i.id === decidedItemId);
    const next = pendingItems[idx + 1] ?? pendingItems.find((i) => i.id !== decidedItemId);
    setFocusId(next ? next.id : null);
  };

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      await assignSlip(slipId);
      reload();
    } catch (err) {
      setError(err.message || 'Could not claim this pallet.');
    } finally {
      setClaiming(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      await completeSlip(slipId, palletRef || undefined);
      onFinished?.();
    } catch (err) {
      setCompleteError(err.message || 'Could not log this pallet as packed.');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>{slip.ecd_name}</h1>
        <p className="stf-step-sub">
          {COHORT_LABELS[slip.cohort] || slip.cohort} · {slip.child_count} children · Take the oldest batch first.
        </p>
      </div>

      {canEdit && !locked && items.length > 0 ? (
        <div className="stf-toggle-anchor">
          <ViewToggle options={MODES} value={mode} onChange={handleModeChange} />
          <Coachmark show={showCoachmark} onDismiss={dismissCoachmark}>
            Tap here to switch view
          </Coachmark>
        </div>
      ) : null}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {unassigned && !locked ? (
        <Actions>
          <Button disabled={claiming} onClick={handleClaim}>
            {claiming ? 'Claiming…' : 'Claim this pallet'}
          </Button>
        </Actions>
      ) : (
        <p className="stf-kv">
          <span>
            <span className="stf-kv-key">Packing:</span>{' '}
            <span className="stf-kv-val">
              {slip.packer_name}{slip.assigned_to === currentUser?.id ? ' (you)' : ''}
              {slip.assigned_to_2 ? `, ${slip.packer_name_2}${slip.assigned_to_2 === currentUser?.id ? ' (you)' : ''}` : ''}
            </span>
          </span>
        </p>
      )}

      <div className="stf-progress">
        <div className="stf-progress-track">
          <div
            className="stf-progress-fill"
            style={{ width: items.length ? `${((confirmed + flagged) / items.length) * 100}%` : '0%' }}
          />
        </div>
        <span className="stf-progress-count">{confirmed + flagged} / {items.length}</span>
      </div>

      {items.length === 0 ? (
        <Notice>This slip has no items. Ask a manager to add order lines before this pallet goes out.</Notice>
      ) : (
        <>
          <div className="stf-list">
            {shownItems.map((item) => {
              const variance = hasQuantityVariance(item);
              const showPanel = canEdit && !locked && item.status === 'pending';
              const badge =
                item.status === 'confirmed' && variance ? { className: 'stf-badge is-warn', label: 'Qty differs' } :
                item.status === 'confirmed' ? { className: 'stf-badge is-done', label: 'Confirmed' } :
                item.status === 'flagged'   ? { className: 'stf-badge is-warn', label: 'Flagged' } :
                { className: 'stf-badge', label: 'Pending' };

              return (
                <div key={item.id} className="stf-row is-static" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                  <span className="stf-row-main" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      {guidedActive ? (
                        <span className="stf-wl-pos">Item {activeGuidedIndex + 1} of {pendingItems.length}</span>
                      ) : null}
                      <span className="stf-row-title">{item.product_name}</span>
                      <span className="stf-row-meta">
                        Required {item.required_quantity} {item.unit}
                        {item.packed_quantity != null ? ` · Packed ${item.packed_quantity} ${item.unit}` : ''}
                        {item.flag_reason ? ` · ${item.flag_reason}` : ''}
                      </span>
                    </span>
                    <span className={badge.className}>{badge.label}</span>
                  </span>
                  {showPanel ? (
                    <ItemDecisionPanel
                      item={item}
                      slipId={slip.id}
                      onDone={() => { advanceGuidedFocus(item.id); reload(); }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          {guidedActive && pendingItems.length > 1 ? (
            <nav className="stf-wl-steps" aria-label="Move between items">
              <button
                type="button"
                className="stf-wl-step-btn"
                onClick={() => goToPending(activeGuidedIndex - 1)}
                disabled={activeGuidedIndex <= 0}
              >
                Previous item
              </button>
              <span className="stf-wl-steps-count">{activeGuidedIndex + 1} / {pendingItems.length}</span>
              <button
                type="button"
                className="stf-wl-step-btn"
                onClick={() => goToPending(activeGuidedIndex + 1)}
                disabled={activeGuidedIndex >= pendingItems.length - 1}
              >
                Next item
              </button>
            </nav>
          ) : null}
        </>
      )}

      {canEdit && !locked && items.length > 0 ? (
        <>
          {pending > 0 ? (
            <Notice>{pending} item{pending > 1 ? 's' : ''} still need to be confirmed or flagged.</Notice>
          ) : null}
          {completeError ? <Notice tone="warn">{completeError}</Notice> : null}
          <div className="stf-field">
            <label className="stf-field-label" htmlFor="stf-pallet-ref">Pallet reference (optional)</label>
            <input
              id="stf-pallet-ref"
              className="stf-input is-text"
              type="text"
              value={palletRef}
              onChange={(e) => setPalletRef(e.target.value)}
            />
          </div>
          <Actions>
            <Button disabled={pending > 0 || completing} onClick={handleComplete}>
              {completing ? 'Logging…' : 'Log pallet packed'}
            </Button>
          </Actions>
        </>
      ) : null}

      {locked ? (
        <Notice>
          Pallet {slip.status === 'collected' ? 'collected' : 'packed'}{slip.pallet_ref ? ` · Ref ${slip.pallet_ref}` : ''}.
        </Notice>
      ) : null}
    </section>
  );
}
