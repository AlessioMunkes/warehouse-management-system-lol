// ─────────────────────────────────────────────────────────────
// client/src/features/beneficiaries/KitchenList.jsx
//
// The Kitchens tab on Beneficiaries: soup kitchens and the Dignity
// Kitchen (migration 068), each with how many adults it feeds per
// collection. Adults served on the impact report counts that many
// adults, one meal each, for every collected pallet of the kitchen, so
// a kitchen with no adult count adds nothing there.
//
// A kitchen's pallets are raised on Picking slips, naming the kitchen;
// the name here is what they are matched on, so the slips already on
// record count once their kitchen is added with the same name.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { CookingPot, Loader2, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NativeSelect from '@/components/ui/native-select';
import ListCard from '@/components/ui/list-card';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import DetailPanel from '@/components/ui/detail-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { getKitchens, createKitchen, updateKitchen, KITCHEN_KIND_LABELS } from '@/services/kitchenAPI';

const BLANK = { kind: 'soup_kitchen', name: '', adultCount: '', contactName: '', contactPhone: '', address: '' };

function KitchenForm({ initial, busy, error, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => (initial
    ? { ...initial, adultCount: initial.adultCount ?? '' }
    : BLANK));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}
      {initial ? null : (
        <Field>
          <FieldLabel htmlFor="kitchen-kind">Type</FieldLabel>
          <NativeSelect id="kitchen-kind" value={form.kind} onChange={set('kind')}>
            <option value="soup_kitchen">Soup kitchen</option>
            <option value="dignity_kitchen">Dignity Kitchen</option>
          </NativeSelect>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="kitchen-name">Name</FieldLabel>
        <Input id="kitchen-name" value={form.name} maxLength={120} onChange={set('name')} />
        <FieldDescription>As it is named on its picking slips: that is how its pallets are matched to it.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="kitchen-adults">Adults fed per collection</FieldLabel>
        <Input id="kitchen-adults" type="number" min="0" step="1" inputMode="numeric" value={form.adultCount} onChange={set('adultCount')} />
        <FieldDescription>One meal each. Adults served on the impact report counts this for every pallet the kitchen collects.</FieldDescription>
      </Field>
      <div className="grid gap-7 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="kitchen-contact">Contact person</FieldLabel>
          <Input id="kitchen-contact" value={form.contactName} maxLength={120} onChange={set('contactName')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="kitchen-phone">Contact number</FieldLabel>
          <Input id="kitchen-phone" value={form.contactPhone} maxLength={40} onChange={set('contactPhone')} />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="kitchen-address">Address</FieldLabel>
        <Input id="kitchen-address" value={form.address} maxLength={500} onChange={set('address')} />
      </Field>
      <div className="flex gap-2">
        <Button
          type="button" disabled={busy || !form.name.trim()}
          onClick={() => onSubmit({
            ...(initial ? {} : { kind: form.kind }),
            name: form.name, adultCount: form.adultCount === '' ? null : Number(form.adultCount),
            contactName: form.contactName, contactPhone: form.contactPhone, address: form.address,
          })}
        >
          {busy ? <Loader2 className="animate-spin" /> : null} {initial ? 'Save changes' : 'Add kitchen'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </FieldGroup>
  );
}

export default function KitchenList({ canManage }) {
  const [kitchens, setKitchens] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);     // 'new' | kitchen
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = () => getKitchens({ includeInactive: true })
    .then((rows) => { setKitchens(rows); setError(null); })
    .catch((err) => setError(err.message || 'Could not load the kitchens.'));

  useEffect(() => {
    let cancelled = false;
    getKitchens({ includeInactive: true })
      .then((rows) => { if (!cancelled) setKitchens(rows); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the kitchens.'); });
    return () => { cancelled = true; };
  }, []);

  const save = async (values) => {
    setBusy(true);
    setFormError(null);
    try {
      if (editing === 'new') await createKitchen(values);
      else await updateKitchen(editing.id, values);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err.message || 'Could not save the kitchen.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (k) => {
    try {
      await updateKitchen(k.id, { isActive: !k.isActive });
      await load();
    } catch (err) {
      setError(err.message || 'Could not change the kitchen.');
    }
  };

  return (
    <div className="space-y-3">
      <ErrorBanner message={error} />
      <ListCard
        header={(
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Soup kitchens and the Dignity Kitchen, and how many adults each feeds per collection.
            </p>
            {canManage ? (
              <Button type="button" size="sm" onClick={() => { setFormError(null); setEditing('new'); }}>
                <Plus /> Add kitchen
              </Button>
            ) : null}
          </div>
        )}
      >
        {!kitchens && !error ? (
          <div className="space-y-2 p-4" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : kitchens && kitchens.length === 0 ? (
          <EmptyState icon={CookingPot} title="No kitchens yet" description="Add the soup kitchens and the Dignity Kitchen, with the adults each feeds, so adults served can count them." />
        ) : kitchens ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-5">Kitchen</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Adults per collection</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Pallets</TableHead>
                <TableHead className="pr-4 sm:pr-5"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kitchens.map((k) => (
                <TableRow key={k.id} className={k.isActive ? undefined : 'text-muted-foreground'}>
                  <TableCell className="pl-4 font-medium sm:pl-5">{k.name}{k.isActive ? '' : ' (inactive)'}</TableCell>
                  <TableCell>{KITCHEN_KIND_LABELS[k.kind] ?? k.kind}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {k.adultCount === null ? <span className="text-warn">Not set</span> : k.adultCount.toLocaleString('en-ZA')}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {k.contactName || '-'}
                    {k.contactPhone ? <span className="block text-xs text-muted-foreground">{k.contactPhone}</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{k.slipCount}</TableCell>
                  <TableCell className="whitespace-nowrap pr-4 text-right sm:pr-5">
                    {canManage ? (
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" aria-label={`Edit ${k.name}`} onClick={() => { setFormError(null); setEditing(k); }}>
                          <Pencil /> Edit
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => toggleActive(k)}>
                          {k.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </ListCard>

      {editing ? (
        <DetailPanel open onClose={() => setEditing(null)} eyebrow={editing === 'new' ? null : 'Edit'} title={editing === 'new' ? 'Add a kitchen' : editing.name}>
          <KitchenForm
            initial={editing === 'new' ? null : editing}
            busy={busy} error={formError}
            onSubmit={save} onCancel={() => setEditing(null)}
          />
        </DetailPanel>
      ) : null}
    </div>
  );
}
