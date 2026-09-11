// ─────────────────────────────────────────────────────────────
// client/src/features/staff/components/UnfinishedWork.jsx
//
// "You were counting Order 86. Carry on?"
//
// Drafts have been saved on the device since script 20 — a tablet that
// sleeps, a dropped connection and a stray back-swipe all keep their
// counts. Nothing surfaced them, so the worker had to remember which
// order it was, find it again in the list, and only then discover the
// numbers were still there. Most people would just start again.
//
// Shown at the top of the dashboard because that is where someone
// lands when they come back to the app, which is exactly when the
// question "where was I" is being asked.
//
// Only unfinished work appears here. A flow clears its own draft on a
// successful submit (clearDraft in ReceivingFlow / PalletCheck), so a
// finished job leaves nothing behind to offer.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listDrafts, clearDraft } from '../hooks/useDraft';
import { STAFF } from '../../../routes/paths';

// Draft keys are written by the flows as `receiving-<poId>` and
// `dispatch-<slipId>`. Parsing them here rather than storing a label
// in the draft keeps the flows from having to know how they will be
// described later, and an unrecognised prefix is simply not offered
// rather than shown as something nobody can act on.
const describe = ({ key, data }) => {
  const [kind, id] = key.split('-');

  if (kind === 'receiving') {
    const counted = Object.keys(data?.counted ?? {}).length;
    return {
      title: `Delivery · Order ${id}`,
      detail: counted > 0
        ? `${counted} ${counted === 1 ? 'line' : 'lines'} counted`
        : 'Started, nothing counted yet',
      to: STAFF.receiving,
    };
  }

  if (kind === 'dispatch') {
    const loaded = Object.values(data?.loaded ?? {}).filter((v) => v !== '' && v != null).length;
    return {
      title: `Pallet ${id} at the gate`,
      detail: [
        loaded > 0 ? `${loaded} ${loaded === 1 ? 'line' : 'lines'} checked` : 'Started',
        data?.driverName ? `driver ${data.driverName}` : null,
      ].filter(Boolean).join(' · '),
      to: STAFF.dispatch,
    };
  }

  return null;
};

// "23 minutes ago" beats a timestamp on a screen someone glances at.
const sinceWords = (at) => {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(mins / 60);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
};

export default function UnfinishedWork() {
  const [drafts, setDrafts] = useState([]);

  // Read once on mount. localStorage does not notify this tab about
  // its own writes, and re-reading on an interval would be polling a
  // thing that only changes when the worker leaves this screen.
  useEffect(() => { setDrafts(listDrafts()); }, []);

  const items = drafts
    .map((draft) => ({ draft, ...(describe(draft) ?? {}) }))
    .filter((item) => item.to);

  if (items.length === 0) return null;

  const discard = (key) => {
    clearDraft(key);
    setDrafts((all) => all.filter((d) => d.key !== key));
  };

  return (
    <section className="stf-resume" aria-labelledby="stf-resume-title">
      <h2 className="stf-resume-title" id="stf-resume-title">
        {items.length === 1 ? 'You did not finish this' : 'You did not finish these'}
      </h2>

      <ul className="stf-resume-list">
        {items.map(({ draft, title, detail, to }) => (
          <li key={draft.key} className="stf-resume-row">
            <span className="stf-resume-text">
              <span className="stf-resume-name">{title}</span>
              <span className="stf-resume-meta">{detail} · {sinceWords(draft.savedAt)}</span>
            </span>

            <Link className="stf-resume-go" to={to}>Carry on</Link>

            {/* Discarding is deliberately the quieter of the two and
                says what it does. "Dismiss" would be a lie: the counts
                go with it. */}
            <button
              type="button"
              className="stf-resume-drop"
              onClick={() => discard(draft.key)}
            >
              Throw away
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
