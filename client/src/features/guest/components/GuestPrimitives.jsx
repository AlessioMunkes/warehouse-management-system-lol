// ─────────────────────────────────────────────────────────────
// client/src/features/guest/components/GuestPrimitives.jsx
//
// The building blocks the Love Activist screens are made of — the same
// idea as StepPrimitives.jsx for staff, one file rather than nine, so
// the five guest screens cannot drift into five different-looking
// products.
//
// These are deliberately NOT the .stf-* primitives re-skinned. They are
// the same design language in a different register: bigger targets
// (56px, ACC-06), more air, plainer words. See the header of guest.css.
//
// Rules every primitive here keeps:
//   ACC-03  status is a mark AND a word, never colour alone
//   ACC-06  every interactive element is at least 56px
//   NFR-19  the volunteer is greeted and addressed by name
//   "no dead ends" — HelpNote belongs on every screen
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { formatDay, foodForPhrase } from '../guestFormat';
import '../../../styles/guest.css';

// ── Shell ─────────────────────────────────────────────────────
// Owns the token scope. Every guest screen renders inside one.
export const GuestShell = ({ children }) => (
  <div className="gst-shell">
    <header className="gst-masthead">
      <span className="gst-masthead-brand">Ladles<span>·</span>of<span>·</span>Love</span>
      <span className="gst-masthead-brand" style={{ fontWeight: 500 }}>Love Activist</span>
    </header>
    <main className="gst-page">{children}</main>
  </div>
);

// ── Screen ────────────────────────────────────────────────────
// Moving between screens replaces the content, so focus has to move
// deliberately — otherwise a screen-reader user stays parked on a
// button that no longer exists, and a keyboard user starts again from
// the top of the document. Same reasoning as StepScreen.
export const GuestScreen = ({ title, lede, children }) => {
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, [title]);

  return (
    <section className="gst-stack">
      <div className="gst-hero">
        <h1 className="gst-title" ref={headingRef} tabIndex={-1}>{title}</h1>
        {lede ? <p className="gst-lede">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
};

// ── Sense of place ────────────────────────────────────────────
// "What am I doing, who is it for." Sits under the heading on every
// working screen so the answer is never more than a glance away.
export const PlaceBar = ({ items }) => (
  <p className="gst-place">
    {items.filter(Boolean).map((item, i) => (
      <span key={i}>
        {i > 0 ? <span aria-hidden="true"> · </span> : null}
        <span className={item.strong ? 'gst-place-strong' : undefined}>{item.text}</span>
      </span>
    ))}
  </p>
);

// ── Buttons ───────────────────────────────────────────────────
export const Button = ({ variant = 'primary', children, ...rest }) => (
  <button type="button" className={`gst-btn gst-btn-${variant}`} {...rest}>{children}</button>
);

export const ButtonRow = ({ children }) => <div className="gst-btn-row">{children}</div>;

// ── Notice ────────────────────────────────────────────────────
// role="status" so a save or an error is announced, not just drawn.
// The mark is decorative; the sentence carries the meaning (ACC-03).
const NOTICE_MARK = { info: 'i', warn: '!', good: '✓' };

export const Notice = ({ tone = 'info', children }) => (
  <p className={`gst-notice gst-notice-${tone}`} role="status">
    <span aria-hidden="true"><strong>{NOTICE_MARK[tone]}</strong></span>
    <span>{children}</span>
  </p>
);

// ── Status pill (ACC-03) ──────────────────────────────────────
// Mark + word together. Colour is the third signal, never the only one,
// so this reads correctly in greyscale and to a colour-blind volunteer.
const STATES = {
  confirmed: { cls: 'done',    mark: '✓', label: 'Packed' },
  flagged:   { cls: 'problem', mark: '!', label: 'Problem' },
  pending:   { cls: 'todo',    mark: '•', label: 'To do' },
};

export const StatusPill = ({ status }) => {
  const s = STATES[status] ?? STATES.pending;
  return (
    <span className={`gst-state gst-state-${s.cls}`}>
      <span className="gst-state-mark" aria-hidden="true">{s.mark}</span>
      {s.label}
    </span>
  );
};

// ── Progress ──────────────────────────────────────────────────
export const Progress = ({ done, total }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <p className="gst-progress-meta">
        <span>{done} of {total} done</span>
        <span>{pct}%</span>
      </p>
      <div
        className="gst-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`${done} of ${total} items done`}
      >
        <div className="gst-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

// ── Counter ───────────────────────────────────────────────────
// Plus and minus rather than a keyboard. A volunteer standing at a
// pallet counting tins should not have to find the number row, and
// type="number" spinners are unusable one-handed.
export const Counter = ({ label, value, onChange, min = 0 }) => (
  <div className="gst-field">
    <span className="gst-label" id="gst-counter-label">{label}</span>
    <div className="gst-counter">
      <button
        type="button" className="gst-counter-btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="One fewer"
      >−</button>
      <output className="gst-counter-value" aria-live="polite" aria-labelledby="gst-counter-label">
        {value}
      </output>
      <button
        type="button" className="gst-counter-btn"
        onClick={() => onChange(value + 1)}
        aria-label="One more"
      >+</button>
    </div>
  </div>
);

// ── Pallet card ───────────────────────────────────────────────
// The preview shape, shown identically wherever a pallet appears: the
// public preview, the choose-a-pallet list, the summary. `onClick`
// turns the whole card into one 56px-plus target.
//
// An empty pallet says so in words HERE, rather than the screen
// rendering "0 items" and leaving a first-timer to interpret it.
export const PalletCard = ({ slip, onClick, actionLabel }) => {
  const body = (
    <>
      <h2 className="gst-card-title">{slip.beneficiaryName || 'A community partner'}</h2>
      <p className="gst-card-meta">
        {foodForPhrase(slip.beneficiaryKind)}
        {' · '}
        {slip.itemCount === 0
          ? 'Nothing listed on it yet'
          : `${slip.itemCount} thing${slip.itemCount === 1 ? '' : 's'} to pack`}
      </p>
      <p className="gst-card-meta">Going out {formatDay(slip.dispatchDate)}</p>
      {actionLabel ? (
        <p className="gst-card-meta" style={{ marginTop: '0.75rem', fontWeight: 700, color: 'var(--gst-accent)' }}>
          {actionLabel} →
        </p>
      ) : null}
    </>
  );

  if (!onClick) return <div className="gst-card">{body}</div>;
  return (
    <button type="button" className="gst-card gst-card-button" onClick={onClick}>
      {body}
    </button>
  );
};

// ── Help: no dead ends ────────────────────────────────────────
// Every screen ends with a way out that is not "go back". A volunteer
// who is stuck, or who has found something wrong with the pallet, must
// never be looking at a screen with nothing on it for them.
export const HelpNote = ({ children = 'Not sure what to do, or something looks wrong?' }) => (
  <div className="gst-help">
    <p className="gst-help-text">{children}</p>
    <p className="gst-help-text" style={{ margin: 0, fontWeight: 700, color: 'var(--gst-ink)' }}>
      Ask any staff member — they are happy to help.
    </p>
  </div>
);

// ── Loading ───────────────────────────────────────────────────
export const Loading = ({ label = 'Loading' }) => (
  <div className="gst-skeleton" role="status" aria-label={label} />
);
