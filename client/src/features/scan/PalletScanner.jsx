// ─────────────────────────────────────────────────────────────
// client/src/features/scan/PalletScanner.jsx
//
// The camera, and nothing else: it shows what the camera sees, reads QR
// codes off it, and hands each distinct read to onCode. What a code MEANS
// is slipCode.js's job and what to do about it is the panel's.
//
// The library is html5-qrcode, pinned to an exact version. Not the
// browser's own BarcodeDetector: iPhone Safari does not have it, and
// volunteers are as likely to hold an iPhone as anything else. It is
// loaded only when a scanner is opened, so nobody who never scans pays
// for it in the main bundle.
//
// THE CAMERA MAY NOT BE THERE. Permission refused, no camera, an
// insecure page, a browser that cannot start it, a start that hangs: all
// of these end in onUnavailable(reason) so the panel can say so and offer
// the typed code. Nothing here may leave a blank box or a spinner that
// never stops, so a start that has not answered in START_TIMEOUT_MS is
// treated as failed (and stopped, if it comes up late).
//
// Reasons: 'denied' (permission refused), 'noCamera', 'failed'.
//
// Motion: the library's own scanning UI is not used (only its camera and
// decoder), and nothing here animates.
// ─────────────────────────────────────────────────────────────
import { useEffect, useId, useRef } from 'react';
import { classifyCameraError } from './cameraErrors';

// Long enough for someone to read a permission prompt and answer it.
const START_TIMEOUT_MS = 20000;
// After a read, the same screen does not get another for this long: a
// phone held over a code reads it dozens of times a second.
const REPEAT_QUIET_MS = 1500;

export default function PalletScanner({ onCode, onUnavailable, onReady, label }) {
  const reactId = useId();
  const elementId = `pallet-scanner-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // The latest handlers, so the camera is not restarted when a parent
  // re-renders with new function identities.
  const handlers = useRef({ onCode, onUnavailable, onReady });
  useEffect(() => { handlers.current = { onCode, onUnavailable, onReady }; });

  useEffect(() => {
    let cancelled = false;
    let scanner = null;
    let started = false;
    let settled = false;
    let quietUntil = 0;
    let timer = null;

    const stop = async () => {
      if (!scanner || !started) return;
      started = false;
      try { await scanner.stop(); } catch { /* already stopped */ }
      try { scanner.clear(); } catch { /* nothing to clear */ }
    };

    const unavailable = (reason) => {
      if (settled || cancelled) return;
      settled = true;
      window.clearTimeout(timer);
      handlers.current.onUnavailable?.(reason);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        // An insecure page (http, not localhost) or a browser without a camera API.
        unavailable('failed');
        return;
      }

      timer = window.setTimeout(() => {
        unavailable('failed');
        cancelled = true;            // if it comes up late, it is stopped below
      }, START_TIMEOUT_MS);

      let lib;
      try {
        lib = await import('html5-qrcode');
      } catch {
        unavailable('failed');
        return;
      }
      if (cancelled) return;

      try {
        scanner = new lib.Html5Qrcode(elementId, {
          formatsToSupport: [lib.Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        });
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (width, height) => {
              const side = Math.floor(Math.min(width, height) * 0.7);
              return { width: side, height: side };
            },
          },
          (text) => {
            const now = Date.now();
            if (cancelled || now < quietUntil) return;
            quietUntil = now + REPEAT_QUIET_MS;
            handlers.current.onCode?.(text);
          },
          () => { /* a frame with no code in it: the normal case, not an error */ },
        );
        started = true;
        if (cancelled) { await stop(); return; }
        settled = true;
        window.clearTimeout(timer);
        handlers.current.onReady?.();
      } catch (err) {
        unavailable(classifyCameraError(err));
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop();
    };
  }, [elementId]);

  return <div id={elementId} className="scan-view" role="img" aria-label={label} />;
}
