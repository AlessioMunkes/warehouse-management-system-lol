// ─────────────────────────────────────────────────────────────
// client/src/components/ui/loading-screen.jsx
//
// THE LOADING SCREEN, one for the whole app. The Batches mark inside a
// turning ring with a word under it, over whatever is on screen.
//
// It is used in three places and looks the same in each:
//   GlobalLoading   (mounted once in App.jsx) while a request someone
//                   caused is taking long enough to notice. See
//                   services/loading.js for which requests count.
//   a page's file   the first time a screen is opened and its code is
//                   still arriving (the Suspense fallback in App.jsx)
//   the session     while the app is asking the server who is signed in
//                   (ProtectedRoute.jsx). `solid`, because there is
//                   nothing behind it yet to show through.
//
// It never takes a tap. A request that hangs must not leave someone
// locked out of a screen they could otherwise leave, so the veil is
// see-through to the pointer and the page under it still works.
//
// Quick loads show nothing: the screen waits a moment before it
// appears, and once it has appeared it stays long enough to be read
// instead of flickering.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import batchesLogo from '../../assets/Batches_Logo.jpeg';
import { useT } from '../../translations';
import { isWaiting, subscribeLoading, markIntent } from '../../services/loading';

// Shorter than this and a load is not worth a screen.
const SHOW_AFTER_MS = 400;
// Once shown, it stays at least this long.
const STAY_AT_LEAST_MS = 450;

export default function LoadingScreen({ label, solid = false, delayed = false }) {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4
        ${solid ? 'bg-background' : 'bg-background/75 backdrop-blur-[2px]'} ${delayed ? 'loading-screen-delayed' : 'loading-screen-in'}`}
    >
      <div className="relative flex size-20 items-center justify-center">
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-[3px] border-line" />
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-ink motion-safe:animate-spin" />
        <img src={batchesLogo} alt="" className="size-12 rounded-xl object-cover" />
      </div>
      <p className="text-sm font-semibold text-ink">{label ?? t('common.loading')}</p>
    </div>
  );
}

/**
 * The screen for requests. Mounted once, inside the router: changing
 * screen is an action, so the requests the new screen makes count.
 */
export function GlobalLoading() {
  const waiting = useSyncExternalStore(subscribeLoading, isWaiting, () => false);
  const [shown, setShown] = useState(false);
  const [since, setSince] = useState(0);
  const location = useLocation();

  useEffect(() => { markIntent(); }, [location.pathname, location.search]);

  useEffect(() => {
    if (waiting && !shown) {
      const timer = setTimeout(() => { setShown(true); setSince(Date.now()); }, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    if (!waiting && shown) {
      const timer = setTimeout(() => setShown(false), Math.max(0, STAY_AT_LEAST_MS - (Date.now() - since)));
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [waiting, shown, since]);

  return shown ? <LoadingScreen /> : null;
}
