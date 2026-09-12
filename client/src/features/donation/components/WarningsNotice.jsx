// ─────────────────────────────────────────────────────────────
// features/donations/components/WarningsNotice.jsx & CompletionDialog.jsx
//
// WarningsNotice: uses .stf-notice.is-warn — the framework you shared
// specifically says avoid modal interruptions for non-blocking info,
// so backend warnings[] (unmatched item, missing consent, etc.) show
// inline, not as a popup.
//
// CompletionDialog: the one deliberate exception — this IS a modal,
// because it's a real decision point (stay vs go home), not an error.
// ─────────────────────────────────────────────────────────────
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

  return (
    <Dialog open={open}>
      <DialogContent className="stf-shell">
        <DialogHeader>
          <DialogTitle>
            {pendingReview ? "Donation received — pending manager review" : "Donation recorded"}
          </DialogTitle>
        </DialogHeader>

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
                  • {it.description || "Untitled item"} — {it.quantity} {it.unit}
                </p>
              ))}
              <p style={{ margin: "6px 0 0" }}>
                Everything else has been recorded. A manager will review the flagged items.
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

        <p className="stf-step-sub">
          Would you like to record another donation, or go to another task?
        </p>

        <DialogFooter>
          <button className="stf-btn stf-btn-secondary" onClick={onGoHome}>
            Go to Taskboard
          </button>
          <button className="stf-btn stf-btn-primary" onClick={onRecordAnother}>
            Record another
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
