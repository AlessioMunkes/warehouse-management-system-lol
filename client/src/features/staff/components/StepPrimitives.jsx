// ─────────────────────────────────────────────────────────────
// client/src/features/staff/components/StepPrimitives.jsx
//
// The building blocks every staff step flow is made of. One file
// rather than eight, because none of these is meaningful on its own,
// and keeping them together is what stops receiving and decanting
// drifting into two different-looking wizards.
//
// ACC-05 is why they exist: a multi-step task is presented as
// sequential screens with one decision each. ACC-06 is why the
// numbers are 56px and every tap target is at least 44px.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

// ── Step rail ─────────────────────────────────────────────────
// Four thin bars and a quiet line of text. Deliberately not a
// numbered wizard header with chevrons: staff need to know roughly
// where they are, not to navigate a diagram.
export const StepRail = ({ step, total, label }) => (
  <div className="stf-rail">
    <div
      className="stf-rail-bars"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-label={`Step ${step} of ${total}: ${label}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`stf-rail-bar${i < step ? ' is-done' : ''}`} />
      ))}
    </div>
    <div className="stf-rail-meta">
      <span>{label}</span>
      <span>Step {step} of {total}</span>
    </div>
  </div>
);

// ── Step screen ───────────────────────────────────────────────
// Moving between steps replaces the whole screen, so focus has to
// move deliberately. Without this a screen-reader user stays parked
// on the button they just pressed — which no longer exists — and a
// keyboard user starts again from the top of the document.
export const StepScreen = ({ title, sub, children, actions }) => {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        {/* tabIndex={-1} makes the heading focusable programmatically
            without putting it in the tab order. */}
        <h1 className="stf-step-title" ref={headingRef} tabIndex={-1}>{title}</h1>
        {sub ? <p className="stf-step-sub">{sub}</p> : null}
      </div>
      {children ? <div className="stf-step-body">{children}</div> : null}
      {actions}
    </section>
  );
};

// ── Actions ───────────────────────────────────────────────────
// One primary that commits the step, anything else outlined beneath
// it. A row splits the width equally, so a pair never reads as two
// different kinds of control.
export const Actions = ({ row = false, children }) => (
  <div className={`stf-actions${row ? ' is-row' : ''}`}>{children}</div>
);

export const Button = ({ variant = 'primary', children, ...rest }) => (
  <button type="button" className={`stf-btn stf-btn-${variant}`} {...rest}>
    {children}
  </button>
);

// ── Big number field (ACC-06) ─────────────────────────────────
// inputMode="decimal" gives a numeric keypad without type="number",
// whose spinner arrows are unusable with gloves. The comma is
// normalised to a full stop because a South African keyboard produces
// both "48,4" and "48.4" and only one of them is a number.
export const NumberField = ({ id, label, hint, value, onChange, flagged = false, ...rest }) => {
  const fieldId = id || 'stf-num';
  return (
    <div className="stf-field">
      <label className="stf-field-label" htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        className={`stf-input${flagged ? ' is-flagged' : ''}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(',', '.'))}
        {...rest}
      />
      {hint ? <p className="stf-field-hint">{hint}</p> : null}
    </div>
  );
};

export const TextField = ({ id, label, hint, value, onChange, ...rest }) => {
  const fieldId = id || 'stf-txt';
  return (
    <div className="stf-field">
      <label className="stf-field-label" htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        className="stf-input is-text"
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
      {hint ? <p className="stf-field-hint">{hint}</p> : null}
    </div>
  );
};

