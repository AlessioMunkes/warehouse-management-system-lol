// ─────────────────────────────────────────────────────────────
// client/src/features/scan/useCameraScan.jsx
//
// "Camera" beside a barcode box on the admin and manager screens, which
// use the office look rather than the floor's (ProductScanBar). Opens
// the camera in product mode under the box; the first code it reads is
// handed to onCode and the camera closes, because on these screens one
// code is being entered, not a run of boxes counted.
//
// A laptop has no back camera; the front one is used instead, which is
// fine for holding a pack up to it. When there is no camera at all, or
// it is blocked, it says so and the box still takes a typed code or a
// USB scanner.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PalletScanner from './PalletScanner';

const TROUBLE = {
  denied: 'The camera is blocked. Allow it in the browser, or type the numbers under the bars.',
  noCamera: 'There is no camera on this device. Type the numbers under the bars, or use a USB scanner.',
  failed: 'The camera could not start. Type the numbers under the bars instead.',
};

// The button and the camera view, as two parts, so a form can put the
// button beside its box and the view under it.
export default function useCameraScan(onCode) {
  const [open, setOpen] = useState(false);
  const [trouble, setTrouble] = useState(null);

  const button = (
    <Button
      type="button" variant="outline" aria-pressed={open}
      onClick={() => { setOpen((o) => !o); setTrouble(null); }}
    >
      {open ? <X /> : <Camera />}
      {open ? 'Close camera' : 'Camera'}
    </Button>
  );

  const view = open ? (
    trouble ? (
      <p role="status" className="text-sm text-muted-foreground">{TROUBLE[trouble] ?? TROUBLE.failed}</p>
    ) : (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Hold the barcode up to the camera.</p>
        <PalletScanner
          kind="product"
          label="Camera for barcodes"
          torchLabel="Torch"
          onCode={(text) => { setOpen(false); onCode(text); }}
          onUnavailable={setTrouble}
        />
      </div>
    )
  ) : null;

  return { button, view };
}
