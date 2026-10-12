// ─────────────────────────────────────────────────────────────
// client/src/lib/useOutbox.js
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
import { apiGet, apiPost } from '../services/api';
import { isReachable, subscribe as subscribeConnection } from '../services/connection';
import { flush, list, remove, retry as retryItem, setOwner, subscribe as subscribeOutbox } from '../services/outbox';
import { useAuth } from '../context/AuthContext';

export default function useOutbox() {
  const [online, setOnline] = useState(isReachable);
  const [pending, setPending] = useState([]);
  const [sending, setSending] = useState(false);

  // The queue sends each item as the person who recorded it, so it has
  // to know who is signed in. Told before the first flush below.
  const { user } = useAuth() ?? {};
  const userId = user?.id ?? null;
  useEffect(() => { setOwner(user ?? null); }, [user]);

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
  // Somebody else's work on this phone waits for them; it is not ours
  // to send, so it does not keep the timer running.
  const isOther = useCallback(
    (item) => item.userId != null && userId != null && String(item.userId) !== String(userId),
    [userId],
  );
  const mine = pending.filter((item) => !isOther(item));
  const sendable = mine.filter((item) => !item.permanent).length;

  useEffect(() => {
    if (sendable === 0) return undefined;

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
  }, [sendable, online, send, userId]);

  // With nothing queued, nothing above ever asks the server again, so
  // a worker who walked back into range would keep seeing "No signal"
  // until they happened to tap something. A cheap probe ends that.
  useEffect(() => {
    if (online) return undefined;
    const probe = () => { apiGet('/api/health').catch(() => {}); };
    const timer = setInterval(probe, 15000);
    return () => clearInterval(timer);
  }, [online]);

  // Stuck means out of the retry rotation: refused, or too old. An
  // item that merely failed once and will be tried again is waiting,
  // not stuck, and neither is one waiting for a sign-in.
  const stuck = mine.filter((item) => item.permanent);
  const others = pending.filter(isOther);

  // Put a stuck item back and send straight away, so the worker sees
  // whether it went.
  const retry = useCallback(async (id) => { await retryItem(id); return send(); }, [send]);
  const discard = useCallback((id) => remove(id), []);

  return {
    online,
    pending,
    mine,
    others,
    stuck,
    sending,
    waiting: sendable,
    send,
    retry,
    discard,
    isOther,
  };
}
