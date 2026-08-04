

/**
 * One selectable programme option (Packing / Dispatch / Procurement / Decanting).
 * icon: any SVG/React node passed in from the page.
 */
export default function ProgrammeButton({ label, icon, onSelect }) {
  return (
    <button
      type="button"
      className="programme-button"
      onClick={onSelect}
      aria-label={`Select ${label} programme`}
    >
      <span className="programme-button__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="programme-button__label">{label}</span>
    </button>
  );
}