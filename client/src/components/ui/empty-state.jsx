// ─────────────────────────────────────────────────────────────
// client/src/components/ui/empty-state.jsx
//
// One empty state for the whole app.
//
// Before this there were four shapes of "nothing here" — a
// stock-empty-state div, a .stf-empty div, a colSpan table cell and a
// bare muted paragraph — and none of them offered a way out. An empty
// screen is the moment someone is most likely to be stuck, so the
// action that fills it belongs right there.
//
// `action` is optional because some empty states are good news: the
// reconciliation tab having nothing to show is the desired outcome,
// not a dead end.
// ─────────────────────────────────────────────────────────────
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-12 text-center ${className}`}>
      {Icon && (
        <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}

      <p className="text-sm font-medium">{title}</p>

      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 text-xs font-semibold underline underline-offset-2 hover:text-[#ef3a40]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
