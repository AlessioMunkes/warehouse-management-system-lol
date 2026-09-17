// ─────────────────────────────────────────────────────
// client/src/features/staff/hooks/useConfirmed.js
//
// Which lines a worker has ticked off, for WorkList's confirm control.
//
// Kept as an array of ids rather than a Set because it is state: a Set
// mutated in place does not change identity, so React would not
// re-render. Ids are compared as strings — they are numbers in
// receiving and dispatch and bag-size labels ("2kg") in decanting.
//
// All three flows need the same four things, which is why this is a
// hook and not three copies of the same five lines.
// ─────────────────────────────────────────────────────
import { useCallback, useState } from 'react';

export default function useConfirmed() {
  const [ids, setIds] = useState([]);

  const toggle = useCallback((id) => {
    setIds((all) => (all.some((x) => String(x) === String(id))
      ? all.filter((x) => String(x) !== String(id))
      : [...all, id]));
  }, []);

  const confirmAll = useCallback((all) => setIds(all ?? []), []);
  const reset = useCallback(() => setIds([]), []);

  return { ids, toggle, confirmAll, reset };
}
