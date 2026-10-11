// ─────────────────────────────────────────────────────────────
// client/src/features/staff/SuccessDialog.jsx
//
// "That worked": the one way the floor is told a piece of work is done.
//
// Every flow used to say it differently. Receiving, decanting and the
// gate each had their own closing screen; packing went back to the list
// without a word; Feed the Soil said nothing at all; a benevolent
// request got a grey notice, the same box a warning arrives in; and
// donations had a dialog of their own. This is the one all of them use:
// a mark, what was done, one line about it, and what to do next.
//
//   title       what was done            "Delivery received"
//   children    one line, or more        "Stock updated."
//   tone        'success'   done and on the system (the default)
//               'offline'   saved on this phone, not sent yet
//               'pending'   done, but waiting on someone else
//   action      { label, onClick }       a second thing to do, e.g.
//                                        "View delivery note"
//   closeLabel  the main button          "Done"
//
// The tone is a mark AND the words, never colour alone (ACC-03). Only
// 'success' is green: something saved on the phone or waiting on a
// manager is not finished, and must not look as though it is.
// ─────────────────────────────────────────────────────────────
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const MARK = {
  success: { icon: 'ti-check',     className: '' },
  offline: { icon: 'ti-cloud-off', className: ' is-waiting' },
  pending: { icon: 'ti-clock',     className: ' is-waiting' },
};

export default function SuccessDialog({
  open, title, children, onClose, closeLabel = 'Done', action = null, tone = 'success',
}) {
  const mark = MARK[tone] ?? MARK.success;
  const plain = typeof children === 'string';
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="stf-shell" showCloseButton={false}>
        <DialogHeader>
          <div className={`stf-success-mark${mark.className}`} aria-hidden="true"><i className={`ti ${mark.icon}`} /></div>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {plain ? <p className="stf-step-sub">{children}</p> : children}
        <DialogFooter>
          {action ? (
            <button type="button" className="stf-btn stf-btn-secondary" onClick={action.onClick}>{action.label}</button>
          ) : null}
          <button type="button" className="stf-btn stf-btn-primary" onClick={onClose}>{closeLabel}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
