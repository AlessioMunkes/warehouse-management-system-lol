// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/hooks/useOpenFromQuery.js
//
// A link can open a record: /noc/beneficiaries?open=12 lands on the
// beneficiary list with centre 12 already open and scrolled into view
// (the screen's own open(), which calls useDetailFocus). Used by the
// admin Activity and Archive screens so "Open" goes straight to the
// record rather than to a list the admin then has to search.
//
// The parameter is removed once used, so a refresh or the back button
// does not re-open a record the admin has since closed.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function useOpenFromQuery(open, { ready = true, param = 'open' } = {}) {
  const [params, setParams] = useSearchParams();
  const value = params.get(param);
  const done = useRef(false);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; });

  useEffect(() => {
    if (done.current || !ready || !value) return;
    done.current = true;
    openRef.current(value);
    const next = new URLSearchParams(params);
    next.delete(param);
    setParams(next, { replace: true });
  }, [ready, value, param, params, setParams]);
}
