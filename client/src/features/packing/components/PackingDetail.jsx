// PackingDetail.jsx
// Detail view for one picking slip: claim/ownership (Step 1),
// a confirmed/flagged/pending summary strip, and the per-item
// confirm-or-flag table (Step 2) with the completion footer.
// Edit rights (confirm/flag/complete) are gated by canEdit,
// computed once here and passed down, so the permission check
// lives in exactly one place.
/**
 * Packing feature — flow overview
 * ─────────────────────────────────────────────────────────────
 *
 * 1. BOARD  (/programmes/noc/packing)
 *    - On mount: GET /api/picking, filtered by dispatch date /
 *      cohort / status (+ "my pallets only" for non-managers).
 *    - Each slip renders as a .po-card: ECD name, cohort, child
 *      count, items packed, packer name or "Unclaimed".
 *    - Unassigned slip → "Claim pallet" button → POST /assign
 *      → list refetches, card now shows the packer's name.
 *    - Clicking anywhere else on the card → navigate to
 *      /programmes/noc/packing/:slipId.
 *
 * 2. DETAIL  (/programmes/noc/packing/:slipId)
 *    - On mount: GET /api/picking/:id.
 *
 *    Step 1 — ownership
 *      - Shows ECD info + status badge.
 *      - If unassigned: "Claim this pallet" → POST /assign.
 *      - If assigned: "Packing: {name}" (+ "(you)" if it's the
 *        current user).
 *
 *    Summary strip
 *      - Confirmed / flagged / pending counts, derived from the
 *        live items array (not the board's cached counts).
 *
 *    Step 2 — items
 *      - One row per item. A row gets an expandable
 *        .item-decision-panel only if:
 *          canEdit (manager OR the assigned packer)
 *          AND slip is not locked (status !== "complete")
 *          AND item.status === "pending"
 *      - "Pack this item" → reveals Confirm / Flag choice.
 *          Confirm → quantity input → POST /confirm
 *          Flag    → reason pill + detail + optional qty
 *                     → POST /flag
 *        Either path collapses the panel and refetches the slip.
 *
 *    Footer
 *      - "Complete pallet" enables once every item is confirmed
 *        or flagged (zero pending) → optional pallet ref →
 *        POST /complete.
 *      - On success: slip locks, badge becomes "Pallet complete",
 *        any shortfalls returned by the API surface as a
 *        discrepancy notice.
 *
 *    - "← Back to board" returns to the board view.
 *
 * PERMISSION GATE (applies throughout)
 *    - Only a manager or the slip's currently assigned packer
 *      ever sees edit controls (confirm/flag/complete).
 *    - Claiming is open to anyone while a slip is unassigned.
 *    - Once status === "complete", no edit UI renders for
 *      anyone, regardless of role — the decision panel does not
 *      mount at all.
 */
import { useState, useEffect } from "react";
import {
  fetchPickingSlip,
  assignSlip,
  confirmItem,
  flagItem,
  completeSlip,
} from "../../../services/pickingAPI";

const COHORT_LABELS = { week1: "Week 1", week2: "Week 2" };

const STATUS_BADGE = {
  pending: { className: "badge badge-pending", label: "Pending" },
  in_progress: { className: "status-badge status-badge-warning", label: "In progress" },
  complete: { className: "badge badge-complete", label: "Complete" },
  cancelled: { className: "badge badge-inactive", label: "Cancelled" },
};

const REASON_PILLS = ["Short quantity", "Damaged stock", "Substituted item", "Other"];

function isManager(user) {
  return user?.role === "manager" || user?.role === "admin";
}

