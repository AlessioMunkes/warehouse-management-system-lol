// ───────────────────────────────────────────────────────────
// client/src/features/staff/components/WorkList.jsx
//
// The list of lines a worker is counting, in one shape for both modes.
//
// WHY ONE LIST AND NOT TWO SCREENS
// Guided used to be a separate render tree — a StepScreen per line.
// That is what made it feel restrictive: one line at a time, with no
// way to see the rest of the job or jump to the line you actually
// wanted. Here Guided is a FOCUS state over the same list. The focused
// row expands, the others stay visible and tappable, and Next simply
// moves the focus down. Nothing is hidden, and there is one code path
// instead of two that drift.
//
// WHY THE ROWS ARE THIS SMALL
// A row is the product, its expected quantity, and one number. As a
// card with a heading, a code line, a field label and a full-width
// input that is about 135px, so nine lines ran to 1200px of scrolling
// for nine numbers. Collapsed here it is one line of about 56px, and
// the per-line extras (put-away location, use-by date, the variance
// notice) live in the accordion that opens under the focused row.
//
// WHY EVERY LINE STARTS FILLED
// Most deliveries match the order and most pallets go out as packed.
// Making someone retype all nine is the actual waste. Lines arrive
// pre-filled by the caller and `onAcceptAll` fills any that are still
// blank, so the job becomes "tell me what is different".
// ───────────────────────────────────────────────────────────

// A step of one. Fractional quantities are real here (35.5 kg), so the
// steppers move by whole units and the field itself still takes any
// decimal the worker types.
const bump = (value, by) => {
  const next = Number(value === '' ? 0 : value) + by;
  return String(next < 0 ? 0 : Math.round(next * 1000) / 1000);
};

export function WorkRow({
  line, focused, onFocus, onChange, detail, expectedLabel = 'Expected',
}) {
  const filled  = line.value !== '' && line.value !== null && line.value !== undefined;
  const varies  = filled && Number(line.value) !== Number(line.expected);

  return (
    <div className={`stf-wl-row${varies ? ' is-warn' : ''}${focused ? ' is-focus' : ''}`}>
      <div className="stf-wl-line">
        <button
          type="button"
          className="stf-wl-main"
          aria-expanded={focused}
          onClick={() => onFocus?.(line.id)}
        >
          {varies ? <span className="stf-wl-mark" aria-hidden="true">!</span> : null}
          <span className="stf-wl-text">
            <span className="stf-wl-title">{line.title}</span>
            <span className="stf-wl-meta">
              {line.sku ? `${line.sku} \u00b7 ` : ''}{expectedLabel} {line.expected}{line.unit ? ` ${line.unit}` : ''}
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
        </div>
      </div>

      {focused && detail ? <div className="stf-wl-detail">{detail}</div> : null}
    </div>
  );
}

export default function WorkList({
  lines, focusId, onFocus, onChange, renderDetail,
  expectedLabel = 'Expected', onAcceptAll, acceptAllLabel = 'Everything as expected',
}) {
  const total  = lines.length;
  const done   = lines.filter((l) => l.value !== '' && l.value !== null && l.value !== undefined).length;
  const varied = lines.filter(
    (l) => l.value !== '' && l.value !== null && Number(l.value) !== Number(l.expected)
  ).length;

  return (
    <div className="stf-wl">
      <div className="stf-wl-bar">
        <span className="stf-wl-count" aria-live="polite">
          {done} of {total} checked{varied ? ` \u00b7 ${varied} different` : ''}
        </span>
        {onAcceptAll && done < total ? (
          <button type="button" className="stf-wl-accept" onClick={onAcceptAll}>
            {acceptAllLabel}
          </button>
        ) : null}
      </div>

      <div className="stf-wl-rows">
        {lines.map((line) => (
          <WorkRow
            key={line.id}
            line={line}
            focused={String(focusId) === String(line.id)}
            onFocus={onFocus}
            onChange={onChange}
            expectedLabel={expectedLabel}
            detail={renderDetail ? renderDetail(line) : null}
          />
        ))}
      </div>
    </div>
  );
}
