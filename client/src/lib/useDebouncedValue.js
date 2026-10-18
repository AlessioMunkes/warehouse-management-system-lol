// ─────────────────────────────────────────────────────────────
// client/src/lib/useDebouncedValue.js
//
// A value that follows another one a moment later: type "thandi" and
// the value changes once, 300 ms after the last key, not six times.
// For a search box that asks the server, so typing is one request.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

export default function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
