// ─────────────────────────────────────────────────────────────
// client/src/features/impactMap/CentreLocationPanel.jsx
//
// One centre's location, opened from the Centre locations list: its
// address and suburb, and the pin on a map. Find looks the typed address
// up once and drops the pin near it; clicking the map or dragging the
// pin puts it exactly. Nothing is saved until Save location.
//
// A pin found by research (the one-off script) says where it came from,
// so an admin knows which pins are only "the middle of the suburb" and
// worth checking. Saving a moved pin marks it as placed by hand, and
// the script never overwrites one of those.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import DetailPanel from '@/components/ui/detail-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatShortDateTime } from '@/lib/dates';
import { findPlace } from '../../services/placeLookupAPI';
import LocationPicker from './LocationPicker';
import { SOURCE_LABEL, cohortLabel } from './impactView';

export default function CentreLocationPanel({ centre, onSave, onClose, isSaving = false }) {
  const [address, setAddress] = useState(centre.address ?? '');
  const [suburb, setSuburb] = useState(centre.suburb ?? '');
  const [pin, setPin] = useState(centre.lat === null ? null : { lat: centre.lat, lng: centre.lng });
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState(null);

  const find = async () => {
    const query = [address, suburb, 'Cape Town'].map((s) => s.trim()).filter(Boolean).join(', ');
    if (!address.trim() && !suburb.trim()) { setMessage('Type the address or suburb first.'); return; }
    setFinding(true);
    setMessage(null);
    try {
      const hit = await findPlace(query);
      if (!hit) setMessage('Not found on the map. Click the map where the centre is.');
      else { setPin({ lat: Math.round(hit.lat * 1e6) / 1e6, lng: Math.round(hit.lng * 1e6) / 1e6 }); setMessage('Pin placed near the address. Check it, drag it if needed, then save.'); }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setFinding(false);
    }
  };

  const save = (e) => {
    e?.preventDefault();
    onSave({ address: address.trim() || null, suburb: suburb.trim() || null, lat: pin?.lat ?? null, lng: pin?.lng ?? null });
  };

  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={[cohortLabel(centre.cohort), centre.isActive ? null : 'Inactive'].filter(Boolean).join(' · ')}
      title={centre.name}
      actions={(
        <>
          <Button type="button" size="sm" onClick={save} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save location'}</Button>
          <Button type="button" size="sm" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
        </>
      )}
    >
      <form onSubmit={save} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="centre-address">Street address</Label>
          <Input id="centre-address" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 12 Ncumo Road" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="centre-suburb">Suburb</Label>
          <div className="flex gap-2">
            <Input id="centre-suburb" value={suburb} maxLength={80} onChange={(e) => setSuburb(e.target.value)} placeholder="e.g. Harare, Khayelitsha" />
            <Button type="button" variant="outline" onClick={find} disabled={finding}>
              <Search /> {finding ? 'Finding…' : 'Find'}
            </Button>
          </div>
        </div>
      </form>

      <section className="space-y-2" aria-label="Pin">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">Pin</p>
          {pin ? (
            <Button type="button" size="xs" variant="ghost" onClick={() => setPin(null)}><X /> Clear pin</Button>
          ) : null}
        </div>
        <LocationPicker lat={pin?.lat ?? null} lng={pin?.lng ?? null} onChange={setPin} label={`Place ${centre.name} on the map`} />
        <p className="text-xs text-muted-foreground" role="status">
          {message ?? (pin ? `${pin.lat}, ${pin.lng}. Drag the pin to move it.` : 'Click the map where the centre is, or type the address and choose Find.')}
        </p>
      </section>

      {centre.source ? (
        <dl className="space-y-1 text-xs text-muted-foreground">
          <div><dt className="inline">Pin: </dt><dd className="inline">{SOURCE_LABEL[centre.source] ?? centre.source}</dd></div>
          {centre.note ? <div><dt className="inline">Source: </dt><dd className="inline break-words">{centre.note}</dd></div> : null}
          {centre.updatedAt ? (
            <div><dt className="inline">Updated: </dt><dd className="inline">{formatShortDateTime(centre.updatedAt)}{centre.updatedByName ? ` by ${centre.updatedByName}` : ''}</dd></div>
          ) : null}
        </dl>
      ) : null}
    </DetailPanel>
  );
}
