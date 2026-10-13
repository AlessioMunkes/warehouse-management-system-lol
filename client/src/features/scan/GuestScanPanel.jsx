// ─────────────────────────────────────────────────────────────
// client/src/features/scan/GuestScanPanel.jsx
//
// "Scan pallet QR" for a signed-in volunteer, on the guest home beside
// the pallet list and the typed-code box.
//
// A scan follows the same roads the printed code does: a full link goes
// to the pallet preview (where they confirm and start), and the 6
// characters claim by code exactly as typing them does.
//
// If the camera cannot be used, this says so in a sentence and offers the
// typed code, which is on the same screen. It is never a blank box.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { useT } from '../../translations';
import { Button, Notice } from '../guest/GuestPrimitives';
import PalletScanner from './PalletScanner';
import useScanPanel from './useScanPanel';

// onToken(token): open the pallet preview. onCode(code): claim by code.
// Either may throw; the message is shown here. onTypeInstead: close the
// camera and put the cursor in the typed-code box.
export default function GuestScanPanel({ onToken, onCode, onTypeInstead, disabled = false }) {
  const t = useT();
  const panel = useScanPanel();
  const headingRef = useRef(null);
  const openButtonRef = useRef(null);
  const wasOpen = useRef(false);

  // Focus follows the panel: into its heading when it opens, back to the
  // button when it closes, so a keyboard or screen-reader user is never lost.
  useEffect(() => {
    if (panel.open) headingRef.current?.focus();
    else if (wasOpen.current) openButtonRef.current?.focus();
    wasOpen.current = panel.open;
  }, [panel.open]);

  const onRead = (text) => panel.handleRead(text, async (parsed) => {
    if (parsed.kind === 'token') onToken(parsed.token);
    else await onCode(parsed.code);
  });

  if (!panel.open) {
    return (
      <Button ref={openButtonRef} variant="secondary" onClick={panel.openPanel} disabled={disabled}>
        {t('guest.scan.button')}
      </Button>
    );
  }

  const unavailable = panel.phase === 'unavailable';
  const messageText = panel.message?.key ? t(`guest.scan.${panel.message.key}`) : panel.message?.text;

  return (
    <section className="gst-card gst-stack-tight" aria-labelledby="gst-scan-title">
      <h2 className="gst-card-title" id="gst-scan-title" ref={headingRef} tabIndex={-1}>
        {t('guest.scan.title')}
      </h2>

      {unavailable ? (
        <>
          <Notice tone="info">{t(`guest.scan.${panel.reason || 'failed'}`)}</Notice>
          <Button onClick={() => { panel.closePanel(); onTypeInstead(); }}>
            {t('guest.scan.typeInstead')}
          </Button>
        </>
      ) : (
        <>
          <p className="gst-card-meta">{t('guest.scan.hint')}</p>
          <PalletScanner
            label={t('guest.scan.title')}
            onCode={onRead}
            onReady={panel.cameraHandlers.onReady}
            onUnavailable={panel.cameraHandlers.onUnavailable}
          />
          {panel.phase === 'starting' ? <p className="gst-card-meta" role="status">{t('guest.scan.starting')}</p> : null}
        </>
      )}

      {panel.looking ? <p className="gst-card-meta" role="status">{t('guest.scan.looking')}</p> : null}
      {messageText ? <Notice tone="warn">{messageText}</Notice> : null}

      <Button variant="ghost" onClick={panel.closePanel}>{t('guest.scan.close')}</Button>
    </section>
  );
}
