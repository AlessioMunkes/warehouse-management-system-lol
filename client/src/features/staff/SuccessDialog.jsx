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
// a picture of the job, what was done, what it added up to, and what to
// do next.
//
//   title       what was done            "Delivery received"
//   children    one line, or more        "Stock updated."
//   tone        'success'   done and on the system (the default)
//               'offline'   saved on this phone, not sent yet
//               'pending'   done, but waiting on someone else
//   picture     a Tabler icon for the job ('ti-truck-delivery'). The
//               tick sits on it as a badge. Without one, just the tick.
//   facts       [{ value, label, warn? }]  up to three numbers about
//               the job: "12 lines counted", "2 short". warn marks one
//               that needs a second look, with words as well as colour.
//   action      { label, onClick }       a second thing to do, e.g.
//                                        "View delivery note"
//   closeLabel  the main button          "Done"
//
// Asked for by the floor: "more interactive, with some imagery, and says
// more than just done". So a finished job gets the picture with a small
// burst around it, the numbers, and a thank you by name.
//
// The tone is a mark AND the words, never colour alone (ACC-03). Only
// 'success' is green and only 'success' celebrates: something saved on
// the phone or waiting on a manager is not finished, and must not look
// as though it is. The burst is decoration only (aria-hidden) and is
// switched off under prefers-reduced-motion in index.css.
// ─────────────────────────────────────────────────────────────
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '../../context/AuthContext';

const MARK = {
  success: { icon: 'ti-check',     className: '' },
  offline: { icon: 'ti-cloud-off', className: ' is-waiting' },
  pending: { icon: 'ti-clock',     className: ' is-waiting' },
};

// Eight pieces, placed round the picture by index in index.css.
const BURST = Array.from({ length: 8 }, (_, i) => i);

// The signed-in worker's first name, or nothing. useAuth throws outside
// an AuthProvider (a bare test render); there is just nobody to thank.
// Still one useContext call on every render, so the hook order holds.
const useFirstName = () => {
  try {
    return useAuth()?.user?.firstName ?? null;
  } catch {
    return null;
  }
};

export default function SuccessDialog({
  open, title, children, onClose, closeLabel = 'Done', action = null, tone = 'success',
  picture = null, facts = null,
}) {
  const mark = MARK[tone] ?? MARK.success;
  const done = tone === 'success';
  const plain = typeof children === 'string';
  const firstName = useFirstName();
  const shownFacts = (facts ?? []).filter(Boolean).slice(0, 3);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="stf-shell stf-success" showCloseButton={false}>
        <DialogHeader>
          <div className={`stf-success-hero${done ? ' is-done' : ''}`} aria-hidden="true">
            {done ? BURST.map((i) => <span key={i} className={`stf-success-bit is-${i}`} />) : null}
            {picture ? (
              <div className={`stf-success-picture${mark.className}`}>
                <i className={`ti ${picture}`} />
                <span className={`stf-success-mark is-badge${mark.className}`}><i className={`ti ${mark.icon}`} /></span>
              </div>
            ) : (
              <div className={`stf-success-mark${mark.className}`}><i className={`ti ${mark.icon}`} /></div>
            )}
          </div>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {plain ? <p className="stf-step-sub">{children}</p> : children}

        {shownFacts.length > 0 ? (
          <dl className="stf-success-facts">
            {shownFacts.map((fact) => (
              <div key={fact.label} className={`stf-success-fact${fact.warn ? ' is-warn' : ''}`}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {done && firstName ? (
          // One string, so the floor translator sees one text node.
          <p className="stf-success-thanks">{`Thank you, ${firstName}.`}</p>
        ) : null}

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
