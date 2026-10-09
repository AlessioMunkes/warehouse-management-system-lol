// ─────────────────────────────────────────────────────────────
// client/src/components/layout/OfflineBar.jsx
//
// The one place the app admits it cannot reach the server.
//
// Before this, losing signal in the warehouse looked like nothing at
// all until a worker pressed the button at the end of a delivery and
// got "Could not reach the server" — after the counting, after the
// signature, with no idea whether any of it survived. The bar moves
// that discovery to the moment it happens and answers the only
// question that matters: is my work safe.
//
// It says four things and nothing else:
//
//   no signal, nothing waiting   your work is kept on this device
//   no signal, things waiting    how many, and that they will go
//   sending                      so the count moving means something
//   stuck                        the server refused one; a person is
//                                needed, and here is the reason
//
// There is no dismiss button. A dismissible warning about unsaved
// work is a warning that gets dismissed and then forgotten, and the
// bar is already silent whenever there is nothing to say.
//
// role="status" rather than "alert": a screen reader should finish
// the sentence it is on. This is not an emergency, it is a fact about
// the building.
// ─────────────────────────────────────────────────────────────
import useOutbox from '../../lib/useOutbox';
import { useServedFromCache } from '../../services/readCache';
import { useT } from '../../translations';

// "at 14:05" today, "on 12 Sep at 14:05" otherwise.
const savedWords = (at, t) => {
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return t('offline.atTime', { time });
  return t('offline.onDate', { date: d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), time });
};

export default function OfflineBar() {
  const { online, waiting, stuck, sending, send } = useOutbox();
  const savedAt = useServedFromCache();
  const t = useT();
  const savedNote = savedAt ? ` ${t('offline.showingSaved', { when: savedWords(savedAt, t) })}` : '';

  // Everything is fine and nothing is waiting: say nothing.
  if (online && waiting === 0) return null;

  if (stuck.length > 0) {
    return (
      <div className="stf-netbar is-stuck" role="status">
        <span className="stf-netbar-text">
          {t.n('offline.stuck', stuck.length)}{' '}
          {stuck[0].label ? `${stuck[0].label}: ` : ''}{stuck[0].error} {t('offline.tellManager')}
        </span>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="stf-netbar" role="status">
        <span className="stf-netbar-text">
          {waiting > 0 ? t.n('offline.noSignalWaiting', waiting) : t('offline.noSignal')}
          {savedNote}
        </span>
      </div>
    );
  }

  // Back in range with a queue behind us.
  return (
    <div className="stf-netbar is-sending" role="status">
      <span className="stf-netbar-text">
        {sending ? t.n('offline.sending', waiting) : t.n('offline.waiting', waiting)}
      </span>
      {!sending ? (
        <button type="button" className="stf-netbar-btn" onClick={send}>
          {t('offline.sendNow')}
        </button>
      ) : null}
    </div>
  );
}
