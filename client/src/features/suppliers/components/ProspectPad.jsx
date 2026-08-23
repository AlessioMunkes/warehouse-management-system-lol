// ─────────────────────────────────────────────────────────────
// client/src/features/suppliers/components/ProspectPad.jsx
//
// The notepad. One always-visible input, everything else collapsed,
// because a lead captured in three seconds is a lead that gets
// captured at all. The paper donation form died of friction
// (Warehouse Visit 5.1) and this is the same shape of problem — the
// difference in strictness between this and SupplierForm is
// deliberate, not an oversight.
//
// The capture row is an InputGroup with an InputGroupButton addon
// rather than an Input beside a Button: the group already handles the
// shared border, focus ring and invalid state, and hand-rolling that
// spacing is how two inputs on the same screen end up 1px different.
//
// Nothing here validates beyond "there is a name". Duplicates are
// allowed — supplier_prospects has no UNIQUE on name for that reason.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput,
} from '@/components/ui/input-group';
import { Field, FieldGroup } from '@/components/ui/field';
import { Button }            from '@/components/ui/button';
import { Input }             from '@/components/ui/input';
import { Badge }             from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Plus, ChevronDown, ChevronUp, UserPlus, PhoneCall, Ban, Trash2,
} from 'lucide-react';

const STATUS_VARIANT = {
  open:      'secondary',
  contacted: 'default',
  rejected:  'outline',
  converted: 'outline',
};

export default function ProspectPad({
  prospects = [],
  busy = false,
  error = null,
  onAdd,
  onSetStatus,
  onConvert,
  onDelete,
}) {
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState({
    whatTheySupply: '', leadSource: '', contactPhone: '', notes: '',
  });

  const add = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), ...detail });
    setName('');
    setDetail({ whatTheySupply: '', leadSource: '', contactPhone: '', notes: '' });
    setExpanded(false);
  };

  const setDetailField = (key) => (e) =>
    setDetail((d) => ({ ...d, [key]: e.target.value }));

  return (
    <div className="space-y-5">
      {/* ── Capture ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <Field>
              <InputGroup>
                <InputGroupInput
                  value={name}
                  placeholder="Who are they? A name is enough."
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton onClick={add} disabled={busy || !name.trim()}>
                    <Plus />
                    Add
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronUp /> : <ChevronDown />}
                {expanded ? 'Hide extra detail' : 'Add detail (optional)'}
              </Button>
            </Field>

            {expanded ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input placeholder="What might they supply?"
                  value={detail.whatTheySupply} onChange={setDetailField('whatTheySupply')} />
                <Input placeholder="Where did this lead come from?"
                  value={detail.leadSource} onChange={setDetailField('leadSource')} />
                <Input placeholder="Phone"
                  value={detail.contactPhone} onChange={setDetailField('contactPhone')} />
                <Input placeholder="Notes"
                  value={detail.notes} onChange={setDetailField('notes')} />
              </div>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      {/* ── List ────────────────────────────────────────────── */}
      {prospects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No leads noted yet. Anything jotted here stays out of purchase orders and out of
          reporting until it is converted into a supplier.
        </p>
      ) : (
        <div className="space-y-3">
          {prospects.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    {p.whatTheySupply ? (
                      <p className="text-sm text-muted-foreground">{p.whatTheySupply}</p>
                    ) : null}
                    {p.leadSource ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Lead source: {p.leadSource}
                      </p>
                    ) : null}
                    {p.notes ? <p className="mt-2 text-sm">{p.notes}</p> : null}
                  </div>
                  <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'}>{p.status}</Badge>
                </div>

                {p.status === 'converted' ? (
                  // Kept rather than deleted: it is the record of where
                  // this supplier came from, which nobody remembers two
                  // years later.
                  <p className="mt-3 text-xs text-muted-foreground">
                    Converted into supplier #{p.convertedSupplierId}.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.status !== 'contacted' ? (
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => onSetStatus(p.id, 'contacted')}>
                        <PhoneCall />
                        Mark contacted
                      </Button>
                    ) : null}
                    {p.status !== 'rejected' ? (
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => onSetStatus(p.id, 'rejected')}>
                        <Ban />
                        Not for us
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" onClick={() => onConvert(p)}>
                      <UserPlus />
                      Register as supplier
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(p.id)}>
                      <Trash2 />
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