function ItemDecisionPanel({ item, slipId, onUpdated }) {
  const [mode, setMode] = useState("idle");
  const [packedQuantity, setPackedQuantity] = useState(item.required_quantity);
  const [flagPackedQuantity, setFlagPackedQuantity] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [detailText, setDetailText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setMode("idle");
    setPackedQuantity(item.required_quantity);
    setFlagPackedQuantity("");
    setSelectedReason("");
    setDetailText("");
    setError(null);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await confirmItem(slipId, item.id, Number(packedQuantity));
      reset();
      onUpdated();
    } catch (err) {
      setError(err.message || "Could not confirm this item.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFlag = async () => {
    if (!selectedReason) {
      setError("Choose a reason before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const reason = detailText.trim()
        ? `${selectedReason} — ${detailText.trim()}`
        : selectedReason;
      await flagItem(
        slipId,
        item.id,
        reason,
        flagPackedQuantity === "" ? undefined : Number(flagPackedQuantity)
      );
      reset();
      onUpdated();
    } catch (err) {
      setError(err.message || "Could not flag this item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="item-decision-panel">
      {mode === "idle" && (
        <button type="button" className="btn-secondary" onClick={() => setMode("choosing")}>
          Pack this item
        </button>
      )}

      {mode === "choosing" && (
        <div className="decision-row">
          <div
            className="decision-card decision-card-accept"
            role="button"
            tabIndex={0}
            onClick={() => setMode("confirming")}
          >
            <span className="decision-card-icon">✓</span>
            <span className="decision-card-title">Confirm</span>
            <span className="decision-card-subtitle">Packed as required</span>
          </div>
          <div
            className="decision-card decision-card-return"
            role="button"
            tabIndex={0}
            onClick={() => setMode("flagging")}
          >
            <span className="decision-card-icon">⚠</span>
            <span className="decision-card-title">Flag</span>
            <span className="decision-card-subtitle">Short, damaged, or substituted</span>
          </div>
        </div>
      )}

      {mode === "confirming" && (
        <div className="form-group">
          <label className="form-label">Quantity packed</label>
          <div className="form-input-group">
            <input
              type="number"
              className="form-input"
              value={packedQuantity}
              onChange={(e) => setPackedQuantity(e.target.value)}
              min="0"
            />
            <span className="form-input-icon">{item.unit}</span>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="flex gap-3 mt-3">
            <button type="button" className="btn-secondary" onClick={reset} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirm} disabled={submitting}>
              {submitting ? "Confirming…" : "Confirm item"}
            </button>
          </div>
        </div>
      )}

      {mode === "flagging" && (
        <div className="reason-picker">
          <label className="form-label">Reason</label>
          <div className="reason-picker-options">
            {REASON_PILLS.map((reason) => (
              <button
                key={reason}
                type="button"
                className={`reason-pill ${selectedReason === reason ? "reason-pill-active" : ""}`}
                onClick={() => setSelectedReason(reason)}
              >
                {reason}
              </button>
            ))}
          </div>

          <textarea
            className="form-input reason-picker-textarea mt-3"
            placeholder="Add detail (optional)"
            maxLength={500}
            value={detailText}
            onChange={(e) => setDetailText(e.target.value)}
          />

          <div className="form-group mt-3">
            <label className="form-label">Qty actually packed (optional)</label>
            <div className="form-input-group">
              <input
                type="number"
                className="form-input"
                value={flagPackedQuantity}
                onChange={(e) => setFlagPackedQuantity(e.target.value)}
                min="0"
              />
              <span className="form-input-icon">{item.unit}</span>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="flex gap-3 mt-3">
            <button type="button" className="btn-secondary" onClick={reset} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleFlag} disabled={submitting}>
              {submitting ? "Flagging…" : "Flag item"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, slipId, canEdit, locked, onUpdated }) {
  const statusChip =
    item.status === "confirmed"
      ? { className: "note-status-chip is-ok", label: "Confirmed" }
      : item.status === "flagged"
      ? { className: "note-status-chip is-discrepancy", label: "Flagged" }
      : { className: "note-status-chip", label: "Pending" };

  const showPanel = canEdit && !locked && item.status === "pending";

  return (
    <>
      <div className={`note-line-row ${item.status === "flagged" ? "is-flagged" : ""}`}>
        <div>
          <div className="note-line-product">{item.product_name}</div>
          <div className="text-xs text-text-meta">{item.sku}</div>
        </div>
        <div className="note-line-qty">
          {item.required_quantity} {item.unit}
        </div>
        <div className={`note-line-qty-actual ${item.status === "flagged" ? "is-discrepancy" : ""}`}>
          {item.packed_quantity != null ? `${item.packed_quantity} ${item.unit}` : "—"}
        </div>
        <div className="text-sm text-text-sub">{item.flag_reason || "—"}</div>
        <div>
          <span className={statusChip.className}>{statusChip.label}</span>
        </div>
      </div>

      {showPanel && (
        <ItemDecisionPanel item={item} slipId={slipId} onUpdated={onUpdated} />
      )}
    </>
  );
}

export default function PackingDetail({ currentUser, slipId, onBack }) {
  const manager = isManager(currentUser);

  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState(false);

  const [palletRef, setPalletRef] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState(null);
  const [shortfallCount, setShortfallCount] = useState(0);

  // Bumped after any successful mutation (claim, confirm, flag,
  // complete) to trigger a refetch without calling a
  // setState-triggering function directly inside the effect body
  // (react-hooks/set-state-in-effect).
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSlip() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPickingSlip(slipId);
        if (!cancelled) setSlip(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load this picking slip.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSlip();

    return () => {
      cancelled = true;
    };
  }, [slipId, reloadToken]);

  const triggerReload = () => setReloadToken((t) => t + 1);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      await assignSlip(slipId);
      triggerReload();
    } catch (err) {
      setError(err.message || "Could not claim this pallet.");
    } finally {
      setClaiming(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      const result = await completeSlip(slipId, palletRef || undefined);
      setSlip(result.slip);
      setShortfallCount(result.shortfalls ? result.shortfalls.length : 0);
    } catch (err) {
      setCompleteError(err.message || "Could not complete this pallet.");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="decanting-content">
        <p className="text-sm text-text-sub">Loading picking slip…</p>
      </div>
    );
  }

  if (error && !slip) {
    return (
      <div className="decanting-content">
        <button type="button" className="btn-link mb-4" onClick={onBack}>
          ← Back to board
        </button>
        <div className="alert-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!slip) return null;

  const badge = STATUS_BADGE[slip.status] || STATUS_BADGE.pending;
  const locked = slip.status === "complete";
  const unassigned = !slip.assigned_to;
  const assignedToMe = slip.assigned_to === currentUser?.id;
  const canEdit = manager || assignedToMe;

  const confirmedCount = slip.items.filter((i) => i.status === "confirmed").length;
  const flaggedCount = slip.items.filter((i) => i.status === "flagged").length;
  const pendingCount = slip.items.filter((i) => i.status === "pending").length;

  return (
    <div className="decanting-content">
      <button type="button" className="btn-link mb-4" onClick={onBack}>
        ← Back to board
      </button>

      {error && (
        <div className="alert-error">
          <p>{error}</p>
        </div>
      )}

      <div className="step-card">
        <div className="step-card-header">
          <div className="step-card-number">1</div>
          <h2 className="step-card-title flex-1">{slip.ecd_name}</h2>
          <span className={badge.className}>{badge.label}</span>
        </div>

        <p className="text-sm text-text-sub mb-3">
          {COHORT_LABELS[slip.cohort] || slip.cohort} · {slip.child_count} children · Dispatch{" "}
          {slip.dispatch_date}
          {slip.contact_name ? ` · ${slip.contact_name}` : ""}
        </p>

        {unassigned && !locked && (
          <button type="button" className="btn-primary" onClick={handleClaim} disabled={claiming}>
            {claiming ? "Claiming…" : "Claim this pallet"}
          </button>
        )}

        {!unassigned && (
          <p className="text-maroon font-bold text-sm">
            Packing: {slip.packer_name}
            {assignedToMe ? " (you)" : ""}
          </p>
        )}
      </div>

      <div className="note-summary-row mb-5">
        <div className="note-summary-stat">
          <div className="note-summary-label">Confirmed</div>
          <div className="note-summary-value">{confirmedCount}</div>
        </div>
        <div className="note-summary-stat">
          <div className="note-summary-label">Flagged</div>
          <div className="note-summary-value">{flaggedCount}</div>
        </div>
        <div className="note-summary-stat">
          <div className="note-summary-label">Pending</div>
          <div className="note-summary-value">{pendingCount}</div>
        </div>
      </div>

      <div className="step-card">
        <div className="step-card-header">
          <div className="step-card-number">2</div>
          <h2 className="step-card-title">Confirm or flag each item</h2>
        </div>

        <div className="note-line-cols">
          <div>Product</div>
          <div className="note-line-col-center">Required</div>
          <div className="note-line-col-center">Packed</div>
          <div>Notes</div>
          <div>Status</div>
        </div>

        {slip.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            slipId={slip.id}
            canEdit={canEdit}
            locked={locked}
            onUpdated={triggerReload}
          />
        ))}

        {canEdit && (
          <div className="mt-4">
            {pendingCount > 0 && !locked && (
              <div className="info-notice mb-3">
                <p>
                  {pendingCount} item(s) still need to be confirmed or flagged before this
                  pallet can be closed.
                </p>
              </div>
            )}

            {shortfallCount > 0 && (
              <div className="discrepancy-notice mb-3">
                <p>
                  Stock shortfall recorded for {shortfallCount} item(s) — a manager will need
                  to reconcile this.
                </p>
              </div>
            )}

            {locked ? (
              <span className="badge badge-complete">
                Pallet complete{slip.pallet_ref ? ` · Ref ${slip.pallet_ref}` : ""}
              </span>
            ) : (
              <div className="decanting-save-row">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Pallet reference (optional)"
                  value={palletRef}
                  onChange={(e) => setPalletRef(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleComplete}
                  disabled={pendingCount > 0 || completing}
                >
                  {completing ? "Completing…" : "Complete pallet"}
                </button>
              </div>
            )}

            {completeError && <p className="form-error mt-2">{completeError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}