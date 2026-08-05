/**
 * One selectable programme/activity option.
 * icon:     leading icon node (optional)
 * trailing: trailing node, e.g. an info toggle (optional)
 * disabled: renders as non-interactive, "coming soon" style
 */
export default function ProgrammeButton({
  label,
  icon,
  trailing,
  onSelect,
  disabled = false,
  spread = false,
}) {
  return (
    <button
      type="button"
      className="programme-button"
      style={spread ? { justifyContent: "space-between" } : undefined}
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      aria-label={disabled ? `${label} — coming soon` : `Select ${label} programme`}
      title={disabled ? "Coming soon" : undefined}
    >
      {icon && (
        <span className="programme-button__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="programme-button__label">{label}</span>
      {trailing}
    </button>
  );
}