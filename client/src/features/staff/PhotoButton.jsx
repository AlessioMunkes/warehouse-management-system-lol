// ─────────────────────────────────────────────────────────────
// client/src/features/staff/PhotoButton.jsx
//
// "Add a photo": opens the phone's camera, shrinks the picture and saves
// it against one record (a flagged slip item, a delivery's order).
//
// Optional everywhere it appears. Nothing waits on it: the photo is
// saved the moment it is taken, on its own, so a worker who takes one
// and then cancels the flag has still not lost anything, and one who
// skips it is not held up.
//
// It says what happened in words: how many are saved, that one is
// waiting on the phone when there is no signal, or that it failed.
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { shrinkPhoto, uploadPhoto } from '../../services/photoAPI';
import { useT } from '../../translations';

// `hint` is the line under the button before a photo is taken; `hintKey`
// is the same as a key in translations/messages.js, for a screen that has no
// translator of its own.
export default function PhotoButton({ entityType, entityId, hint, hintKey }) {
  const t = useT();
  const input = useRef(null);
  const [saved, setSaved] = useState(0);
  const [onPhone, setOnPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const take = async (event) => {
    const file = event.target.files?.[0];
    // Cleared so choosing the same picture again still fires a change.
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const dataUrl = await shrinkPhoto(file);
      const result = await uploadPhoto({ entityType, entityId, dataUrl });
      if (result?.queued) setOnPhone(true);
      setSaved((n) => n + 1);
    } catch (err) {
      setError(err?.message === 'not-a-photo' ? t('photo.notAPhoto') : (err?.status ? err.message : t('photo.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stf-photo">
      {/* capture="environment": the back camera, straight away, on a
          phone. A laptop ignores it and offers a file instead. */}
      <input
        ref={input} type="file" accept="image/*" capture="environment"
        className="stf-photo-input" onChange={take} tabIndex={-1} aria-hidden="true"
      />
      <button type="button" className="stf-btn stf-btn-secondary stf-photo-btn" disabled={busy} onClick={() => input.current?.click()}>
        <Camera className="size-5" aria-hidden="true" />
        {busy ? t('photo.saving') : saved > 0 ? t('photo.another') : t('photo.add')}
      </button>
      <p className="stf-field-hint" role="status">
        {error ? <span className="stf-photo-error">{error}</span>
          : onPhone ? t('photo.savedOnPhone')
            : saved > 0 ? t.n('photo.saved', saved)
              : hint ?? (hintKey ? t(hintKey) : null)}
      </p>
    </div>
  );
}
