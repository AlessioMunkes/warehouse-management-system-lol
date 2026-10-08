// ─────────────────────────────────────────────────────────────
// client/src/features/staff/hooks/useKeepAwake.js
//
// Keeps the screen on while a worker is in a task.
//
// A phone that dims and locks in the middle of counting a delivery has
// to be woken and unlocked with gloves on, every minute or so. While
// `active` is true this asks the device not to sleep (the Screen Wake
// Lock API).
//
// The device gives the lock up by itself whenever the page is hidden —
// another app, the screen switched off by hand — so it is asked for
// again each time the page comes back.
//
// It is a request, not a guarantee: a phone on low battery or in power
// saving may refuse, and a browser without the API does nothing. Either
// way the task carries on exactly as before, so every failure here is
// swallowed.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';

export default function useKeepAwake(active) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined;

    let lock = null;
    let stopped = false;

    const take = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const taken = await navigator.wakeLock.request('screen');
        // Left the task while the device was still answering.
        if (stopped) taken.release().catch(() => {});
        else lock = taken;
      } catch {
        // Refused (battery saver) or not allowed: the screen sleeps as usual.
      }
    };

    take();
    document.addEventListener('visibilitychange', take);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', take);
      lock?.release?.().catch(() => {});
    };
  }, [active]);
}
