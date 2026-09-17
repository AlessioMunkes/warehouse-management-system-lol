// ─────────────────────────────────────────────────────
// client/src/features/staff/hooks/useListSearch.js
//
// Text search over a list the client already holds.
//
// Every selection screen in this app — which delivery, which pallet,
// which sack, which collection — fetches its whole working set in one
// call and renders it. Once that set is thirty rows, finding one by
// scrolling is the slow part of the job, and on the decanting screen
// the product names are long enough that two rows can look identical
// until you read to the end of them.
//
// Every term has to match, so "bokomo 86" finds order 86 from Bokomo
// and nothing else. Matching is on a single haystack string the caller
// builds, which is what lets one hook serve a supplier name, a pallet
// reference and a driver.
//
// Client-side, like the paging: the data is already here and it is
// small. A server search would be a round trip to filter nine rows.
// ─────────────────────────────────────────────────────
import { useMemo, useState } from 'react';

export default function useListSearch(items, getText) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const terms = q.split(/\s+/);
    return list.filter((item) => {
      const hay = String(getText(item) ?? '').toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [items, query, getText]);

  return {
    query,
    setQuery,
    filtered,
    searching: query.trim().length > 0,
    // For the empty state: "nothing matches" and "nothing here at all"
    // are different sentences, and a worker who typed a typo needs the
    // first one rather than being told the warehouse is empty.
    hiddenBySearch: (Array.isArray(items) ? items.length : 0) - filtered.length,
  };
}
