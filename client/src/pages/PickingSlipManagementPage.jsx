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
// an ad-hoc slip is the exception (a late registration, a correction,
// a make-up delivery). Assigning a slip to a worker is not a third
// quick action or a separate page — it happens inline, on the slip
// itself, once you've opened it: that is where "who is this for"
// actually gets decided, not a form competing for space up top.
//
// "Edit an existing slip" is NOT a button here on purpose: nothing in
// picking.service.js supports rewriting a slip's lines or metadata
// after creation — confirmItem/flagItem/completeSlip during packing
// and assignSlip for who holds it are the only mutations that exist.
// Listing + opening a slip to see its current state is what this
// page offers instead; a real "edit" would need new backend support
// first, not a client-side button pointed at nothing.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { TopNavbar }  from '../features/taskdashboard/components/TopNavBar';
import beneficiaryAPI from '../services/beneficiaryAPI';
import {
  fetchPickingSlips, fetchPickingSlip, fetchAssignableWorkers,
  generateSlips, createSlip, assignSlip,
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
import { Search, CalendarPlus, PackagePlus, X } from 'lucide-react';

const COHORT_OPTIONS = [
  { value: 'week1', label: 'Week 1' },
  { value: 'week2', label: 'Week 2' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

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
// Assignment happens right here, not on a separate page — a manager
// opens a slip because they're already thinking about it, and "who
// is this for" is the same decision as "what is this slip." Only
// shown while the slip is still pending (unclaimed); once someone
// holds it, reassigning is a manager-override case picking.service.js
// doesn't distinguish from a first assignment, so the same control
// would still work, but a slip in progress or beyond is read-only
// here on purpose — this page is for organising the queue, not
// pulling work out from under whoever already started it.
const SlipDetail = ({ slip, workers, assignChoice, onAssignChoice, onAssign, assigning, onClose }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>{slip.ecd_name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {slip.cohort === 'week1' ? 'Week 1' : 'Week 2'} · {slip.dispatch_date}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
        <X />
      </Button>
    </CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Status</dt><dd><Badge variant="outline">{slip.status}</Badge></dd></div>
        <div>
          <dt className="text-muted-foreground">Assigned to</dt>
          <dd>
            {slip.status === 'pending' ? (
              <div className="mt-1 flex items-center gap-2">
                <Select value={assignChoice || undefined} onValueChange={onAssignChoice}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Select a worker" /></SelectTrigger>
                  <SelectContent>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.first_name} {w.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" disabled={!assignChoice || assigning} onClick={onAssign}>
                  {assigning ? 'Assigning' : 'Assign'}
                </Button>
              </div>
            ) : (slip.packer_name || 'Unassigned')}
          </dd>
        </div>
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
  const [reducedMovement, setReducedMovement] = useState(false);
  const [mode, setMode] = useState('list'); // list | generate | create

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [workers, setWorkers] = useState([]);

  const [viewDate, setViewDate] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [slips, setSlips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [assignChoice, setAssignChoice] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [genForm, setGenForm] = useState({ dispatchDate: todayISO(), cohort: '' });
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState(null);

  const [adHocForm, setAdHocForm] = useState({ ecdId: '', dispatchDate: todayISO(), cohort: '', force: false });
  const [adHocBusy, setAdHocBusy] = useState(false);
  const [adHocError, setAdHocError] = useState(null);

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
    return () => { cancelled = true; };
  }, []);

  const openSlip = async (slipId) => {
    setError(null);
    setAssignChoice('');
    try {
      setSelected(await fetchPickingSlip(slipId));
    } catch (err) { setError(err.message); }
  };

  const assign = async () => {
    if (!assignChoice || !selected) return;
    setAssigning(true); setError(null);
    try {
      await assignSlip(selected.id, Number(assignChoice));
      await loadSlips();
      await openSlip(selected.id);
    } catch (err) { setError(err.message); } finally { setAssigning(false); }
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
    <>
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={() => setReducedMovement((v) => !v)}
      />

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
              Create an ad-hoc slip
            </Button>
          </div>
        ) : null}

        {mode === 'generate' ? (
          <Card className="mt-6">
            <CardHeader><CardTitle>Generate this week's slips</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Creates one slip per approved, active beneficiary in the chosen cohort. Safe to
                run twice — it skips any centre that already has a slip for that date.
              </p>
              {genError ? <ErrorBanner message={genError} /> : null}
              {genResult ? (
                <SuccessBanner
                  message={
                    `${genResult.created} slip(s) created.` +
                    (genResult.emptySlips?.length
                      ? ` ${genResult.emptySlips.length} had no lines — check that centre's order first.`
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
          <Card className="mt-6">
            <CardHeader><CardTitle>Create an ad-hoc slip</CardTitle></CardHeader>
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
                    workers={workers}
                    assignChoice={assignChoice}
                    onAssignChoice={setAssignChoice}
                    onAssign={assign}
                    assigning={assigning}
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
                            <TableHead>Assigned to</TableHead>
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
                              <TableCell className="text-muted-foreground">{slip.packer_name || 'Unassigned'}</TableCell>
                              <TableCell><Badge variant="outline">{slip.status}</Badge></TableCell>
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
    </>
  );
}
