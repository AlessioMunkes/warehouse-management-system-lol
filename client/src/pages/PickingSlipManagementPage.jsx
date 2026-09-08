// ─────────────────────────────────────────────────────────────
// client/src/pages/PickingSlipManagementPage.jsx
//
// Manager view for the two slip-creation paths picking.service.js
// already enforces as manager-only: generateSlips (the week's whole
// batch, by cohort) and createSlip (one ad-hoc slip for a single
// beneficiary — a late registration, a correction, or a make-up
// delivery with `force` to override the cohort-schedule check).
//
// Neither of these had a screen before today — see pickingAPI.js's
// generateSlips/createSlip, added alongside this page. The packer
// side (claim/confirm/flag/complete) already lives in
// PackingBoard.jsx/StaffSlipFlow.jsx; this is the other half.
//
// Fields read off a slip row (dispatch_date, ecd_name, packer_name,
// etc.) stay snake_case, matching PackingBoard.jsx's own convention
// for this feature — pickingAPI.js has never mapped to camelCase,
// unlike supplierAPI.js/productAPI.js, and introducing a second
// naming convention inside the same feature would be worse than
// following the one already there.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { TopNavbar }  from '../features/taskdashboard/components/TopNavBar';
import beneficiaryAPI from '../services/beneficiaryAPI';
import {
  fetchPickingSlips, generateSlips, createSlip,
} from '../services/pickingAPI';

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

export default function PickingSlipManagementPage() {
  const [reducedMovement, setReducedMovement] = useState(false);

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [beneficiariesError, setBeneficiariesError] = useState(null);

  const [viewDate, setViewDate] = useState(todayISO());
  const [slips, setSlips] = useState([]);
  const [slipsLoading, setSlipsLoading] = useState(true);
  const [slipsError, setSlipsError] = useState(null);

  const [genForm, setGenForm] = useState({ dispatchDate: todayISO(), cohort: '' });
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState(null);

  const [adHocForm, setAdHocForm] = useState({ ecdId: '', dispatchDate: todayISO(), cohort: '', force: false });
  const [adHocBusy, setAdHocBusy] = useState(false);
  const [adHocResult, setAdHocResult] = useState(null);
  const [adHocError, setAdHocError] = useState(null);

  const loadSlips = useCallback(async () => {
    setSlipsError(null);
    try {
      setSlips(await fetchPickingSlips({ dispatchDate: viewDate }));
    } catch (err) {
      setSlipsError(err.message || 'Could not load picking slips.');
    }
  }, [viewDate]);

  useEffect(() => {
    let cancelled = false;
    setSlipsLoading(true);
    loadSlips().finally(() => { if (!cancelled) setSlipsLoading(false); });
    return () => { cancelled = true; };
  }, [loadSlips]);

  useEffect(() => {
    let cancelled = false;
    beneficiaryAPI.getBeneficiaries({ includeInactive: false })
      .then((rows) => { if (!cancelled) setBeneficiaries(rows); })
      .catch((err) => { if (!cancelled) setBeneficiariesError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const runGenerate = async () => {
    setGenBusy(true); setGenError(null); setGenResult(null);
    try {
      const result = await generateSlips(genForm);
      setGenResult(result);
      await loadSlips();
    } catch (err) { setGenError(err.message); } finally { setGenBusy(false); }
  };

  const runCreateAdHoc = async () => {
    setAdHocBusy(true); setAdHocError(null); setAdHocResult(null);
    try {
      const result = await createSlip({ ...adHocForm, ecdId: Number(adHocForm.ecdId) });
      setAdHocResult(result);
      await loadSlips();
    } catch (err) { setAdHocError(err.message); } finally { setAdHocBusy(false); }
  };

  return (
    <>
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={() => setReducedMovement((v) => !v)}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Picking Slips</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate the week's slips, or create one ad-hoc for a single beneficiary.
        </p>

        {beneficiariesError ? (
          <div className="mt-4"><ErrorBanner message={`Could not load beneficiaries: ${beneficiariesError}`} /></div>
        ) : null}

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Generate the week's slips</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Creates one slip per approved, active centre in the chosen cohort. Safe to
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
              <Button
                type="button" onClick={runGenerate}
                disabled={genBusy || !genForm.dispatchDate || !genForm.cohort}
              >
                {genBusy ? 'Generating' : 'Generate slips'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Create an ad-hoc slip</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                For a late registration, a correction, or a make-up delivery outside a
                centre's normal rotation.
              </p>
              {adHocError ? <ErrorBanner message={adHocError} /> : null}
              {adHocResult ? <SuccessBanner message={`Slip #${adHocResult.slipId} created with ${adHocResult.itemCount} item(s).`} /> : null}

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
                <FieldDescription>Only approved, active centres can actually receive a slip.</FieldDescription>
              </Field>
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
              <Button
                type="button" onClick={runCreateAdHoc}
                disabled={adHocBusy || !adHocForm.ecdId || !adHocForm.dispatchDate || !adHocForm.cohort}
              >
                {adHocBusy ? 'Creating' : 'Create slip'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-medium">Slips for</h2>
            <Input
              type="date" value={viewDate} className="w-auto"
              onChange={(e) => setViewDate(e.target.value)}
            />
          </div>

          {slipsError ? <div className="mt-3"><ErrorBanner message={slipsError} /></div> : null}

          {slipsLoading ? (
            <div className="mt-3 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : slips.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No slips for this date yet.</p>
          ) : (
            <Card className="mt-3">
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
                    {slips.map((slip) => (
                      <TableRow key={slip.id}>
                        <TableCell className="font-medium">{slip.ecd_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {slip.cohort === 'week1' ? 'Week 1' : 'Week 2'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {slip.packer_name || 'Unassigned'}
                        </TableCell>
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
        </div>
      </main>
    </>
  );
}
