// ─────────────────────────────────────────────────────────────
// client/src/features/staff/SuccessDialog.jsx
//
// "That worked", as a pop-up with a tick.
//
// A confirmation used to be a grey notice with an (i) at the top of
// the form it came from. It is the same box a warning arrives in, so
// "Request logged" read as something having gone wrong, and it sat
// above a form that had already been cleared for the next entry.
//
// Used for the moment a piece of work is saved and the screen does not
// otherwise change. Screens that move on to their own "done" step
// (receiving, decanting, the gate) do not need it.
// ─────────────────────────────────────────────────────────────
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function SuccessDialog({ open, title, children, onClose, closeLabel = 'OK' }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="stf-shell" showCloseButton={false}>
        <DialogHeader>
          <div className="stf-success-mark" aria-hidden="true"><i className="ti ti-check" /></div>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children ? <p className="stf-step-sub">{children}</p> : null}
        <DialogFooter>
          <button type="button" className="stf-btn stf-btn-primary" onClick={onClose}>{closeLabel}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
