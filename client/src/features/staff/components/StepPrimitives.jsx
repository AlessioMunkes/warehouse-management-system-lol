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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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

// ── Select field ──────────────────────────────────────────────
// A native <select>, for a list too long to make sense as tap
// targets (every supplier, every one of a supplier's open orders) —
// ChoiceList is the right control for two or three options, this is
// the right one for a dropdown that can hold dozens.
export const SelectField = ({ id, label, hint, value, onChange, options, placeholder, disabled = false }) => {
  const fieldId = id || 'stf-select';
  return (
    <div className="stf-field">
      <label className="stf-field-label" htmlFor={fieldId}>{label}</label>
      <select
        id={fieldId}
        className="stf-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>{placeholder || 'Choose one'}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {hint ? <p className="stf-field-hint">{hint}</p> : null}
    </div>
  );
};

// ── Date field ────────────────────────────────────────────────
// A native date input is functional but reads as a bare grey box.
// This wraps it in a button showing the date in words, and taps
// straight into the native picker via showPicker() — the same
// trick the manager side's DatePicker.jsx uses, ported to .stf-*.
export const DateField = ({ id, label, hint, value, onChange }) => {
  const fieldId = id || 'stf-date';
  const inputRef = useRef(null);
  const formatted = value
    ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  return (
    <div className="stf-field">
      <label className="stf-field-label" htmlFor={fieldId}>{label}</label>
      <button
        type="button"
        className="stf-date-trigger"
        onClick={() => inputRef.current?.showPicker?.() || inputRef.current?.focus()}
      >
        <i className="ti ti-calendar" aria-hidden="true" />
        <span>{formatted || 'Pick a date'}</span>
      </button>
      <input
        ref={inputRef}
        id={fieldId}
        className="stf-date-hidden"
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="stf-field-hint">{hint}</p> : null}
    </div>
  );
};

// ── Quantity field ────────────────────────────────────────────
// Form mode pre-fills every line with the expected quantity — most
// deliveries match the order exactly, so retyping every number is
// work nobody needs to do. What's shown is a plain readout with an
// Edit button beside it; tapping Edit swaps that line to the same
// NumberField Guided mode uses. Matches ACC-03: the affordance to
// change a value is a labelled button, not an icon a worker has to
// guess the meaning of.
export const QuantityField = ({ id, label, value, editing, flagged, onEdit, onChange }) => {
  if (editing) {
    return (
      <NumberField id={id} label={label} value={value} flagged={flagged} onChange={onChange} autoFocus />
    );
  }
  return (
    <div className="stf-field">
      <span className="stf-field-label">{label}</span>
      <div className="stf-qty-readout">
        <span className="stf-qty-readout-val">{value}</span>
        <button type="button" className="stf-qty-edit-btn" onClick={onEdit}>
          <i className="ti ti-pencil" aria-hidden="true" />
          Edit
        </button>
      </div>
    </div>
  );
};

// ── Choice list ───────────────────────────────────────────────
// Tap targets instead of a <select>. A dropdown hides its options
// until tapped and needs a second tap to commit; with two or three
// choices that is pure cost. Rendered as a radio group so assistive
// tech reports one choice rather than three separate buttons.
// `onActivate` turns a double-click on an option into "pick this and
// go", so the worker never has to scroll past a list of twenty to
// reach the button that does the same thing. Single click still only
// selects, because a mis-tap that advances the screen is worse than
// a scroll.
//
// A mouse shortcut, deliberately additive: there is no keyboard
// equivalent because the button below the list already IS the
// keyboard path, and it stays where it is.
export const ChoiceList = ({ legend, options, value, onChange, onActivate }) => (
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
          onDoubleClick={onActivate ? () => {
            onChange(option.value);
            onActivate(option.value);
          } : undefined}
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

// ── View toggle ───────────────────────────────────────────────
// Two ways to work the same task, not a filter between subsets of
// data (that's Segments, used on the packing board) — so it gets its
// own name even though it borrows .stf-segments' look, overridden to
// a full pill (see staff.css's .stf-toggle rule) rather than the
// filter tabs' softer corners.
//
// Sized to its labels, not stretched to fill the row — the same
// booking.com List/Grid control this was asked to look like is a
// short, content-hugging pill sitting inline among other controls,
// not a full-width block. That only works if the sliding thumb's
// width and position are the button's REAL rendered size, since two
// labels like "Guided" and "Form" are not the same width — hence the
// measuring below, the same thing booking.com's own markup does with
// its --bui-segmented-control-active-scale-x/-transform-x custom
// properties (measured in JS, not a fixed CSS split). A ResizeObserver
// re-measures on layout changes — a font finishing its load, the
// bench-tablet breakpoint — not just on option changes.
//
// No title-attribute tooltip: this is a phone held with one hand,
// and `title` never shows on a tap, only a mouse hover that will
// never happen here. Each option's `hint` is shown instead as a
// short caption under the pill, for whichever option is currently
// selected — you learn what a mode does by trying it, in the same
// breath as trying it.
export const ViewToggle = ({ options, value, onChange, className = '' }) => {
  const containerRef = useRef(null);
  const buttonRefs = useRef([]);
  const [thumb, setThumb] = useState(null);
  const index = options.findIndex((o) => o.value === value);
  const active = options[index];

  useLayoutEffect(() => {
    const container = containerRef.current;
    const button = buttonRefs.current[index];
    if (!container || !button) return undefined;

    const measure = () => {
      const containerBox = container.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      setThumb({ width: buttonBox.width, x: buttonBox.left - containerBox.left });
    };

    measure();
    // jsdom has no ResizeObserver. Without this guard every test that
    // renders a flow with the toggle throws an unhandled error on
    // mount — two of them were sitting in an otherwise green suite,
    // which is exactly how a real one goes unnoticed. The measurement
    // above has already run, so the pill is positioned either way;
    // only re-measuring on resize is lost, and nothing resizes in a
    // test.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [index, options]);

  return (
    <div className={`stf-toggle-block${className ? ` ${className}` : ''}`}>
      <div className="stf-toggle" role="radiogroup" ref={containerRef}>
        {thumb ? (
          <span
            className="stf-segment-thumb"
            aria-hidden="true"
            style={{ width: `${thumb.width}px`, transform: `translateX(${thumb.x}px)` }}
          />
        ) : null}
        {options.map((option, i) => {
          const chosen = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => { buttonRefs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={chosen}
              className={`stf-segment${chosen ? ' is-active' : ''}`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {active?.hint ? (
        <p className="stf-toggle-hint" aria-live="polite">{active.hint}</p>
      ) : null}
    </div>
  );
};

// ── Coachmark ─────────────────────────────────────────────────
// A first-run nudge toward a control that is easy to miss, not a
// permanent label. Pair with useCoachmark, which decides whether it
// should be showing at all — this component only draws it. Dismissed
// by tapping it, and the arrow's bounce is switched off under ACC-08
// (see staff.css's [data-stf-motion] rule) since it is the only
// animated part.
export const Coachmark = ({ show, onDismiss, children }) => {
  if (!show) return null;
  return (
    <div className="stf-coachmark" role="status">
      <span className="stf-coachmark-arrow" aria-hidden="true">&#8593;</span>
      <button type="button" className="stf-coachmark-body" onClick={onDismiss}>
        {children}
      </button>
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
