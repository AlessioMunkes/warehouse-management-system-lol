// ───────────────────────────────────────────────────────────
// client/src/features/staff/components/WorkList.jsx
//
// The list of lines a worker is counting, in one shape for both modes.
//
// WHY ONE COMPONENT AND NOT TWO SCREENS
// Guided used to be a separate render tree — a StepScreen per line —
// and Form was a second, near-duplicate tree inside a dialog. Two
// trees that must be kept in step is how a field gets fixed in one
// view and not the other. Here there is one list and one set of
// handlers, and the mode decides how much of it is on screen:
//
//   Form    every line at once, dense rows, about 56px each.
//   Guided  one line at a time, full size, with Previous item /
//           Next item under it and "Item 3 of 9" above the name.
//
// Guided showing ONE line is a deliberate reversal of what script 21
// did (dim the rest, keep them visible). Asked for directly: a worker
// with a pallet in their hands wants the next thing, not the whole
// job with the next thing highlighted. The pager is what keeps it
// from being the old trap — the old Guided could only go forwards,
// one StepScreen at a time, with no way back to a line you fumbled.
//
// WHY THE ROWS ARE THIS SMALL IN FORM
// A row is the product, its expected quantity, and one number. As a
// card with a heading, a code line, a field label and a full-width
// input that is about 135px, so nine lines ran to 1200px of scrolling
// for nine numbers. Collapsed here it is one line, and the per-line
// extras (put-away location, use-by date, the variance notice) live
// in the accordion that opens under the focused row.
//
// WHY EVERY LINE STARTS FILLED
// Most deliveries match the order and most pallets go out as packed.
// Making someone retype all nine is the actual waste. Lines arrive
// pre-filled by the caller and `onAcceptAll` fills any that are still
// blank, so the job becomes "tell me what is different".
//
// THE CONFIRM TICK
// Optional — pass `onConfirm` and each row grows a tick next to its
// number. When it is on, the counter above the list counts CONFIRMED
// lines rather than filled ones, which is the honest number: a
// quantity that arrived pre-filled and that nobody looked at is not a
// line anybody checked. In Guided, confirming also moves to the next
// item, because that is the same gesture.
//
// It does not block the commit. Requiring it would be a real change
// to how a delivery gets signed off and that is a decision for the
// floor, not for a UI patch — the one line that would do it is noted
// in the callers' `blockers` arrays.
// ───────────────────────────────────────────────────────────
import { useEffect } from 'react';

// A step of one. Fractional quantities are real here (35.5 kg), so the
// steppers move by whole units and the field itself still takes any
// decimal the worker types.
const bump = (value, by) => {
  const next = Number(value === '' ? 0 : value) + by;
  return String(next < 0 ? 0 : Math.round(next * 1000) / 1000);
};

const isFilled = (v) => v !== '' && v !== null && v !== undefined;

