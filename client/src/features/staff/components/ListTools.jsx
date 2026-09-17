// ─────────────────────────────────────────────────────
// client/src/features/staff/components/ListTools.jsx
//
// The bar above a selection list: a search box, and whatever filter
// the screen has. State lives in hooks/useListSearch.js — this only
// draws it.
//
// type="search" rather than type="text": on iOS it gives the keyboard
// a Search key instead of Return, and the browser's own clear button
// where one exists. The explicit clear button is here anyway because
// Android does not draw one, and a worker who has typed a typo needs
// one tap to get the whole list back rather than nine backspaces with
// gloves on.
//
// No debounce. The list is already in memory and filtering thirty rows
// is free; a debounce here would only add lag between the key and the
// result.
// ─────────────────────────────────────────────────────
export default function ListTools({
  id, query, onQuery, placeholder = 'Search this list', children,
}) {
  return (
    <div className="stf-tools">
      <div className="stf-search">
        <i className="ti ti-search stf-search-icon" aria-hidden="true" />
        <input
          id={id}
          className="stf-search-input"
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          aria-label={placeholder}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="stf-search-clear"
            onClick={() => onQuery('')}
            aria-label="Clear the search"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        ) : null}
      </div>
      {children ? <div className="stf-tools-extra">{children}</div> : null}
    </div>
  );
}

// The same segmented control the history screens use for their date
// ranges, so a filter looks like a filter everywhere in the app.
export function FilterSegments({ label, options, value, onChange }) {
  if (!options || options.length < 2) return null;
  return (
    <div className="stf-segments" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          className={`stf-segment${value === option.key ? ' is-active' : ''}`}
          onClick={() => onChange(option.key)}
        >
          {option.label}{option.count === undefined ? '' : ` (${option.count})`}
        </button>
      ))}
    </div>
  );
}

// "Nothing here" and "nothing matches what you typed" are different
// problems and need different sentences. The second one also needs a
// way out, which is the button.
export function NoMatches({ query, onClear, noun = 'items' }) {
  return (
    <div className="stf-empty">
      <p className="stf-empty-line">
        {query
          ? <>No {noun} match &ldquo;{query}&rdquo;.</>
          : <>Nothing matches what you have filtered to.</>}
      </p>
      <button type="button" className="stf-btn stf-btn-secondary" onClick={onClear}>
        Show everything again
      </button>
    </div>
  );
}
