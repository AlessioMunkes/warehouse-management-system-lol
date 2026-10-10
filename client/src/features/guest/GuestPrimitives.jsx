// ─────────────────────────────────────────────────────────────
// client/src/features/guest/GuestPrimitives.jsx
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
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDay, foodForPhrase } from './guestFormat';
import { useGuestSignOut } from './useGuestSignOut';
import '../../styles/guest.css';

// ── Shell ─────────────────────────────────────────────────────
// Owns the token scope. Every guest screen renders inside one.
const Masthead = () => (
  <header className="gst-masthead">
    <span className="gst-masthead-brand">Ladles<span>·</span>of<span>·</span>Love</span>
    <span className="gst-masthead-brand" style={{ fontWeight: 500 }}>Love Activist</span>
  </header>
);

// `nav` adds the volunteer's own bar — Home and Sign out — for the pages
// a signed-in guest works from. Pages with their own exits (the QR
// preview, the thank-you page) leave it off rather than show two
// sign-outs.
export const GuestShell = ({ children, nav = false }) => (
  nav ? <NavShell>{children}</NavShell> : (
    <div className="gst-shell">
      <Masthead />
      <main className="gst-page">{children}</main>
    </div>
  )
);

// Explicit routes, never navigate(-1): "back" can mean the poster's
// camera app. Home keeps any claimed pallet and its progress; the home
// page offers it back.
const NavShell = ({ children }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const flow = useGuestSignOut();

  return (
    <div className="gst-shell">
      <Masthead />
      <nav className="gst-nav" aria-label="Your session">
        <div className="gst-nav-inner">
          {pathname !== '/guest-home' ? (
            <button type="button" className="gst-nav-btn" onClick={() => navigate('/guest-home')} disabled={flow.busy}>
              Home
            </button>
          ) : <span />}
          <button
            type="button" className="gst-nav-btn"
            onClick={flow.request}
            disabled={flow.busy || flow.confirming || flow.checkFailed}
            aria-busy={flow.busy || undefined}
          >
            {flow.busy ? <span className="gst-spinner" aria-hidden="true" /> : null}
            Sign out
          </button>
        </div>
      </nav>
      <main className="gst-page">
        <SignOutConfirm flow={flow} />
        {children}
      </main>
    </div>
  );
};

// ── Sign-out confirmation ─────────────────────────────────────
// Shown only when the guest still holds a pallet. Also carries a failed
// check or a failed return, so a refusal is never silent.
export const SignOutConfirm = ({ flow }) => {
  const headingRef = useRef(null);
  useEffect(() => { if (flow.confirming || flow.checkFailed) headingRef.current?.focus(); }, [flow.confirming, flow.checkFailed]);

  if (flow.checkFailed) {
    return (
      <div className="gst-card gst-confirm gst-stack-tight" role="alertdialog" aria-labelledby="gst-confirm-title" aria-describedby="gst-confirm-text">
        <h2 className="gst-card-title" id="gst-confirm-title" ref={headingRef} tabIndex={-1}>We could not check your pallet.</h2>
        <p className="gst-card-meta gst-text-ink" id="gst-confirm-text">
          If you were packing a pallet, staff can return it to the floor.
        </p>
        <Button onClick={flow.request}>Try again</Button>
        <Button variant="secondary" onClick={flow.signOutAnyway}>Sign out anyway</Button>
      </div>
    );
  }
  if (!flow.confirming) {
    return flow.error ? <Notice tone="warn">{flow.error}</Notice> : null;
  }
  return (
    <div className="gst-card gst-confirm gst-stack-tight" role="alertdialog" aria-labelledby="gst-confirm-title" aria-describedby="gst-confirm-text">
      <h2 className="gst-card-title" id="gst-confirm-title" ref={headingRef} tabIndex={-1}>Sign out?</h2>
      <p className="gst-card-meta gst-text-ink" id="gst-confirm-text">
        You haven’t finished this pallet. If you sign out, it goes back to the floor
        for someone else to finish. Your packing so far is saved.
      </p>
      {flow.error ? <Notice tone="warn">{flow.error}</Notice> : null}
      <Button onClick={flow.confirm} loading={flow.releasing}>Sign out and return pallet</Button>
      <Button variant="secondary" onClick={flow.cancel} disabled={flow.releasing}>Keep packing</Button>
    </div>
  );
};

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
// `loading` is for a button whose action is under way: it disables the
// button, shows a small spinner and sets aria-busy. The label stays so
// the width does not jump; change the text too if it helps.
export const Button = ({ variant = 'primary', loading = false, disabled, children, ...rest }) => (
  <button
    type="button"
    className={`gst-btn gst-btn-${variant}`}
    aria-busy={loading || undefined}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <span className="gst-spinner" aria-hidden="true" /> : null}
    {children}
  </button>
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
//
// Only drawn for an item that has been dealt with. The item on screen is
// always still to do, so a "To do" pill there told the volunteer nothing.
const STATES = {
  confirmed: { cls: 'done',    mark: '✓', label: 'Packed' },
  flagged:   { cls: 'problem', mark: '!', label: 'Problem' },
};

export const StatusPill = ({ status }) => {
  const s = STATES[status];
  if (!s) return null;
  return (
    <span className={`gst-state gst-state-${s.cls}`}>
      <span className="gst-state-mark" aria-hidden="true">{s.mark}</span>
      {s.label}
    </span>
  );
};

// ── Progress ──────────────────────────────────────────────────
// The worker's bar: a track and an "n / n" count beside it. The count is
// the words; the bar is the picture (ACC-03).
export const Progress = ({ done, total }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="gst-progress">
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
      <span className="gst-progress-count" aria-hidden="true">{done} / {total}</span>
    </div>
  );
};

// ── Item row (the worker's .stf-list / .stf-row, in guest classes) ──
// One rounded list holding the item in front of them. `children` is the
// panel under the head: the counter and the buttons.
export const ItemList = ({ children }) => <div className="gst-list">{children}</div>;

export const ItemRow = ({ position, title, meta, badge, children }) => (
  <div className="gst-row">
    <div className="gst-row-head">
      <div className="gst-row-main">
        {position ? <span className="gst-row-pos">{position}</span> : null}
        <h2 className="gst-row-title">{title}</h2>
        {meta ? <span className="gst-row-meta">{meta}</span> : null}
      </div>
      {badge}
    </div>
    {children}
  </div>
);

// Previous and next among the items still to do, like the worker's
// "Move between items" bar. Only drawn when there is somewhere to go.
export const ItemSteps = ({ index, count, onPrevious, onNext, disabled }) => (
  <nav className="gst-steps" aria-label="Move between items">
    <button type="button" className="gst-step-btn" onClick={onPrevious} disabled={disabled || index <= 0}>
      Previous item
    </button>
    <span className="gst-steps-count">{index + 1} / {count}</span>
    <button type="button" className="gst-step-btn" onClick={onNext} disabled={disabled || index >= count - 1}>
      Next item
    </button>
  </nav>
);

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
// turns the whole card into one 56px-plus target. `disabled` keeps the
// same button while a claim is saving, so the card does not change shape
// or lose its styling under the volunteer's finger.
//
// An empty pallet says so in words HERE, rather than the screen
// rendering "0 items" and leaving a first-timer to interpret it.
export const PalletCard = ({ slip, onClick, actionLabel, disabled = false }) => {
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
    <button type="button" className="gst-card gst-card-button" onClick={onClick} disabled={disabled}>
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
