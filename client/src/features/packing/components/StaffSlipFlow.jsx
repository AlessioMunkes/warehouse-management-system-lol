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
  fetchPickingSlip, assignSlip, releaseSlip, confirmItem, flagItem, completeSlip,
} from '../../../services/pickingAPI';
import { fmtQty } from '../../../lib/quantity';
import { takeFirstText } from '../takeFirst';
import {
  Actions, Button, ChoiceList, Counter, Notice, TextField, ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import useCoachmark from '../../staff/hooks/useCoachmark';
import { volunteerHolder } from '../../pickingSlips/slipViews';
import PhotoButton from '../../staff/components/PhotoButton';
import { useT } from '../../../i18n';

const MODE_KEY = 'stf_packing_view_mode';
// label and hint are keys in i18n/messages.js.
const MODES = [
  { value: 'guided', label: 'slip.view.guided', hint: 'slip.view.guidedHint' },
  { value: 'full',   label: 'slip.view.form',   hint: 'slip.view.formHint' },
];
const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

const cohortLabel = (cohort, t) => (cohort === 'tuesday' || cohort === 'thursday' ? t(`day.${cohort}`) : cohort);

// Soup kitchens and test centres have no child count; say nothing rather
// than "· children" with the number missing.
const childCountNote = (count, t) => (count == null || count === '' ? '' : ` · ${t('common.children', { n: count })}`);
// `value` is what is saved and what the manager's screens and reports
// read, so it stays in English whatever language the packer reads.
const REASON_OPTIONS = [
  { value: 'Short quantity', label: 'slip.reason.short' },
  { value: 'Damaged stock', label: 'slip.reason.damaged' },
  { value: 'Substituted item', label: 'slip.reason.substituted' },
  { value: 'Other', label: 'slip.reason.other' },
];

// A saved flag reason is the English value; shown in the reader's language.
const reasonLabel = (value, t) => {
  const option = REASON_OPTIONS.find((o) => o.value === value);
  return option ? t(option.label) : value;
};

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
  // The paper slip's "Comment" column — on every line, not only a
  // flagged one, so it lives here rather than folded into reason.
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const t = useT();

  if (mode === 'idle') {
    return (
      <Actions row>
        <Button variant="step" onClick={() => setMode('confirm')}>{t('slip.confirm')}</Button>
        <Button variant="secondary" onClick={() => setMode('flag')}>{t('slip.flag')}</Button>
      </Actions>
    );
  }

  if (mode === 'confirm') {
    return (
      <div className="stf-field-body">
        <Counter label={item.product_name} value={qty} onChange={setQty} />
        <TextField
          id={`stf-note-confirm-${item.id}`}
          label={t('slip.comment')}
          hint={t('slip.commentHintConfirm')}
          value={note}
          onChange={setNote}
        />
        {error ? <Notice tone="warn">{error}</Notice> : null}
        <Actions row>
          <Button
            variant="step"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await confirmItem(slipId, item.id, qty, note);
                onDone();
              } catch (err) {
                setError(err.message || t('slip.confirmFailed'));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? t('common.saving') : t('common.save')}
          </Button>
          <Button variant="secondary" onClick={() => setMode('idle')}>{t('common.cancel')}</Button>
        </Actions>
      </div>
    );
  }

  return (
    <div className="stf-field-body">
      <ChoiceList
        legend={t('slip.whyFlagged')} value={reason} onChange={setReason}
        options={REASON_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
      />
      <Counter label={t('slip.qtyPacked')} value={flagQty === '' ? 0 : Number(flagQty)} onChange={(v) => setFlagQty(String(v))} />
      <p className="stf-field-hint">{t('slip.comesOffStock')}</p>
      {/* Optional, and saved the moment it is taken: see PhotoButton. */}
      <PhotoButton entityType="picking_slip_item" entityId={item.id} hint={t('photo.hintFlag')} />
      <TextField
        id={`stf-note-flag-${item.id}`}
        label={t('slip.comment')}
        hint={t('slip.commentHintFlag')}
        value={note}
        onChange={setNote}
      />
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <Actions row>
        <Button
          variant="step"
          disabled={!reason || submitting}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            try {
              await flagItem(slipId, item.id, reason, flagQty === '' ? undefined : Number(flagQty), note);
              onDone();
            } catch (err) {
              setError(err.message || t('slip.flagFailed'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? t('common.saving') : t('slip.flagItem')}
        </Button>
        <Button variant="secondary" onClick={() => setMode('idle')}>{t('common.cancel')}</Button>
      </Actions>
    </div>
  );
}

export default function StaffSlipFlow({ currentUser, slipId, onBack, onFinished }) {
  const manager = isManager(currentUser);
  const t = useT();

  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [releasing, setReleasing] = useState(false);
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
      .catch((err) => { if (!cancelled) setError(err.message || t('slip.loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slipId, reloadToken]);

  const reload = () => setReloadToken((t) => t + 1);

  // Lifted above the loading/error/no-slip returns below, and reading
  // slip?.items rather than the slip.items used once it's guaranteed
  // non-null — this hook used to sit after those early returns, so it
  // was skipped on every render before the slip finished loading and
  // then called for the first time the moment it did: one more hook
  // than the previous render saw, which is a Rules-of-Hooks violation
  // React treats as fatal ("Rendered more hooks than during the
  // previous render"), crashing this component on every pallet that
  // wasn't already cached. Guided renders exactly one pending item,
  // same as WorkList — so it always needs a focused one. The caller
  // sets it on entering Guided (handleModeChange) or after a decision
  // (advanceGuidedFocus); this is the safety net for a list that
  // arrives after that, the same reason WorkList has its own.
  const pendingItems = (slip?.items ?? []).filter((i) => i.status === 'pending');
  const guidedIndex = pendingItems.findIndex((i) => i.id === focusId);
  useEffect(() => {
    if (mode === 'guided' && pendingItems.length > 0 && guidedIndex < 0) {
      setFocusId(pendingItems[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pendingItems.length, guidedIndex]);

  if (loading) return <div className="stf-skeleton" aria-label={t('common.loading')} />;

  if (error && !slip) {
    return (
      <>
        <Notice tone="warn">{error}</Notice>
        <Actions>
          <Button variant="secondary" onClick={onBack}>{t('slip.yourPallets')}</Button>
        </Actions>
      </>
    );
  }
  if (!slip) return null;

  const locked = slip.status === 'complete' || slip.status === 'collected';
  // A pallet a guest volunteer is packing is taken, though assigned_to is empty.
  const volunteerLabel = volunteerHolder(slip);
  const unassigned = !slip.assigned_to && !volunteerLabel;
  // Either packer on a dual-assigned pallet may work it — matches
  // picking.repository.js's own ownership check, which the server
  // already enforces either way; this only keeps the client's own
  // gate from blocking someone the server would let through.
  const assignedToMe = slip.assigned_to === currentUser?.id || slip.assigned_to_2 === currentUser?.id;
  const canEdit = manager || assignedToMe;
  const items = slip.items || [];
  const confirmed = items.filter((i) => i.status === 'confirmed').length;
  const flagged = items.filter((i) => i.status === 'flagged').length;
  const pending = pendingItems.length;
  // A claim can be given back until the first item is confirmed or
  // flagged. After that the pallet has food on it and only a manager
  // releases it (the server refuses anyone else).
  const canRelease = slip.assigned_to === currentUser?.id && !locked && confirmed + flagged === 0;

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
      setError(err.message || t('packing.claimFailed'));
    } finally {
      setClaiming(false);
    }
  };

  const handleRelease = async () => {
    setReleasing(true);
    setError(null);
    try {
      await releaseSlip(slipId);
      onBack?.();
    } catch (err) {
      setError(err.message || t('slip.releaseFailed'));
      // Someone may have changed the pallet since it was loaded.
      reload();
    } finally {
      setReleasing(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      await completeSlip(slipId, palletRef || undefined);
      onFinished?.();
    } catch (err) {
      setCompleteError(err.message || t('slip.logFailed'));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        {/* Same .stf-card-toggle treatment StepScreen/TaskPage give the
            toggle now — this flow hand-rolls its own card instead of
            using StepScreen, so the same markup goes here directly. */}
        {canEdit && !locked && items.length > 0 ? (
          <div className="stf-card-toggle">
            <ViewToggle options={MODES.map((m) => ({ value: m.value, label: t(m.label), hint: t(m.hint) }))} value={mode} onChange={handleModeChange} />
            <Coachmark show={showCoachmark} onDismiss={dismissCoachmark}>
              {t('slip.switchView')}
            </Coachmark>
          </div>
        ) : null}
        <h1 className="stf-step-title" tabIndex={-1}>{slip.ecd_name}</h1>
        <p className="stf-step-sub">
          {cohortLabel(slip.cohort, t)}{childCountNote(slip.child_count, t)} · {t('slip.oldestFirst')}
        </p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {unassigned && !locked ? (
        <Actions>
          <Button disabled={claiming} onClick={handleClaim} loading={claiming}>
            {claiming ? t('packing.claiming') : t('slip.claimThis')}
          </Button>
        </Actions>
      ) : (
        <p className="stf-kv">
          <span>
            <span className="stf-kv-key">{t('slip.packing')}</span>{' '}
            <span className="stf-kv-val">
              {slip.packer_name ? slip.packer_name : volunteerLabel}
              {slip.assigned_to_2 ? `, ${slip.packer_name_2}` : ''}
            </span>
          </span>
        </p>
      )}

      {canRelease ? (
        <Actions>
          <Button variant="secondary" disabled={releasing} onClick={handleRelease}>
            {releasing ? t('slip.releasing') : t('slip.releaseThis')}
          </Button>
        </Actions>
      ) : null}

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
        <Notice>{t('slip.noItems')}</Notice>
      ) : (
        <>
          <div className="stf-list">
            {shownItems.map((item) => {
              const variance = hasQuantityVariance(item);
              const showPanel = canEdit && !locked && item.status === 'pending';
              const badge =
                item.status === 'confirmed' && variance ? { className: 'stf-badge is-warn', label: t('slip.badge.differs') } :
                item.status === 'confirmed' ? { className: 'stf-badge is-done', label: t('slip.badge.confirmed') } :
                item.status === 'flagged'   ? { className: 'stf-badge is-warn', label: t('slip.badge.flagged') } :
                { className: 'stf-badge', label: t('slip.badge.pending') };

              return (
                <div key={item.id} className="stf-row is-static stf-row--check">
                  {/* .stf-row--check already exists for exactly this
                      shape (see DonationItemsList.jsx) — a row that
                      stacks extra content below its main line instead
                      of squeezing it onto one line.
                      .stf-row-main is used exactly like this everywhere
                      else it appears (StaffSlipList.jsx, ReviewSummary.jsx,
                      FeedTheSoilFlow.jsx, CommunityRequestFlow.jsx): a
                      sibling of the badge, not its parent — that's what
                      gives title/meta their own column stack (its own
                      CSS already does flex-direction: column) instead of
                      the badge's row-level justify-content fighting it
                      from one level too high. .stf-row-head restates
                      .stf-row's own default row layout on an inner
                      wrapper, since the outer .stf-row here is now in
                      .stf-row--check's column mode to make room for the
                      Confirm/Flag panel below. */}
                  <span className="stf-row-head">
                    <span className="stf-row-main">
                      {guidedActive ? (
                        <span className="stf-wl-pos">{t('slip.itemOf', { n: activeGuidedIndex + 1, all: pendingItems.length })}</span>
                      ) : null}
                      <span className="stf-row-title">{item.product_name}</span>
                      <span className="stf-row-meta">
                        {t('slip.required', { qty: fmtQty(item.required_quantity, item.unit) })}
                        {item.packed_quantity != null ? ` · ${t('slip.packed', { qty: fmtQty(item.packed_quantity, item.unit) })}` : ''}
                        {item.flag_reason ? ` · ${reasonLabel(item.flag_reason, t)}` : ''}
                        {item.packer_note ? ` · ${item.packer_note}` : ''}
                      </span>
                      {/* FEFO: only while the line is still to pack — once
                          it is packed the date has done its job. */}
                      {item.status === 'pending' && takeFirstText(item) ? (
                        <span className="stf-row-meta stf-use-first">{takeFirstText(item)}.</span>
                      ) : null}
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
            <nav className="stf-wl-steps" aria-label={t('slip.moveBetween')}>
              <button
                type="button"
                className="stf-wl-step-btn"
                onClick={() => goToPending(activeGuidedIndex - 1)}
                disabled={activeGuidedIndex <= 0}
              >
                {t('slip.previous')}
              </button>
              <span className="stf-wl-steps-count">{activeGuidedIndex + 1} / {pendingItems.length}</span>
              <button
                type="button"
                className="stf-wl-step-btn"
                onClick={() => goToPending(activeGuidedIndex + 1)}
                disabled={activeGuidedIndex >= pendingItems.length - 1}
              >
                {t('slip.next')}
              </button>
            </nav>
          ) : null}
        </>
      )}

      {canEdit && !locked && items.length > 0 ? (
        <>
          {pending > 0 ? (
            <Notice>{t.n('slip.stillNeeded', pending)}</Notice>
          ) : null}
          {completeError ? <Notice tone="warn">{completeError}</Notice> : null}
          <div className="stf-field">
            <label className="stf-field-label" htmlFor="stf-pallet-ref">{t('slip.palletRef')}</label>
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
              {completing ? t('slip.logging') : t('slip.logPacked')}
            </Button>
          </Actions>
        </>
      ) : null}

      {locked ? (
        <Notice>
          {slip.status === 'collected' ? t('slip.palletCollected') : t('slip.palletPacked')}{slip.pallet_ref ? ` · ${t('slip.ref', { ref: slip.pallet_ref })}` : ''}.
        </Notice>
      ) : null}

      {/* Packed with no signal: what shows above is the phone's own
          record of it, not yet the server's (pickingAPI.withQueuedPacking). */}
      {slip.waitingToSend ? (
        <Notice>
          {t('slip.savedOnPhone')}
        </Notice>
      ) : null}
    </section>
  );
}
