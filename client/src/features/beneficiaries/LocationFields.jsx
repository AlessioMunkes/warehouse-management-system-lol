// ─────────────────────────────────────────────────────────────
// client/src/features/beneficiaries/LocationFields.jsx
//
// Where a centre is, as part of adding or editing it: its street address
// and suburb, and its pin on the Impact map.
//
//   Find on map   looks the typed address up once on OpenStreetMap and
//                 drops the pin near it (placeLookupAPI.js)
//   Drop a pin    opens a map in a pop-up: click where the centre is,
//                 drag the pin to correct it, then Use this pin
//
// Controlled: `value` is { address, suburb, lat, lng } and `onChange`
// receives the whole of it. The page saves it with the location
// endpoint (centreLocation.service.js), after the centre itself.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { findPlace } from '../../services/placeLookupAPI';
import LocationPicker from '../impactMap/LocationPicker';
import { hasPin } from './beneficiaryLocation';

const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

function PinDialog({ initial, name, onUse, onClose }) {
  const [pin, setPin] = useState(hasPin(initial) ? { lat: initial.lat, lng: initial.lng } : null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Drop a pin</DialogTitle>
          <DialogDescription>Click the map where {name || 'the centre'} is. Drag the pin to correct it.</DialogDescription>
        </DialogHeader>
        <div className="[&_[role=region]]:h-[22rem]">
          <LocationPicker lat={pin?.lat ?? null} lng={pin?.lng ?? null} onChange={setPin} label={`Place ${name || 'the centre'} on the map`} />
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {pin ? `${pin.lat}, ${pin.lng}` : 'No pin yet.'}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={!pin} onClick={() => onUse(pin)}>Use this pin</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LocationFields({ value, onChange, name }) {
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState(null);
  const [picking, setPicking] = useState(false);

  const set = (patch) => onChange({ ...value, ...patch });

  const find = async () => {
    const query = [value.address, value.suburb, 'Cape Town'].map((s) => String(s ?? '').trim()).filter(Boolean).join(', ');
    if (!String(value.address ?? '').trim() && !String(value.suburb ?? '').trim()) {
      setMessage('Type the address or suburb first.');
      return;
    }
    setFinding(true);
    setMessage(null);
    try {
      const hit = await findPlace(query);
      if (!hit) setMessage('Not found on the map. Use Drop a pin instead.');
      else {
        set({ lat: round6(hit.lat), lng: round6(hit.lng) });
        setMessage('Pin placed near the address. Check it with Drop a pin if you are not sure.');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setFinding(false);
    }
  };

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-medium">Location</legend>
      <Field>
        <FieldLabel htmlFor="beneficiary-address">Street address</FieldLabel>
        <Input id="beneficiary-address" maxLength={200} value={value.address ?? ''} onChange={(e) => set({ address: e.target.value })} placeholder="12 Ncumo Road" />
      </Field>
      <Field>
        <FieldLabel htmlFor="beneficiary-suburb">Suburb</FieldLabel>
        <Input id="beneficiary-suburb" maxLength={80} value={value.suburb ?? ''} onChange={(e) => set({ suburb: e.target.value })} placeholder="Harare, Khayelitsha" />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={find} disabled={finding}>
          <Search /> {finding ? 'Finding…' : 'Find on map'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
          <MapPin /> {hasPin(value) ? 'Move the pin' : 'Drop a pin'}
        </Button>
        {hasPin(value) ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => { set({ lat: null, lng: null }); setMessage(null); }}>
            <X /> Clear pin
          </Button>
        ) : null}
      </div>
      <FieldDescription role="status">
        {message ?? (hasPin(value)
          ? `Pin at ${value.lat}, ${value.lng}. It shows on the Impact map.`
          : 'No pin yet: the centre is not drawn on the Impact map.')}
      </FieldDescription>

      {picking ? (
        <PinDialog
          initial={value}
          name={name}
          onUse={(pin) => { set(pin); setMessage(null); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </fieldset>
  );
}
