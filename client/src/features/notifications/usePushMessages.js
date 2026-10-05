// ─────────────────────────────────────────────────────────────
// client/src/features/notifications/usePushMessages.js
//
// Listens to the service worker (public/push-sw.js) while the app is
// open:
//   push-received  a phone alert just came in: the bell and the
//                  Packing dot refresh now instead of on the next poll.
//   push-open      the worker tapped the alert: go where it points,
//                  inside the app that's already open (no reload).
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { announceNotificationsChanged } from './notificationMatrix';

export default function usePushMessages() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.type === 'push-received') announceNotificationsChanged();
      if (data.type === 'push-open' && typeof data.url === 'string' && data.url.startsWith('/')) {
        announceNotificationsChanged();
        navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}
