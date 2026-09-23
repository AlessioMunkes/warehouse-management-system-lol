// ─────────────────────────────────────────────────────────────
// client/src/pages/PickingSlipManagementPage.jsx
//
// One focused thing at a time, same pattern as every other directory
// page in this app (BeneficiaryDirectoryPage.jsx / ProductManagement
// Page.jsx): a search + list view, and quick actions that switch the
// page into a single form rather than piling every form onto the
// screen at once.
//
// Quick actions are ordered by how often a manager actually reaches
// for them: generating the week's slips is the recurring weekly job;
// creating a new slip is the exception (a late registration, a
// correction, a make-up delivery).
//
// THERE IS NO "PICK A WORKER" CONTROL. A manager doesn't decide who
// packs a pallet — a slip is either on the floor (unclaimed, status
// 'pending') or claimed by whoever tapped it first. The only lever a
// manager has, on the slip itself once it's open, is releasing a
// claimed pallet back to the floor (releaseSlip) — a shift ends,
// someone goes home sick, the wrong pallet got tapped. That is the
// one assignment-related action this page offers.
//
// Editing (dispatch date, cohort, product lines) is only reachable
// while a slip is still 'pending' — the repository enforces this
// inside the same row lock every other mutation here uses, since
// 'pending' is also the only state where every item on the slip is
// guaranteed to still be untouched (confirmItem/flagItem both require
// the slip to already be claimed first). Once someone's picked it up,
// the Edit button disappears from SlipDetail and editSlip would 409
// anyway — a packer mid-count should never see their list rewritten
// under them.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import ManagerLayout   from '../features/taskdashboard/components/ManagerLayout';
import beneficiaryAPI from '../services/beneficiaryAPI';
import productAPI from '../services/productAPI';
import {
  fetchPickingSlips, fetchPickingSlip, fetchAssignableWorkers,
  generateSlips, createSlip, releaseSlip, editSlip, addSecondPacker,
} from '../services/pickingAPI';

import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input }    from '@/components/ui/input';
import { Button }   from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, CalendarPlus, PackagePlus, X, ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';

