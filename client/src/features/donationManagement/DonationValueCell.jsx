// ─────────────────────────────────────────────────────────────
// features/donationManagement/DonationValueCell.jsx
//
// A donation's value in the Section 18A queue, and whether anyone has
// checked it. The person recording a donation can have the system
// estimate the value from the items; a manager verifies it here, or
// corrects it, before a certificate goes out on it. A typed value can
// be verified too. Once the certificate is issued the value is what it
// says, and nothing changes it.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const rand = (v) => (v == null || !Number.isFinite(Number(v)) ? '-' : `R${Number(v).toFixed(2)}`);
const when = (iso) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' });

export default function DonationValueCell({ donation, onVerify }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(donation.estimated_value_zar ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const issued = donation.section_18a_status === 'issued';
  const verified = Boolean(donation.value_verified_at);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onVerify(donation.id, Number(value));
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Could not verify the value.');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <Input
            type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)}
            aria-label={`Value of donation ${donation.id}`} className="h-8 w-28 text-right"
          />
          <Button type="button" size="sm" disabled={busy || value === ''} onClick={save}>Confirm</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
        </div>
        {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums">{rand(donation.estimated_value_zar)}</span>
      {verified ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <BadgeCheck className="size-3.5" aria-hidden="true" />
          Verified{donation.value_verified_by_name ? ` by ${donation.value_verified_by_name}` : ''}, {when(donation.value_verified_at)}
        </span>
      ) : donation.value_estimated ? (
        <span className="text-xs text-warn">Estimated from the items</span>
      ) : null}
      {!verified && !issued && onVerify ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          Verify value
        </Button>
      ) : null}
    </div>
  );
}
