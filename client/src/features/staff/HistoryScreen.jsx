// ─────────────────────────────────────────────────────────────
// client/src/features/staff/HistoryScreen.jsx
//
// The one shape every worker history takes: past deliveries, past
// decanting sheets, dispatch history and Feed the Soil's compost
// records. Asked for from the floor: the histories looked different
// from each other, and only one way of narrowing them (the date) was
// offered. Here each screen gets, in the same order:
//
//   title and one line under it
//   the date range         Today · This week · This month · All
//   a search box
//   Sort, and a filter per thing worth narrowing by (status, who it
//   came from, who recorded it, where it went)
//   "Showing 4 of 31", with a way to clear what was chosen
//   the rows: what it is, a line about it, its badges, one button
//   paging
//
// The screen fetches; this only narrows, orders and draws. Every
// filter's choices are read off the rows themselves, so a list never
// offers a supplier that is not in it, and a filter with only one
// choice is not shown at all.
//
//   sorts    [{ key, label, compare(a, b) }]   the first is the default
//   filters  [{ key, label, valueOf(row), labelOf?(value) }]
//   search   row => the text a search matches against
//
// HistoryRow is the row every one of them draws, so a delivery, a
// sheet, a dispatch and a compost record line up the same way.
// ─────────────────────────────────────────────────────────────
import { Fragment, useMemo, useState } from 'react';
import { Notice } from './StepPrimitives';
import ListTools, { FilterSegments, NoMatches } from './ListTools';
import Paged from './Paged';
import usePaged from './usePaged';
import { RANGES } from './historyView';

const ALL = '';

export function HistoryRow({ title, meta, badges, action }) {
  return (
    <div className="stf-row is-static stf-history-row">
      <span className="stf-row-main">
        <span className="stf-row-title">{title}</span>
        {meta ? <span className="stf-row-meta">{meta}</span> : null}
      </span>
      {badges ? <span className="stf-history-badges">{badges}</span> : null}
      {action ? (
        <button
          type="button"
          className="stf-btn stf-btn-secondary"
          onClick={action.onClick}
          disabled={action.busy}
        >
          {action.busy ? 'Opening…' : action.label}
        </button>
      ) : null}
    </div>
  );
}

export default function HistoryScreen({
  title, sub, error, notice,
  range, onRangeChange,
  loading, rows, renderRow, rowKey = (row) => row.id,
  search, searchPlaceholder = 'Search this list', searchId = 'stf-history-search',
  sorts = [], filters = [],
  empty, noun = 'records',
  children,
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState(sorts[0]?.key ?? '');
  const [chosen, setChosen] = useState({});

  // The choices each filter offers, read off what is loaded.
  const options = useMemo(() => {
    const out = {};
    for (const f of filters) {
      const seen = new Map();
      for (const row of rows) {
        const value = f.valueOf(row);
        if (value === null || value === undefined || value === '') continue;
        const key = String(value);
        if (!seen.has(key)) seen.set(key, f.labelOf ? f.labelOf(value) : String(value));
      }
      out[f.key] = [...seen.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'en-ZA', { sensitivity: 'base' }));
    }
    return out;
  }, [filters, rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((row) => {
      if (q && search && !String(search(row) ?? '').toLowerCase().includes(q)) return false;
      return filters.every((f) => {
        const want = chosen[f.key];
        return !want || String(f.valueOf(row) ?? '') === want;
      });
    });
    const sort = sorts.find((s) => s.key === sortKey);
    if (sort) list = [...list].sort(sort.compare);
    return list;
  }, [rows, query, search, filters, chosen, sorts, sortKey]);

  // Back to page 1 whenever what is shown changes underneath it.
  const paged = usePaged(shown, undefined, JSON.stringify([query, sortKey, chosen, range]));
  const narrowed = Boolean(query.trim()) || Object.values(chosen).some(Boolean);
  const clearAll = () => { setQuery(''); setChosen({}); };

  // A filter with one choice narrows nothing; it stays only while it
  // is the thing currently chosen, so it can be undone.
  const usableFilters = filters.filter((f) => (options[f.key]?.length ?? 0) > 1 || chosen[f.key]);

  return (
    <div className="stf-step stf-history">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>{title}</h1>
        {sub ? <p className="stf-step-sub">{sub}</p> : null}
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {children}

      {onRangeChange ? (
        <FilterSegments label="Date range" options={RANGES} value={range} onChange={onRangeChange} />
      ) : null}

      <ListTools id={searchId} query={query} onQuery={setQuery} placeholder={searchPlaceholder}>
        {sorts.length > 1 || usableFilters.length > 0 ? (
          <div className="stf-history-filters">
            {sorts.length > 1 ? (
              <label className="stf-history-filter">
                <span className="stf-history-filter-label">Sort</span>
                <select
                  className="stf-select is-compact"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                >
                  {sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            ) : null}
            {usableFilters.map((f) => (
              <label key={f.key} className="stf-history-filter">
                <span className="stf-history-filter-label">{f.label}</span>
                <select
                  className="stf-select is-compact"
                  value={chosen[f.key] ?? ALL}
                  onChange={(e) => setChosen((c) => ({ ...c, [f.key]: e.target.value }))}
                >
                  <option value={ALL}>All</option>
                  {(options[f.key] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        ) : null}
      </ListTools>

      {!loading && narrowed && rows.length > 0 ? (
        <div className="stf-history-count" role="status">
          <span>{`Showing ${shown.length} of ${rows.length}`}</span>
          <button type="button" className="stf-history-clear" onClick={clearAll}>Clear</button>
        </div>
      ) : null}

      {loading ? (
        <div className="stf-skeleton" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="stf-empty">{empty}</div>
      ) : shown.length === 0 ? (
        <NoMatches query={query.trim()} onClear={clearAll} noun={noun} />
      ) : (
        <div className="stf-list">
          {paged.slice.map((row) => <Fragment key={rowKey(row)}>{renderRow(row)}</Fragment>)}
        </div>
      )}

      <Paged {...paged} noun={noun} />
    </div>
  );
}
