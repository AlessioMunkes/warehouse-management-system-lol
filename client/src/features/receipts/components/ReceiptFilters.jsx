// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/components/ReceiptFilters.jsx
//
// The filter bar both tabs share. Date range and status are common;
// the third control is supplier on goods-in and beneficiary on
// goods-out, passed in rather than branched on here.
//
// Uses plain inputs with brand classes rather than the shadcn Select,
// because Select is a Base UI popover and a native <select> is a
// better control on a warehouse phone — it opens the OS picker, which
// is bigger and works with one thumb.
// ─────────────────────────────────────────────────────────────
const FIELD =
  'w-full rounded-[4px] border-2 border-[#e9e3dd] bg-white px-3 py-2 text-sm ' +
  'text-[#2b3336] focus:border-[#2b3336] focus:outline-none';

const LABEL =
  'block text-[10px] font-bold uppercase tracking-wider text-[#676767] mb-1';

export default function ReceiptFilters({
  from, to, onFromChange, onToChange,
  status, statusOptions, onStatusChange,
  entityLabel, entityValue, entityOptions, onEntityChange,
  search, onSearchChange, searchPlaceholder,
  extra,
  onClear,
  resultCount,
  isLoading,
}) {
  const hasFilters = Boolean(from || to || status || entityValue || search);

  return (
    <div className="rounded-[4px] border-2 border-[#e9e3dd] bg-white p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={LABEL} htmlFor="receipts-from">From</label>
          <input
            id="receipts-from" type="date" className={FIELD}
            value={from} max={to || undefined}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="receipts-to">To</label>
          <input
            id="receipts-to" type="date" className={FIELD}
            value={to} min={from || undefined}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="receipts-entity">{entityLabel}</label>
          <select
            id="receipts-entity" className={FIELD}
            value={entityValue}
            onChange={(e) => onEntityChange(e.target.value)}
          >
            <option value="">All</option>
            {entityOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="receipts-status">Status</label>
          <select
            id="receipts-status" className={FIELD}
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            <option value="">All</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {extra}
      </div>

      {/* Full width on its own row: a reference number is the thing someone
          types when they already know which record they want, and cramming it
          into the four-column grid makes it look like just another dropdown. */}
      <div className="mt-3">
        <label
          className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#676767]"
          htmlFor="receipts-search"
        >
          Search
        </label>
        <input
          id="receipts-search"
          type="search"
          className="w-full rounded-[4px] border-2 border-[#e9e3dd] bg-white px-3 py-2 text-sm text-[#2b3336] focus:border-[#2b3336] focus:outline-none"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[#676767]">
          {isLoading
            ? 'Loading…'
            : `${resultCount} record${resultCount === 1 ? '' : 's'}`}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold uppercase tracking-wider text-[#ef3a40] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
