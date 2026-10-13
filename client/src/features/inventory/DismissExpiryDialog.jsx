// ─────────────────────────────────────────────────────────────
// client/src/features/inventory/DismissExpiryDialog.jsx
//
// A manager says the expiry warning for one delivery is wrong: the stock
// was used, or checked and is fine. Which deliveries are still on the
// shelf is an estimate, and this is how the estimate is corrected. The
// reason is required and goes in the log with who and when; the warning
// then stops showing on every screen and is not sent again.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fmtQtyUnit } from '@/lib/stockWording';

export const MAX_REASON = 500;

export default function DismissExpiryDialog({ product, batch, expiresOn, onConfirm, onClose, saving = false, error = null }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = reason.trim() === '';

  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (missing || saving) return;
    onConfirm(reason.trim());
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Dismiss expiry warning · {product.name}</DialogTitle>
            <DialogDescription>
              The delivery with use-by {expiresOn}
              {batch.quantityLeft !== null ? `, about ${fmtQtyUnit(batch.quantityLeft, batch.unit)} left` : ''}.
              The warning stops showing on every screen and is not sent again. You can bring it back later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="dismiss-reason">Why is this warning wrong?</Label>
            <Textarea
              id="dismiss-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_REASON}
              rows={3}
              placeholder="For example: checked the shelf, this delivery is all gone"
              aria-invalid={touched && missing ? 'true' : undefined}
              aria-describedby={touched && missing ? 'dismiss-reason-error' : undefined}
              autoFocus
            />
            {touched && missing ? (
              <p id="dismiss-reason-error" role="alert" className="text-xs text-danger">Say why the warning is being dismissed.</p>
            ) : null}
          </div>

          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Dismissing...' : 'Dismiss warning'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
