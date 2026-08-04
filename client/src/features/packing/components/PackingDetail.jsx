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
 * 1. BOARD  (/noc/packing)
 *    - On mount: GET /api/picking, filtered by dispatch date /
 *      cohort / status (+ "my pallets only" for non-managers).
 *    - Each slip renders as a .po-card: ECD name, cohort, child
 *      count, items packed, packer name or "Unclaimed", plus
 *      flagged / quantity-variance chips and a collection warning
 *      for centres that have missed their turn.
 *    - Unassigned slip → "Claim pallet" button → POST /assign
 *      → list refetches, card now shows the packer's name.
 *    - Clicking (or pressing Enter/Space on) the card → navigate
 *      to /noc/packing/:slipId.
 *
 * 2. DETAIL  (/noc/packing/:slipId)
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
 *      - A confirmed line whose quantity does not match the slip
 *        is marked "Qty differs", not shown as a clean confirm.
 *
 *    Footer
 *      - "Complete pallet" enables once every item is confirmed
 *        or flagged (zero pending) → optional pallet ref →
 *        POST /complete.
 *      - On success the slip is REFETCHED rather than replaced
 *        from the response: /complete returns the slip row on its
 *        own, with no items array, so assigning it to state
 *        directly would blank the view. Any shortfalls or unit
 *        mismatches the API reports are kept and surfaced as a
 *        discrepancy notice.
 *
 *    - "← Back to board" returns to the board view.
 *
 * PERMISSION GATE (applies throughout)
 *    - Only a manager or the slip's currently assigned packer
 *      ever sees edit controls (confirm/flag/complete), and the
 *      server enforces the same rule on all three writes.
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

// A confirmed line whose packed quantity isn't the quantity the slip
// asked for. Legitimate — the packer is looking at the actual pallet —
// but it must not read as a clean confirm, because dispatch checks
// quantities at the gate and needs to know where to look.
function hasQuantityVariance(item) {
  if (item.status !== "confirmed") return false;
  if (item.packed_quantity == null) return false;
  return Number(item.packed_quantity) !== Number(item.required_quantity);
}

