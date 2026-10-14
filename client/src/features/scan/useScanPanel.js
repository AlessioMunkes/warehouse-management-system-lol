// ─────────────────────────────────────────────────────────────
// client/src/features/scan/useScanPanel.js
//
// The state both scan panels (the volunteer's and the worker's) share:
// whether the camera is open, whether it has started or is not
// available, and the one line saying what the last scan did.
//
// The panels differ only in their look and in what a good scan does.
// ─────────────────────────────────────────────────────────────
import { useCallback, useMemo, useState } from 'react';
import { parseSlipCode } from './slipCode';

export default function useScanPanel() {
  const [open, setOpen] = useState(false);
  // 'starting' until the camera is showing, 'live' while it is, and
  // 'unavailable' (with a reason) when it cannot be used.
  const [phase, setPhase] = useState('starting');
  const [reason, setReason] = useState(null);
  // What the last scan or lookup said: { key } for a message the panel
  // translates, { text } for one the server wrote.
  const [message, setMessage] = useState(null);
  const [looking, setLooking] = useState(false);

  const openPanel = useCallback(() => {
    setPhase('starting');
    setReason(null);
    setMessage(null);
    setLooking(false);
    setOpen(true);
  }, []);
  const closePanel = useCallback(() => setOpen(false), []);

  const cameraHandlers = useMemo(() => ({
    onReady: () => setPhase('live'),
    onUnavailable: (why) => { setReason(why); setPhase('unavailable'); },
  }), []);

  // One read, from the camera or the typed box: understand it, then hand
  // the pallet to `follow`. Anything that is not one of our codes is a
  // friendly "this isn't a pallet code", and a failed follow shows the
  // server's own words.
  const handleRead = useCallback(async (text, follow) => {
    const parsed = parseSlipCode(text);
    if (!parsed) {
      setMessage({ key: 'notPallet' });
      return false;
    }
    setMessage(null);
    setLooking(true);
    try {
      await follow(parsed);
      return true;
    } catch (err) {
      setMessage({ text: err?.message || '' });
      return false;
    } finally {
      setLooking(false);
    }
  }, []);

  return { open, openPanel, closePanel, phase, reason, message, looking, cameraHandlers, handleRead };
}
