export default function RoutingDecisionTrail({ steps = [], summary = null }) {
  if (!steps.length && !summary) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-800">Decision trail</h3>
        <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
          Read-only preview
        </span>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={`${step.label}-${index}`} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
              {index + 1}
            </span>
            <p className="text-sm leading-6 text-slate-700">{step.label}</p>
          </li>
        ))}
      </ol>

      {summary && (
        <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm font-medium text-sky-900">Final outcome</p>
          <p className="mt-1 text-sm text-sky-800">{summary}</p>
        </div>
      )}
    </div>
  );
}