// Shared Enter/Space handling for the div-based decision cards.
// They carry role="button", so they have to behave like buttons for
// keyboard and switch users (warehouse visit §1.3, WCAG 2.1 AA).
function activateOnKey(handler) {
  return (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
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

  const differsFromRequired =
    packedQuantity !== "" && Number(packedQuantity) !== Number(item.required_quantity);

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
            onKeyDown={activateOnKey(() => setMode("confirming"))}
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
            onKeyDown={activateOnKey(() => setMode("flagging"))}
          >
            <span className="decision-card-icon">⚠</span>
            <span className="decision-card-title">Flag</span>
            <span className="decision-card-subtitle">Short, damaged, or substituted</span>
          </div>
        </div>
      )}

      {mode === "confirming" && (
        <div className="form-group">
          <label className="form-label" htmlFor={`qty-${item.id}`}>Quantity packed</label>
          <div className="form-input-group">
            <input
              id={`qty-${item.id}`}
              type="number"
              className="form-input"
              value={packedQuantity}
              onChange={(e) => setPackedQuantity(e.target.value)}
              min="0"
            />
            <span className="form-input-icon">{item.unit}</span>
          </div>

          {/* Say it before the write, not after. The slip asked for a
              specific quantity; if the packer is about to record a
              different one, that is either a real variance worth
              recording or a typo worth catching here. */}
          {differsFromRequired && (
            <div className="info-notice mt-3">
              <p>
                The slip asks for {item.required_quantity} {item.unit}. Confirming a
                different quantity marks this line for dispatch to check. Use Flag
                instead if the item is short or damaged.
              </p>
            </div>
          )}

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
                aria-pressed={selectedReason === reason}
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
            <label className="form-label" htmlFor={`flag-qty-${item.id}`}>
              Qty actually packed (optional)
            </label>
            <div className="form-input-group">
              <input
                id={`flag-qty-${item.id}`}
                type="number"
                className="form-input"
                value={flagPackedQuantity}
                onChange={(e) => setFlagPackedQuantity(e.target.value)}
                min="0"
              />
              <span className="form-input-icon">{item.unit}</span>
            </div>
            {/* Worth saying plainly: this number moves stock. A flagged
                line with a quantity is deducted when the pallet closes;
                leave it blank only if you genuinely don't know. */}
            <p className="text-xs text-text-meta mt-1">
              Whatever you enter here comes off stock when the pallet is closed.
              Leave it blank if you don't know how much went out.
            </p>
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
  const variance = hasQuantityVariance(item);

  const statusChip =
    item.status === "confirmed" && variance
      ? { className: "note-status-chip is-discrepancy", label: "Qty differs" }
      : item.status === "confirmed"
      ? { className: "note-status-chip is-ok", label: "Confirmed" }
      : item.status === "flagged"
      ? { className: "note-status-chip is-discrepancy", label: "Flagged" }
      : { className: "note-status-chip", label: "Pending" };

  const showPanel = canEdit && !locked && item.status === "pending";
  const discrepancy = item.status === "flagged" || variance;

  return (
    <>
      <div className={`note-line-row ${discrepancy ? "is-flagged" : ""}`}>
        <div>
          <div className="note-line-product">{item.product_name}</div>
          <div className="text-xs text-text-meta">{item.sku}</div>
        </div>
        <div className="note-line-qty">
          {item.required_quantity} {item.unit}
        </div>
        <div className={`note-line-qty-actual ${discrepancy ? "is-discrepancy" : ""}`}>
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
  const [shortfalls, setShortfalls] = useState([]);
  const [unitMismatches, setUnitMismatches] = useState([]);

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

      // Keep the warnings, then refetch. /complete returns
      // { slip, shortfalls?, unitMismatches? } where `slip` is the
      // bare picking_slips row — no items, no ECD name. Putting that
      // straight into state used to blank the whole screen; refetching
      // gives us the full slip back with its lines intact.
      setShortfalls(result.shortfalls || []);
      setUnitMismatches(result.unitMismatches || []);
      triggerReload();
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

  const items = slip.items || [];
  const confirmedCount = items.filter((i) => i.status === "confirmed").length;
  const flaggedCount = items.filter((i) => i.status === "flagged").length;
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const varianceCount = items.filter(hasQuantityVariance).length;

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

        {/* Warehouse visit §3.6 — the slip itself has to show whether
            this centre has been collecting, not just the dashboard. */}
        <p className="text-xs text-text-meta mb-3">
          {slip.last_collected_date
            ? `Last collected ${slip.last_collected_date}`
            : "No collection recorded for this centre yet"}
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
          <div className="note-summary-label">Qty differs</div>
          <div className="note-summary-value">{varianceCount}</div>
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

        {items.length === 0 && (
          <div className="info-notice">
            <p>
              This slip has no items. The centre has no dispatch quantities set up, so
              nothing will be packed or deducted from stock. Ask a manager to add its
              order lines before this pallet goes out.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="note-line-cols">
            <div>Product</div>
            <div className="note-line-col-center">Required</div>
            <div className="note-line-col-center">Packed</div>
            <div>Notes</div>
            <div>Status</div>
          </div>
        )}

        {items.map((item) => (
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

            {shortfalls.length > 0 && (
              <div className="discrepancy-notice mb-3">
                <p>
                  {shortfalls.length} item(s) were packed beyond the stock the system has
                  on record. The pallet is closed and the food is going out — a manager
                  needs to reconcile the count on the stock screen.
                </p>
              </div>
            )}

            {unitMismatches.length > 0 && (
              <div className="discrepancy-notice mb-3">
                <p>
                  {unitMismatches.length} item(s) were packed in a different unit to the
                  one on the stock record. The deduction used the stock record's unit —
                  check which one is right before the next count.
                </p>
              </div>
            )}

            {locked ? (
              <span className="badge badge-complete">
                Pallet complete{slip.pallet_ref ? ` · Ref ${slip.pallet_ref}` : ""}
              </span>
            ) : (
              <div className="decanting-save-row">
                <label className="sr-only" htmlFor="palletRef">Pallet reference</label>
                <input
                  id="palletRef"
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