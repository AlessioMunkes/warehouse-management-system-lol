// ─────────────────────────────────────────────────────────────
// features/donation/WarningsNotice.jsx & CompletionDialog.jsx
//
// WarningsNotice: uses .stf-notice.is-warn — the framework you shared
// specifically says avoid modal interruptions for non-blocking info,
// so backend warnings[] (unmatched item, missing consent, etc.) show
// inline, not as a popup.
//
// CompletionDialog: the one deliberate exception — this IS a modal,
// because it's a real decision point (stay vs go home), not an error.
// ─────────────────────────────────────────────────────────────
import { fmtQty } from "@/lib/quantity";
import SuccessDialog from "../staff/SuccessDialog";
import { OFFLINE_TITLE, offlineLine } from "../staff/successText";

export function WarningsNotice({ warnings, onDismiss }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="stf-notice is-warn">
      <span className="stf-notice-mark">!</span>
      <div className="stf-notice-body">
        {warnings.map((w, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : "6px 0 0" }}>{w.message}</p>
        ))}
        <div className="stf-notice-actions">
          <button className="stf-btn stf-btn-secondary" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// result is the partitioned submit outcome built by ReviewPage:
//   { pendingDonationId, status, resolvedCount, awaitingCount, awaitingItems }
// awaitingItems non-empty -> "pending manager review" state; otherwise the
// donation auto-committed and we show plain success.
export function CompletionDialog({ open, result, onRecordAnother, onGoHome }) {
  if (!result) return null;

  const pendingReview = (result.awaitingCount || 0) > 0;

  // The same confirmation every other flow ends on (SuccessDialog). A
  // donation waiting on a manager is not finished, so it is not green.
  return (
    <SuccessDialog
      open={open}
      tone={result.queued ? 'offline' : pendingReview ? 'pending' : 'success'}
      title={result.queued
        ? OFFLINE_TITLE
        : pendingReview ? 'Donation received, pending manager review' : 'Donation recorded'}
      onClose={onRecordAnother}
      closeLabel="Record another"
      action={{ label: 'Go to home', onClick: onGoHome }}
    >
        {result.queued && (
          <p className="stf-step-sub">{offlineLine('Do not record it again.')}</p>
        )}

        {pendingReview && (
          <div className="stf-notice is-warn">
            <span className="stf-notice-mark">!</span>
            <div className="stf-notice-body">
              <p style={{ margin: 0 }}>
                {result.awaitingCount} item{result.awaitingCount === 1 ? "" : "s"} couldn't be
                matched automatically and need{result.awaitingCount === 1 ? "s" : ""} a manager
                to classify before this donation is finalised.
              </p>
              {result.awaitingItems?.map((it) => (
                <p key={it.id} style={{ margin: "6px 0 0" }}>
                  • {it.description || "Untitled item"}: {fmtQty(it.quantity, it.unit)}
                </p>
              ))}
              {/* The whole donation waits on a flagged item: nothing on
                  it reaches stock until a manager has dealt with it. So
                  this never says the rest "has been recorded", and it
                  only mentions other items when there are some. */}
              <p style={{ margin: "6px 0 0" }}>
                {(result.resolvedCount || 0) > 0
                  ? "The other items are saved, but nothing goes into stock until a manager has reviewed the flagged items."
                  : result.awaitingCount === 1
                    ? "Nothing is in stock yet. A manager will review this item."
                    : "Nothing is in stock yet. A manager will review these items."}
              </p>
            </div>
          </div>
        )}

        {!pendingReview && result.warnings?.length > 0 && (
          <div className="stf-notice is-warn">
            <span className="stf-notice-mark">!</span>
            <div className="stf-notice-body">
              {result.warnings.map((w, i) => (
                <p key={i} style={{ margin: i === 0 ? 0 : "6px 0 0" }}>{w.message}</p>
              ))}
            </div>
          </div>
        )}

    </SuccessDialog>
  );
}