const COHORT_OPTIONS = [
  { value: 'week1', label: 'Week 1' },
  { value: 'week2', label: 'Week 2' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

// Human wording for the two things a manager actually needs to know
// at a glance: is this on the floor, or does someone already have it.
// Anything past that (complete/dispatched/cancelled) reads as itself —
// there's no "who holds it" question left to answer by then.
const statusLabel = (slip) => {
  if (slip.status === 'pending') return 'Assigned to floor';
  if (slip.status === 'in_progress') return `Claimed by ${slip.packer_name || 'a worker'}`;
  if (slip.status === 'complete') return 'Complete';
  if (slip.status === 'collected' || slip.status === 'dispatched') return 'Dispatched';
  if (slip.status === 'cancelled') return 'Cancelled';
  return slip.status;
};

const ErrorBanner = ({ message }) => (
  <div className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm">
    {message}
  </div>
);

const SuccessBanner = ({ message }) => (
  <div className="p-4 rounded-[4px] bg-[#f0f9f0] border-2 border-[#3a8a3a] text-[#2b3336] text-sm">
    {message}
  </div>
);

// ── Detail panel ──────────────────────────────────────────────
// Status IS the assignment state now — see statusLabel above — so
// there's no separate "Assigned to" field to keep in sync with it.
// The only assignment-related action here is releasing an in-progress
// slip back to the floor: pending/unclaimed already means "on the
// floor," nothing to do; complete/dispatched/cancelled is read-only,
// this page is for organising the queue, not pulling work out from
// under whoever already finished it.
const SlipDetail = ({
  slip, releasing, onRelease, onEdit,
  workers, secondChoice, onSecondChoice, onAddSecond, addingSecond, onClose,
}) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>{slip.ecd_name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {slip.cohort === 'week1' ? 'Week 1' : 'Week 2'} · {slip.dispatch_date}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {/* Only while pending — once claimed, a packer may already be
            looking at these lines, same "don't pull the rug out"
            reasoning as the release control below. */}
        {slip.status === 'pending' ? (
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-2">
            <Badge variant="outline">{statusLabel(slip)}</Badge>
            {slip.status === 'in_progress' ? (
              <Button type="button" size="sm" variant="outline" disabled={releasing} onClick={onRelease}>
                {releasing ? 'Assigning…' : 'Assign to floor'}
              </Button>
            ) : null}
          </dd>
        </div>
        {/* Only meaningful once a primary holds the slip — a second
            packer with nobody to help does not mean anything (see
            picking.repository.js's addSecondPacker). Read-only once
            both slots are filled, same "don't pull work out from
            under whoever already started it" rule as the primary
            field above. */}
        {slip.status !== 'pending' ? (
          <div>
            <dt className="text-muted-foreground">Second packer</dt>
            <dd>
              {slip.assigned_to_2 ? (
                slip.packer_name_2 || 'Assigned'
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <Select value={secondChoice || undefined} onValueChange={onSecondChoice}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Add a helper" /></SelectTrigger>
                    <SelectContent>
                      {workers
                        .filter((w) => w.id !== slip.assigned_to)
                        .map((w) => (
                          <SelectItem key={w.id} value={String(w.id)}>{w.first_name} {w.last_name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="outline" disabled={!secondChoice || addingSecond} onClick={onAddSecond}>
                    {addingSecond ? 'Adding' : 'Add'}
                  </Button>
                </div>
              )}
            </dd>
          </div>
        ) : null}
        <div><dt className="text-muted-foreground">Pallet ref</dt><dd>{slip.pallet_ref || '—'}</dd></div>
        <div><dt className="text-muted-foreground">Progress</dt><dd>{slip.confirmed_items}/{slip.total_items} confirmed</dd></div>
      </dl>
      {slip.items?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slip.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.product_name}</TableCell>
                <TableCell className="text-muted-foreground">{item.required_quantity} {item.unit}</TableCell>
                <TableCell><Badge variant="outline">{item.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </CardContent>
  </Card>
);

export default function PickingSlipManagementPage() {
  const [mode, setMode] = useState('list'); // list | generate | create | edit

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [products, setProducts] = useState([]);

  const [viewDate, setViewDate] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [slips, setSlips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [releasing, setReleasing] = useState(false);
  const [secondChoice, setSecondChoice] = useState('');
  const [addingSecond, setAddingSecond] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [genForm, setGenForm] = useState({ dispatchDate: todayISO(), cohort: '' });
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState(null);

  const [adHocForm, setAdHocForm] = useState({ ecdId: '', dispatchDate: todayISO(), cohort: '', force: false });
  const [adHocBusy, setAdHocBusy] = useState(false);
  const [adHocError, setAdHocError] = useState(null);

  const [editForm, setEditForm] = useState({ dispatchDate: '', cohort: '', force: false, items: [] });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState(null);

  const loadSlips = useCallback(async () => {
    setError(null);
    try {
      setSlips(await fetchPickingSlips({ dispatchDate: viewDate }));
    } catch (err) {
      setError(err.message || 'Could not load picking slips.');
    }
  }, [viewDate]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadSlips().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [loadSlips]);

  useEffect(() => {
    let cancelled = false;
    beneficiaryAPI.getBeneficiaries({ includeInactive: false })
      .then((rows) => { if (!cancelled) setBeneficiaries(rows); })
      .catch(() => { /* surfaced inline only where the picker is used */ });
    fetchAssignableWorkers()
      .then((rows) => { if (!cancelled) setWorkers(rows); })
      .catch(() => { /* surfaced inline only where the picker is used */ });
    productAPI.getProducts({ includeInactive: false })
      .then((rows) => { if (!cancelled) setProducts(rows); })
      .catch(() => { /* surfaced inline only where the picker is used */ });
    return () => { cancelled = true; };
  }, []);

  const openSlip = async (slipId) => {
    setError(null);
    setSecondChoice('');
    try {
      setSelected(await fetchPickingSlip(slipId));
    } catch (err) { setError(err.message); }
  };

  const release = async () => {
    if (!selected) return;
    setReleasing(true); setError(null);
    try {
      await releaseSlip(selected.id);
      await loadSlips();
      await openSlip(selected.id);
    } catch (err) { setError(err.message); } finally { setReleasing(false); }
  };

  const addSecond = async () => {
    if (!secondChoice || !selected) return;
    setAddingSecond(true); setError(null);
    try {
      await addSecondPacker(selected.id, Number(secondChoice));
      await loadSlips();
      await openSlip(selected.id);
    } catch (err) { setError(err.message); } finally { setAddingSecond(false); }
  };

  // Pre-fills from the currently-open slip — editSlip's `items` fully
  // replaces the line list, so the form always starts from exactly
  // what's there today, not a blank sheet.
  const openEdit = () => {
    if (!selected) return;
    setEditError(null);
    setEditForm({
      dispatchDate: selected.dispatch_date,
      cohort: selected.cohort,
      force: false,
      items: (selected.items || []).map((item) => ({
        productId: String(item.product_id),
        quantity: String(item.required_quantity),
      })),
    });
    setMode('edit');
  };

  const addEditLine = () => {
    setEditForm((f) => ({ ...f, items: [...f.items, { productId: '', quantity: '' }] }));
  };

  const removeEditLine = (index) => {
    setEditForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  };

  const updateEditLine = (index, patch) => {
    setEditForm((f) => ({
      ...f,
      items: f.items.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const runEditSlip = async () => {
    if (!selected) return;
    setEditBusy(true); setEditError(null);
    try {
      await editSlip(selected.id, {
        dispatchDate: editForm.dispatchDate,
        cohort: editForm.cohort,
        force: editForm.force,
        items: editForm.items.map((line) => {
          const product = products.find((p) => String(p.id) === line.productId);
          return {
            productId: Number(line.productId),
            quantity: Number(line.quantity),
            unit: product?.defaultUnit || '',
          };
        }),
      });
      setViewDate(editForm.dispatchDate);
      await loadSlips();
      await openSlip(selected.id);
      setMode('list');
    } catch (err) { setEditError(err.message); } finally { setEditBusy(false); }
  };

  const runGenerate = async () => {
    setGenBusy(true); setGenError(null); setGenResult(null);
    try {
      const result = await generateSlips(genForm);
      setGenResult(result);
      setViewDate(genForm.dispatchDate);
      await loadSlips();
    } catch (err) { setGenError(err.message); } finally { setGenBusy(false); }
  };

  const runCreateAdHoc = async () => {
    setAdHocBusy(true); setAdHocError(null);
    try {
      await createSlip({ ...adHocForm, ecdId: Number(adHocForm.ecdId) });
      setViewDate(adHocForm.dispatchDate);
      await loadSlips();
      setMode('list');
    } catch (err) { setAdHocError(err.message); } finally { setAdHocBusy(false); }
  };

  const filteredSlips = search.trim()
    ? slips.filter((s) => s.ecd_name.toLowerCase().includes(search.trim().toLowerCase()))
    : slips;

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-medium">Picking Slips</h1>
        <p className="mt-1 text-sm text-muted-foreground">What do you need to do?</p>

        {mode === 'list' ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => { setMode('generate'); setGenResult(null); setGenError(null); }}>
              <CalendarPlus />
              Generate this week's slips
            </Button>
            <Button type="button" variant="outline" onClick={() => { setMode('create'); setAdHocError(null); }}>
              <PackagePlus />
              Create a new slip
            </Button>
          </div>
        ) : null}

        {mode !== 'list' ? (
          <Button
            type="button" variant="ghost" size="sm" className="mt-4 -ml-2"
            onClick={() => setMode('list')}
          >
            <ArrowLeft />
            Back to picking slips
          </Button>
        ) : null}

        {mode === 'generate' ? (
          <Card className="mt-4">
            <CardHeader><CardTitle>Generate this week's slips</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Creates one slip per approved, active beneficiary in the chosen cohort. Safe to
                run twice: it skips any centre that already has a slip for that date.
              </p>
              {genError ? <ErrorBanner message={genError} /> : null}
              {genResult ? (
                <SuccessBanner
                  message={
                    `${genResult.created} slip(s) created.` +
                    (genResult.emptySlips?.length
                      ? ` ${genResult.emptySlips.length} had no lines. Check that centre's order first.`
                      : '')
                  }
                />
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="gen-date">Dispatch date</FieldLabel>
                  <Input
                    id="gen-date" type="date" value={genForm.dispatchDate}
                    onChange={(e) => setGenForm((f) => ({ ...f, dispatchDate: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="gen-cohort">Cohort</FieldLabel>
                  <Select
                    value={genForm.cohort || undefined}
                    onValueChange={(v) => setGenForm((f) => ({ ...f, cohort: v }))}
                  >
                    <SelectTrigger id="gen-cohort"><SelectValue placeholder="Select a cohort" /></SelectTrigger>
                    <SelectContent>
                      {COHORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field orientation="horizontal">
                <Button
                  type="button" onClick={runGenerate}
                  disabled={genBusy || !genForm.dispatchDate || !genForm.cohort}
                >
                  {genBusy ? 'Generating' : 'Generate slips'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setMode('list')}>Done</Button>
              </Field>
            </CardContent>
          </Card>
        ) : null}

        {mode === 'create' ? (
          <Card className="mt-4">
            <CardHeader><CardTitle>Create a new slip</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                For a late registration, a correction, or a make-up delivery outside a
                beneficiary's normal rotation.
              </p>
              {adHocError ? <ErrorBanner message={adHocError} /> : null}

              <Field>
                <FieldLabel htmlFor="adhoc-ecd">Beneficiary</FieldLabel>
                <Select
                  value={adHocForm.ecdId || undefined}
                  onValueChange={(v) => setAdHocForm((f) => ({ ...f, ecdId: v }))}
                >
                  <SelectTrigger id="adhoc-ecd"><SelectValue placeholder="Select a beneficiary" /></SelectTrigger>
                  <SelectContent>
                    {beneficiaries.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}{!b.approvedAt ? ' (unapproved)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Only approved, active beneficiaries can actually receive a slip.</FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="adhoc-date">Dispatch date</FieldLabel>
                  <Input
                    id="adhoc-date" type="date" value={adHocForm.dispatchDate}
                    onChange={(e) => setAdHocForm((f) => ({ ...f, dispatchDate: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="adhoc-cohort">Cohort</FieldLabel>
                  <Select
                    value={adHocForm.cohort || undefined}
                    onValueChange={(v) => setAdHocForm((f) => ({ ...f, cohort: v }))}
                  >
                    <SelectTrigger id="adhoc-cohort"><SelectValue placeholder="Select a cohort" /></SelectTrigger>
                    <SelectContent>
                      {COHORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field orientation="horizontal">
                <Checkbox
                  id="adhoc-force"
                  checked={adHocForm.force}
                  onCheckedChange={(v) => setAdHocForm((f) => ({ ...f, force: Boolean(v) }))}
                />
                <FieldLabel htmlFor="adhoc-force" className="font-normal">
                  This is a deliberate make-up delivery outside the normal rotation
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Button
                  type="button" onClick={runCreateAdHoc}
                  disabled={adHocBusy || !adHocForm.ecdId || !adHocForm.dispatchDate || !adHocForm.cohort}
                >
                  {adHocBusy ? 'Creating' : 'Create slip'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setMode('list')}>Cancel</Button>
              </Field>
            </CardContent>
          </Card>
        ) : null}

        {mode === 'edit' && selected ? (
          <Card className="mt-4">
            <CardHeader><CardTitle>Edit slip — {selected.ecd_name}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Only while this pallet is still on the floor, unclaimed — once someone picks it up, editing locks.
              </p>
              {editError ? <ErrorBanner message={editError} /> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="edit-date">Dispatch date</FieldLabel>
                  <Input
                    id="edit-date" type="date" value={editForm.dispatchDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, dispatchDate: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-cohort">Cohort</FieldLabel>
                  <Select
                    value={editForm.cohort || undefined}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, cohort: v }))}
                  >
                    <SelectTrigger id="edit-cohort"><SelectValue placeholder="Select a cohort" /></SelectTrigger>
                    <SelectContent>
                      {COHORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field orientation="horizontal">
                <Checkbox
                  id="edit-force"
                  checked={editForm.force}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, force: Boolean(v) }))}
                />
                <FieldLabel htmlFor="edit-force" className="font-normal">
                  This is a deliberate change outside the normal rotation
                </FieldLabel>
              </Field>

              <div className="space-y-2">
                <FieldLabel>Product lines</FieldLabel>
                {editForm.items.map((line, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      value={line.productId || undefined}
                      onValueChange={(v) => updateEditLine(index, { productId: v })}
                    >
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Select a product" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" min="0" step="any" className="w-24"
                      value={line.quantity}
                      onChange={(e) => updateEditLine(index, { quantity: e.target.value })}
                      placeholder="Qty"
                    />
                    <span className="w-12 shrink-0 text-sm text-muted-foreground">
                      {products.find((p) => String(p.id) === line.productId)?.defaultUnit || ''}
                    </span>
                    <Button
                      type="button" variant="ghost" size="icon-sm"
                      onClick={() => removeEditLine(index)} aria-label="Remove line"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addEditLine}>
                  <Plus /> Add product line
                </Button>
              </div>

              <Field orientation="horizontal">
                <Button
                  type="button" onClick={runEditSlip}
                  disabled={
                    editBusy || !editForm.dispatchDate || !editForm.cohort ||
                    editForm.items.length === 0 ||
                    editForm.items.some((l) => !l.productId || !l.quantity || Number(l.quantity) <= 0)
                  }
                >
                  {editBusy ? 'Saving' : 'Save changes'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setMode('list')}>Cancel</Button>
              </Field>
            </CardContent>
          </Card>
        ) : null}

        {mode === 'list' ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <InputGroup className="min-w-56 flex-1">
                <InputGroupAddon align="inline-start"><Search /></InputGroupAddon>
                <InputGroupInput
                  placeholder="Search by beneficiary name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
              <Input
                type="date" value={viewDate} className="w-auto"
                onChange={(e) => setViewDate(e.target.value)}
              />
            </div>

            {error ? <ErrorBanner message={error} /> : null}

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <>
                {selected ? (
                  <SlipDetail
                    slip={selected}
                    releasing={releasing}
                    onRelease={release}
                    onEdit={openEdit}
                    workers={workers}
                    secondChoice={secondChoice}
                    onSecondChoice={setSecondChoice}
                    onAddSecond={addSecond}
                    addingSecond={addingSecond}
                    onClose={() => setSelected(null)}
                  />
                ) : null}

                {filteredSlips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No slips match.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Beneficiary</TableHead>
                            <TableHead>Cohort</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Items</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSlips.map((slip) => (
                            <TableRow key={slip.id} className="cursor-pointer" onClick={() => openSlip(slip.id)}>
                              <TableCell className="font-medium">{slip.ecd_name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {slip.cohort === 'week1' ? 'Week 1' : 'Week 2'}
                              </TableCell>
                              <TableCell><Badge variant="outline">{statusLabel(slip)}</Badge></TableCell>
                              <TableCell className="text-muted-foreground">
                                {slip.confirmed_items}/{slip.total_items}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : null}
      </main>
    </ManagerLayout>
  );
}
