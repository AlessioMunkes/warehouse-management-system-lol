// ───────────────────────────────────────────────────────
// client/src/features/staff/components/Paged.jsx
//
// The pager itself. State lives in hooks/usePaged.js — see the note
// there about why the two are separate files.
//
// Under the list, not over it: the control belongs where the list
// runs out.
// ──────────────────────────────────────────────────────
export default function Paged({ page, pages, from, to, total, next, prev, noun = 'items' }) {
  // One page is not a pagination problem. Rendering the control anyway
  // would put two permanently disabled buttons under every short list.
  if (pages <= 1) return null;

  return (
    <nav className="stf-pager" aria-label={`${noun} pagination`}>
      <button
        type="button"
        className="stf-pager-btn"
        onClick={prev}
        disabled={page <= 1}
      >
        Previous
      </button>

      {/* aria-live so a screen reader hears the range change; the
          buttons themselves keep focus, so without this the page
          silently becomes a different page. */}
      <span className="stf-pager-count" aria-live="polite">
        {from}&ndash;{to} of {total} {noun}
      </span>

      <button
        type="button"
        className="stf-pager-btn"
        onClick={next}
        disabled={page >= pages}
      >
        Next
      </button>
    </nav>
  );
}
