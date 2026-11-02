// ─────────────────────────────────────────────────────
// client/src/features/staff/ListTools.jsx
//
// The bar above a selection list: a search box, and whatever filter
// the screen has. State lives in lib/useListSearch.js — this only
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
import { useState } from 'react';

export default function ListTools({
  id, query, onQuery, placeholder = 'Search this list', children,
  // For a search that opens from an icon (SelectField's `search`):
  // focus goes into it as it appears, and its cross closes it again.
  autoFocus = false, onClose,
}) {
  return (
    <div className="stf-tools">
      <div className="stf-search">
        <i className="ti ti-search stf-search-icon" aria-hidden="true" />
        <input
          id={id}
          // has-close: the cross shows even when the box is empty, so the
          // hint keeps the room the cross needs.
          className={`stf-search-input${onClose ? ' has-close' : ''}`}
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        {query || onClose ? (
          <button
            type="button"
            className="stf-search-clear"
            onClick={() => { onQuery(''); onClose?.(); }}
            aria-label={onClose && !query ? 'Close the search' : 'Clear the search'}
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

// A list's heading with a search icon beside it. The search box only
// appears when the icon is tapped (or a search is already typed), so a
// screen whose list is usually short enough to read does not spend a
// row on it. The same idea as SelectField's `search`, for a list.
export function SearchHeading({ title, id, query, onQuery, placeholder, buttonLabel = 'Search' }) {
  const [open, setOpen] = useState(false);
  const searching = open || Boolean(query);
  return (
    <>
      <div className="stf-field-labelrow">
        <p className="stf-summary-title">{title}</p>
        {!searching ? (
          <button type="button" className="stf-search-open" aria-label={buttonLabel} onClick={() => setOpen(true)}>
            <i className="ti ti-search" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {searching ? (
        <ListTools
          id={id} query={query} onQuery={onQuery} placeholder={placeholder}
          autoFocus={open} onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
