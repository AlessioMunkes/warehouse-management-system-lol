// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/hooks/useDetailFocus.js
//
// Clicking a row on a master-data screen opens the detail card at the
// top of the page. On a catalogue of two hundred products that card is
// several screens above where the click happened, so the row appeared
// to do nothing and the admin had to scroll back up to find out it had
// worked.
//
// This puts the card where the eye already is.
//
// A hook in its own file, not a helper exported beside a component:
// react-refresh/only-export-components is an error in this project, so
// a module exporting both a component and a hook fails the build. Same
// reason shellContext.js and toastContext.js live apart from the
// components that use them.
//
// WHY A NONCE AND NOT THE SELECTED ID
// Keying the effect on the selected id means clicking the same row
// twice only scrolls once — and the second click is exactly the case
// where somebody has scrolled away and wants to get back. Bumping a
// counter on every request makes each click move the page.
//
// RETURNS A TUPLE, NOT AN OBJECT
// `const detail = useDetailFocus()` then `ref={detail.ref}` trips
// react-hooks/refs — "Cannot access refs during render" — because the
// rule sees a ref being read off an object in the render body. It is a
// false alarm here (nothing reads .current) but the rule is an error
// in this project, and destructuring to a plain identifier is a better
// shape anyway: `const [detailRef, focusDetail] = useDetailFocus()`
// reads like useState, which is what it behaves like.
//
// focus() as well as scrollIntoView(): somebody driving this by
// keyboard gets no benefit from a scroll they cannot feel, and moving
// focus into the card means the next Tab lands on Edit rather than
// back at the top of the table. preventScroll stops the browser from
// doing its own instant jump and fighting the smooth one.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';

export default function useDetailFocus() {
  const ref = useRef(null);
  const [nonce, setNonce] = useState(0);

  const request = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (nonce === 0) return;          // nothing has been opened yet
    const el = ref.current;
    if (!el) return;                  // card not mounted (load failed)

    // Respect the OS setting. A smooth scroll is motion, and someone
    // who has asked for less of it means this too.
    const still = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    } catch {
      // Older engines reject the options object. A plain jump is
      // still better than staying put.
      el.scrollIntoView();
    }
    el.focus?.({ preventScroll: true });
  }, [nonce]);

  return [ref, request];
}