export function WorkRow({
  line, focused, onFocus, onChange, detail, expectedLabel = 'Expected',
  position, confirmed = false, onConfirm,
}) {
  const filled = isFilled(line.value);
  const varies = filled && Number(line.value) !== Number(line.expected);

  return (
    <div
      className={[
        'stf-wl-row',
        varies ? 'is-warn' : '',
        focused ? 'is-focus' : '',
        confirmed ? 'is-confirmed' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="stf-wl-line">
        <button
          type="button"
          className="stf-wl-main"
          aria-expanded={focused}
          onClick={() => onFocus?.(line.id)}
        >
          {varies ? <span className="stf-wl-mark" aria-hidden="true">!</span> : null}
          <span className="stf-wl-text">
            {/* Guided's answer to "where am I and how much is left".
                Only rendered in Guided, where one line is on screen
                and there is otherwise nothing to say how far in you
                are. */}
            {position ? (
              <span className="stf-wl-pos">Item {position.n} of {position.total}</span>
            ) : null}
            <span className="stf-wl-title">{line.title}</span>
            <span className="stf-wl-meta">
              {line.sku ? `${line.sku} · ` : ''}{expectedLabel}{' '}
              {/* The number the worker is checking against, picked out
                  of the meta line. Asked for directly. Worth knowing
                  it spends the accent that staff.css otherwise
                  reserves for things you can click — so this is the
                  one static red on the screen, and nothing else in
                  the row may take it. */}
              <span className="stf-wl-expected">{line.expected}</span>
              {line.unit ? ` ${line.unit}` : ''}
            </span>
          </span>
        </button>

        {/* Steppers either side of the number, because the alternative
            on a phone held with gloves is a keyboard covering half the
            screen for a change of one. The field stays a text input
            with inputMode="decimal" for the same reason NumberField
            does: type="number" spinners are unusable on a tablet. */}
        <div className="stf-wl-qty">
          <button
            type="button"
            className="stf-wl-step"
            aria-label={`One fewer ${line.title}`}
            onClick={() => onChange?.(line.id, bump(line.value, -1))}
          >
            &minus;
          </button>
          <input
            className={`stf-wl-input${varies ? ' is-flagged' : ''}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${line.title}, quantity`}
            value={line.value ?? ''}
            onFocus={() => onFocus?.(line.id)}
            onChange={(e) => onChange?.(line.id, e.target.value.replace(',', '.'))}
          />
          <button
            type="button"
            className="stf-wl-step"
            aria-label={`One more ${line.title}`}
            onClick={() => onChange?.(line.id, bump(line.value, 1))}
          >
            +
          </button>

          {/* aria-pressed rather than a checkbox: it is a toggle on a
              row, and a checkbox here would be read as "include this
              line", which is not what it means. */}
          {onConfirm ? (
            <button
              type="button"
              className={`stf-wl-tick${confirmed ? ' is-on' : ''}`}
              aria-pressed={confirmed}
              aria-label={confirmed ? `${line.title} confirmed` : `Confirm ${line.title}`}
              onClick={() => onConfirm(line.id)}
            >
              <span aria-hidden="true">&#10003;</span>
            </button>
          ) : null}
        </div>
      </div>

      {focused && detail ? <div className="stf-wl-detail">{detail}</div> : null}
    </div>
  );
}

export default function WorkList({
  lines, focusId, onFocus, onChange, renderDetail, guided = false,
  expectedLabel = 'Expected', onAcceptAll, acceptAllLabel = 'Everything as expected',
  confirmed, onConfirm, undo,
}) {
  const total = lines.length;
  const confirmable = Boolean(onConfirm);

  // Ids come through as numbers here and as bag-size labels in
  // decanting, so everything is compared as a string.
  const confirmedSet = new Set((confirmed ?? []).map(String));
  const confirmedCount = lines.filter((l) => confirmedSet.has(String(l.id))).length;
  const filledCount = lines.filter((l) => isFilled(l.value)).length;
  const varied = lines.filter(
    (l) => isFilled(l.value) && Number(l.value) !== Number(l.expected)
  ).length;

  const progress = confirmable ? confirmedCount : filledCount;
  const progressWord = confirmable ? 'confirmed' : 'checked';

  const index = lines.findIndex((l) => String(l.id) === String(focusId));
  const activeIndex = index >= 0 ? index : 0;

  // Guided renders exactly one line, so it must always have one. The
  // callers set the focus when they enter the screen; this is the
  // safety net for a list that arrives after that (a refetch, a draft
  // restoring, a mode switched before the lines loaded).
  useEffect(() => {
    if (guided && total > 0 && index < 0) onFocus?.(lines[0].id);
  }, [guided, total, index, lines, onFocus]);

  const goTo = (i) => { if (lines[i]) onFocus?.(lines[i].id); };

  const handleConfirm = (id) => {
    const turningOn = !confirmedSet.has(String(id));
    onConfirm?.(id);
    // Confirming the line you are on IS "done with this one" — making
    // someone tick and then also press Next is two gestures for one
    // decision. Only forwards, and only when it was not already on.
    if (guided && turningOn) goTo(activeIndex + 1);
  };

  const shown = guided ? (lines[activeIndex] ? [lines[activeIndex]] : []) : lines;

  return (
    <div className={`stf-wl${guided ? ' is-guided' : ''}`}>
      <div className="stf-wl-bar">
        <span className="stf-wl-count" aria-live="polite">
          {progress} of {total} {progressWord}{varied ? ` · ${varied} different` : ''}
        </span>
        {onAcceptAll && progress < total ? (
          <button type="button" className="stf-wl-accept" onClick={onAcceptAll}>
            {acceptAllLabel}
          </button>
        ) : null}
      </div>

      {/* The undo window for accept-all. Under the bar and above the
          rows, where the thing that just changed is — a strip at the
          bottom of the screen would be a notification about something
          happening somewhere else. */}
      {undo ? (
        <div className="stf-wl-undo" role="status">
          <span className="stf-wl-undo-text">{undo.label}</span>
          <button type="button" className="stf-wl-undo-btn" onClick={undo.onUndo}>
            Undo
          </button>
        </div>
      ) : null}

      <div className="stf-wl-rows">
        {/* Deliberately NOT paginated, unlike every staff list that
            grows. A worker submits this; a page 2 they never scrolled
            to is a line nobody checked, signed off as checked. In
            Guided the single line IS the paging, and the count above
            says how much is left. */}
        {shown.map((line) => (
          <WorkRow
            key={line.id}
            line={line}
            focused={guided || String(focusId) === String(line.id)}
            onFocus={onFocus}
            onChange={onChange}
            expectedLabel={expectedLabel}
            position={guided ? { n: activeIndex + 1, total } : null}
            confirmed={confirmedSet.has(String(line.id))}
            onConfirm={confirmable ? handleConfirm : undefined}
            detail={renderDetail ? renderDetail(line) : null}
          />
        ))}
      </div>

      {guided && total > 1 ? (
        <nav className="stf-wl-steps" aria-label="Move between items">
          <button
            type="button"
            className="stf-wl-step-btn"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex <= 0}
          >
            Previous item
          </button>
          <span className="stf-wl-steps-count">{activeIndex + 1} / {total}</span>
          <button
            type="button"
            className="stf-wl-step-btn"
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex >= total - 1}
          >
            Next item
          </button>
        </nav>
      ) : null}
    </div>
  );
}
