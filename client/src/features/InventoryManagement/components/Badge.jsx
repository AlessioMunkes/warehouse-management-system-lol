// Generic status badge. `variant` maps to the badge-* classes already
// defined in the stylesheet, so this one component covers every status
// pill used across the app (inventory, deliveries, decanting, etc).
const VARIANT_CLASS = {
  ok: "badge-ok",
  flagged: "badge-flagged",
  recorded: "badge-recorded",
  pending: "badge-pending",
  deleted: "badge-deleted",
  inactive: "badge-inactive",
  complete: "badge-complete",
};

export default function Badge({ variant = "inactive", children }) {
  const className = VARIANT_CLASS[variant] ?? VARIANT_CLASS.inactive;
  return <span className={className}>{children}</span>;
}