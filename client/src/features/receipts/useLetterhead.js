// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/useLetterhead.js
//
// The letterhead on printed notes, from Settings > Documents
// (GET /api/settings/letterhead). Asked for once per page load and
// shared by every note. Until it arrives, or if it cannot be read
// (offline, an older server), the built-in letterhead (WAREHOUSE in
// noteFormat.js) is used, so a note always prints.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { apiGet } from '../../services/api';
import { WAREHOUSE } from './noteFormat';

let cached = null;
let pending = null;

const load = () => {
  if (!pending) {
    pending = apiGet('/api/settings/letterhead')
      .then((res) => {
        const { name, addressLines } = res?.data ?? {};
        if (name && Array.isArray(addressLines)) cached = { name, addressLines };
        return cached;
      })
      .catch(() => { pending = null; return null; });
  }
  return pending;
};

export default function useLetterhead() {
  const [letterhead, setLetterhead] = useState(cached ?? WAREHOUSE);
  useEffect(() => {
    if (cached) return undefined;
    let live = true;
    load().then((found) => { if (live && found) setLetterhead(found); });
    return () => { live = false; };
  }, []);
  return letterhead;
}
