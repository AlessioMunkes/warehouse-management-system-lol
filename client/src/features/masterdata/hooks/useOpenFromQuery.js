// ─────────────────────────────────────────────────────────────
// client/src/features/masterdata/hooks/useOpenFromQuery.js
//
// Opens a record from the URL: /noc/beneficiaries?open=12 opens centre 12
// and scrolls to it. Used by the admin Activity and Archive links. The
// parameter is then removed, so refreshing doesn't reopen it.
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
