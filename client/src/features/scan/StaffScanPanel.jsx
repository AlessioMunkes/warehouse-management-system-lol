// ─────────────────────────────────────────────────────────────
// client/src/features/scan/StaffScanPanel.jsx
//
// "Scan pallet QR" on the worker's packing screen, with the typed code
// beside it.
//
// Both roads end at the packing screen for that slip, where the claim,
// who is holding it and a finished or cancelled pallet are all dealt
// with already. Nothing is claimed here and no volunteer is created: the
// public look-up already carries the slip id, so no new endpoint is used.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode } from 'lucide-react';
import { useT } from '../../translations';
import { useAuth } from '../../context/AuthContext';
import { fetchSlipPreview, fetchSlipByCode } from '../../services/guestSlipAPI';
import { Button, Notice, TextField } from '../staff/StepPrimitives';
import PalletScanner from './PalletScanner';
import useScanPanel from './useScanPanel';
import { parseSlipCode, staffDestination } from './slipCode';

export default function StaffScanPanel() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const panel = useScanPanel();
  const headingRef = useRef(null);
  const openButtonRef = useRef(null);
  const wasOpen = useRef(false);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState(null);

  useEffect(() => {
    if (panel.open) headingRef.current?.focus();
    else if (wasOpen.current) openButtonRef.current?.focus();
    wasOpen.current = panel.open;
  }, [panel.open]);

  // Look the pallet up, then go to this person's screen for it.
  const follow = async (parsed) => {
    const slip = parsed.kind === 'token'
      ? await fetchSlipPreview(parsed.token)
      : await fetchSlipByCode(parsed.code);
    const to = staffDestination(user?.role, slip.id);
    if (!to) throw new Error(t('guest.slip.staffAdmin'));
    navigate(to);
  };

  const submitTyped = async (event) => {
    event.preventDefault();
    setTypedError(null);
    if (!parseSlipCode(typed)) {
      setTypedError(t('packing.scan.codeWrong'));
      return;
    }
    await panel.handleRead(typed, follow);
  };

  if (!panel.open) {
    return (
      <Button ref={openButtonRef} variant="secondary" onClick={panel.openPanel}>
        <QrCode size={18} aria-hidden="true" /> {t('packing.scan.button')}
      </Button>
    );
  }

  const unavailable = panel.phase === 'unavailable';
  const messageText = panel.message?.key ? t(`packing.scan.${panel.message.key}`) : panel.message?.text;

  return (
    <section className="stf-scan" aria-labelledby="stf-scan-title">
      <h2 className="stf-scan-title" id="stf-scan-title" ref={headingRef} tabIndex={-1}>
        {t('packing.scan.title')}
      </h2>

      {unavailable ? (
        <Notice tone="warn">{t(`packing.scan.${panel.reason || 'failed'}`)}</Notice>
      ) : (
        <>
          <p className="stf-scan-hint">{t('packing.scan.hint')}</p>
          <PalletScanner
            label={t('packing.scan.title')}
            onCode={(text) => panel.handleRead(text, follow)}
            onReady={panel.cameraHandlers.onReady}
            onUnavailable={panel.cameraHandlers.onUnavailable}
          />
          {panel.phase === 'starting' ? <p className="stf-scan-hint" role="status">{t('packing.scan.starting')}</p> : null}
        </>
      )}

      {panel.looking ? <p className="stf-scan-hint" role="status">{t('packing.scan.looking')}</p> : null}
      {messageText ? <Notice tone="warn">{messageText}</Notice> : null}

      <form className="stf-scan-code" onSubmit={submitTyped}>
        <TextField
          id="stf-scan-code"
          label={t('packing.scan.codeLabel')}
          value={typed}
          onChange={(value) => { setTyped(value); setTypedError(null); }}
          placeholder="a1b2c3"
          maxLength={6}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck="false"
        />
        {typedError ? <Notice tone="warn">{typedError}</Notice> : null}
        <Button type="submit" disabled={panel.looking || typed.trim().length === 0}>{t('packing.scan.codeFind')}</Button>
      </form>

      <Button variant="secondary" onClick={panel.closePanel}>{t('packing.scan.close')}</Button>
    </section>
  );
}