// ── Choice list ───────────────────────────────────────────────
// Tap targets instead of a <select>. A dropdown hides its options
// until tapped and needs a second tap to commit; with two or three
// choices that is pure cost. Rendered as a radio group so assistive
// tech reports one choice rather than three separate buttons.
export const ChoiceList = ({ legend, options, value, onChange }) => (
  <fieldset className="stf-choices" style={{ border: 0, margin: 0, padding: 0 }}>
    <legend className="stf-sr-only">{legend}</legend>
    {options.map((option) => {
      const chosen = String(value) === String(option.value);
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={chosen}
          className={`stf-choice${chosen ? ' is-chosen' : ''}`}
          onClick={() => onChange(option.value)}
        >
          <span className="stf-choice-label">{option.label}</span>
          {option.meta ? <span className="stf-choice-meta">{option.meta}</span> : null}
        </button>
      );
    })}
  </fieldset>
);

// ── Notice (ACC-03, ACC-09) ───────────────────────────────────
// Never colour alone: a mark and a sentence, always. The sentence is
// written for the floor — no rule codes, no error numbers, no system
// words. Those belong in the handoff notes, not on a screen someone
// reads with a pallet in their hands.
//
// role="status" rather than "alert" so a screen reader finishes the
// sentence it is on instead of interrupting mid-word.
export const Notice = ({ tone = 'info', children, actions }) => (
  <div className={`stf-notice${tone === 'warn' ? ' is-warn' : ''}`} role="status">
    <span className="stf-notice-mark" aria-hidden="true">{tone === 'warn' ? '!' : 'i'}</span>
    <div className="stf-notice-body">
      {children}
      {actions ? <div className="stf-notice-actions">{actions}</div> : null}
    </div>
  </div>
);

// ── key: value caption ────────────────────────────────────────
// Replaces the run of jargon ("BATCH DRY-002/07 · oldest · FIFO")
// that a packer has no way to decode. Labelled pairs, plain words.
export const KeyValues = ({ pairs }) => (
  <p className="stf-kv">
    {pairs.filter(Boolean).map(([key, val]) => (
      <span key={key}>
        <span className="stf-kv-key">{key}:</span> <span className="stf-kv-val">{val}</span>
      </span>
    ))}
  </p>
);

// ── Signature pad ─────────────────────────────────────────────
// Shared by every step flow that needs proof of handover (dispatch
// collection, receiving). Whether anything was drawn is tracked on a
// ref as well as in state: `stop` used to read the state value
// captured in its own render, which is a race that only shows up as
// an occasional signature silently not registering — the worst
// possible bug on the one field that is legally load-bearing.
export const SignaturePad = ({ onChange, label = 'Signature' }) => {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const inked     = useRef(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = '#2b3336';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
  }, []);

  const posOf = (e) => {
    const rect  = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    // The canvas is 600x170 internally but CSS-scaled to the phone's
    // width. Without this ratio the ink lands away from the fingertip.
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
  };

  const start = (e) => {
    e.preventDefault();
    const { x, y } = posOf(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = posOf(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    inked.current = true;
    if (!signed) setSigned(true);
  };

  const stop = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    setSigned(false);
    onChange(null);
  };

  return (
    <div className="stf-field">
      <label className="stf-field-label" htmlFor="stf-signature">{label}</label>
      <canvas
        id="stf-signature"
        ref={canvasRef}
        className="stf-sign-canvas"
        width={600}
        height={170}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={stop}
      />
      <Button variant="secondary" onClick={clear} disabled={!signed}>Clear</Button>
    </div>
  );
};

// ── Counter ───────────────────────────────────────────────────
// 48px either side of the number, because the alternative on a phone
// is a text field and a keyboard covering half the screen.
export const Counter = ({ label, value, onChange, min = 0, max = 9999 }) => (
  <div className="stf-counter">
    <button
      type="button"
      className="stf-counter-btn"
      aria-label={`One fewer ${label}`}
      onClick={() => onChange(Math.max(min, Number(value) - 1))}
    >
      −
    </button>
    <span className="stf-counter-val" aria-live="polite">{value}</span>
    <button
      type="button"
      className="stf-counter-btn"
      aria-label={`One more ${label}`}
      onClick={() => onChange(Math.min(max, Number(value) + 1))}
    >
      +
    </button>
  </div>
);
