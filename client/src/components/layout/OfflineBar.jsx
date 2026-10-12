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
import { useState } from 'react';
import useOutbox from '../../lib/useOutbox';
import OutboxPanel from './OutboxPanel';
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
  const { online, pending, waiting, stuck, others, sending, send, retry, discard, isOther } = useOutbox();
  const savedAt = useServedFromCache();
  const t = useT();
  const [open, setOpen] = useState(false);
  const savedNote = savedAt ? ` ${t('offline.showingSaved', { when: savedWords(savedAt, t) })}` : '';

  // Everything is fine and nothing is on this phone: say nothing.
  if (online && pending.length === 0) return null;

  // The list behind the bar: what each thing is and what to do with it.
  // Only offered when there is something in it, so with nothing queued
  // the bar is still a plain notice with nothing to press.
  const view = pending.length > 0 ? (
    <button type="button" className="stf-netbar-btn" onClick={() => setOpen(true)}>
      {t('offline.view')}
    </button>
  ) : null;
  const panel = (
    <OutboxPanel
      open={open} onOpenChange={setOpen} items={pending} online={online}
      isOther={isOther} onRetry={retry} onDiscard={discard}
    />
  );

  if (stuck.length > 0) {
    return (
      <>
        <div className="stf-netbar is-stuck" role="status">
          <span className="stf-netbar-text">
            {t.n('offline.stuck', stuck.length)} {t('offline.stuckWhat')}
          </span>
          {view}
        </div>
        {panel}
      </>
    );
  }

  if (!online) {
    return (
      <>
        <div className="stf-netbar" role="status">
          <span className="stf-netbar-text">
            {waiting > 0 ? t.n('offline.noSignalWaiting', waiting) : t('offline.noSignal')}
            {savedNote}
          </span>
          {view}
        </div>
        {panel}
      </>
    );
  }

  // Only somebody else's work is on this phone: nothing of ours to send.
  if (waiting === 0) {
    return (
      <>
        <div className="stf-netbar" role="status">
          <span className="stf-netbar-text">
            {t.n('offline.othersWaiting', others.length, { name: others[0]?.userName || t('offline.someoneElse') })}
          </span>
          {view}
        </div>
        {panel}
      </>
    );
  }

  // Back in range with a queue behind us.
  return (
    <>
      <div className="stf-netbar is-sending" role="status">
        <span className="stf-netbar-text">
          {sending ? t.n('offline.sending', waiting) : t.n('offline.waiting', waiting)}
        </span>
        {!sending ? (
          <button type="button" className="stf-netbar-btn" onClick={send}>
            {t('offline.sendNow')}
          </button>
        ) : null}
        {view}
      </div>
      {panel}
    </>
  );
}
