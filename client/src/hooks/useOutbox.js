// ─────────────────────────────────────────────────────────────
// client/src/hooks/useOutbox.js
//
// The two facts the offline bar needs: can we reach the server, and
// what is still waiting to be sent.
//
// Kept in one hook because they are one story on screen. "No signal"
// on its own is a shrug; "No signal, 2 things waiting" is something a
// worker can act on — finish the round, walk to the office door, watch
// them go.
//
// The flush is driven from here rather than from the service layer so
// that it only ever runs while the app is open and somebody can see
// the result. See the note in outbox.js about deliberately not using
// Background Sync.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { apiPost } from '../services/api';
import { isReachable, subscribe as subscribeConnection } from '../services/connection';
import { flush, list, subscribe as subscribeOutbox } from '../services/outbox';

export default function useOutbox() {
  const [online, setOnline] = useState(isReachable);
  const [pending, setPending] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => subscribeConnection(setOnline), []);
  useEffect(() => subscribeOutbox(setPending), []);

  // The queue survives a reload, so the bar has to learn about it on
  // mount rather than only when something is added.
  useEffect(() => {
    let cancelled = false;
    list().then((items) => { if (!cancelled) setPending(items); });
    return () => { cancelled = true; };
  }, []);

  const send = useCallback(async () => {
    setSending(true);
    try {
      return await flush(apiPost);
    } finally {
      setSending(false);
    }
  }, []);

  // Try when the browser says an interface came back, and try again
  // on a slow drum-beat while anything is waiting. The interval is
  // the one that matters: warehouse wifi comes and goes without ever
  // firing an `online` event, because the interface never dropped.
  useEffect(() => {
    if (pending.length === 0) return undefined;

    const attempt = () => { send(); };
    const timer = setInterval(attempt, 30000);
    window.addEventListener('online', attempt);
    // One immediate attempt, so walking back into range does not mean
    // waiting up to thirty seconds to find out.
    if (online) attempt();

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', attempt);
    };
    // `online` is in here on purpose: coming back online should
    // re-run this and fire the immediate attempt above.
  }, [pending.length, online, send]);

  const stuck = pending.filter((item) => item.error);

  return {
    online,
    pending,
    stuck,
    sending,
    waiting: pending.length,
    send,
  };
}
