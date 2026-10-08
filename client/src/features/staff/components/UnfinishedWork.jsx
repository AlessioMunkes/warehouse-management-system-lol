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
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listDrafts, clearDraft } from '../hooks/useDraft';
import { STAFF } from '../../../routes/paths';
import { useT } from '../../../i18n';

// Draft keys are written by the flows as `receiving-<poId>` and
// `dispatch-<slipId>`. Parsing them here rather than storing a label
// in the draft keeps the flows from having to know how they will be
// described later, and an unrecognised prefix is simply not offered
// rather than shown as something nobody can act on.
const describe = ({ key, data }, t) => {
  const [kind, id] = key.split('-');

  if (kind === 'receiving') {
    const counted = Object.keys(data?.counted ?? {}).length;
    return {
      title: t('resume.delivery', { id }),
      detail: counted > 0 ? t.n('resume.linesCounted', counted) : t('resume.startedNothing'),
      // ReceivingFlow opens this order straight away, counts refilled.
      to: `${STAFF.receiving}?resume=${encodeURIComponent(id)}`,
    };
  }

  if (kind === 'dispatch') {
    const loaded = Object.values(data?.loaded ?? {}).filter((v) => v !== '' && v != null).length;
    return {
      title: t('resume.pallet', { id }),
      detail: [
        loaded > 0 ? t.n('resume.linesChecked', loaded) : t('resume.started'),
        data?.driverName ? t('resume.driver', { name: data.driverName }) : null,
      ].filter(Boolean).join(' · '),
      // DispatchPage opens this pallet straight away, checks refilled.
      to: `${STAFF.dispatch}?pallet=${encodeURIComponent(id)}`,
    };
  }

  return null;
};

// "23 minutes ago" beats a timestamp on a screen someone glances at.
const sinceWords = (at, t) => {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1)  return t('time.justNow');
  if (mins < 60) return t.n('time.minutesAgo', mins);
  return t.n('time.hoursAgo', Math.round(mins / 60));
};

export default function UnfinishedWork() {
  // Read once on mount. localStorage does not notify this tab about
  // its own writes, and re-reading on an interval would be polling a
  // thing that only changes when the worker leaves this screen.
  const [drafts, setDrafts] = useState(() => listDrafts());
  const t = useT();

  const items = drafts
    .map((draft) => ({ draft, ...(describe(draft, t) ?? {}) }))
    .filter((item) => item.to);

  if (items.length === 0) return null;

  const discard = (key) => {
    clearDraft(key);
    setDrafts((all) => all.filter((d) => d.key !== key));
  };

  return (
    <section className="stf-resume" aria-labelledby="stf-resume-title">
      <h2 className="stf-resume-title" id="stf-resume-title">
        {t.n('resume.title', items.length)}
      </h2>

      <ul className="stf-resume-list">
        {items.map(({ draft, title, detail, to }) => (
          <li key={draft.key} className="stf-resume-row">
            <span className="stf-resume-text">
              <span className="stf-resume-name">{title}</span>
              <span className="stf-resume-meta">{detail} · {sinceWords(draft.savedAt, t)}</span>
            </span>

            <Link className="stf-resume-go" to={to}>{t('resume.carryOn')}</Link>

            {/* Discarding is deliberately the quieter of the two and
                says what it does. "Dismiss" would be a lie: the counts
                go with it. */}
            <button
              type="button"
              className="stf-resume-drop"
              onClick={() => discard(draft.key)}
            >
              {t('resume.throwAway')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
