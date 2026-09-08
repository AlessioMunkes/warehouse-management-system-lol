// ─────────────────────────────────────────────────────────────
// client/src/pages/BeneficiaryDirectoryPage.jsx
//
// Manager view, same reasoning as ProductManagementPage.jsx /
// SupplierDirectoryPage.jsx: App.jsx gates the route and every write
// endpoint in beneficiary.routes.js is requireRole(MANAGER, ADMIN);
// the useAuth check below is belt-and-braces the same way.
//
// A NEW centre is not slip-eligible until approved — see
// beneficiary.service.js. This page surfaces that directly: an
// unapproved centre shows a distinct badge and an "Approve" action
// alongside Edit/Deactivate, and picking.repository.js's own
// createSlip/generateSlips gate is exactly what that approval unlocks.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useAuth }     from '../context/AuthContext';
import { TopNavbar }   from '../features/taskdashboard/components/TopNavBar';
import BeneficiaryForm from '../features/beneficiaries/components/BeneficiaryForm';
import beneficiaryAPI  from '../services/beneficiaryAPI';

import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Checkbox }  from '@/components/ui/checkbox';
import { Skeleton }  from '@/components/ui/skeleton';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Plus, Pencil, Power, ShieldCheck, X } from 'lucide-react';

const CAN_MANAGE = ['manager', 'admin'];
const COHORT_LABELS = { week1: 'Week 1', week2: 'Week 2' };

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const ErrorBanner = ({ message, onRetry }) => (
  <div className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
    <span>{message}</span>
    {onRetry ? (
      <button
        onClick={onRetry}
        className="text-xs sm:text-sm font-semibold underline hover:text-[#ef3a40] focus:outline-none"
      >
        Try again
      </button>
    ) : null}
  </div>
);

// ── Detail panel ──────────────────────────────────────────────
const BeneficiaryDetail = ({ beneficiary, canManage, onEdit, onToggleActive, onApprove, onClose }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>{beneficiary.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {COHORT_LABELS[beneficiary.cohort] ?? beneficiary.cohort}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
        <X />
      </Button>
    </CardHeader>

    <CardContent className="space-y-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Contact</dt><dd>{beneficiary.contactName || '—'}</dd></div>
        <div><dt className="text-muted-foreground">Children served</dt><dd>{beneficiary.childCount ?? 'Not recorded'}</dd></div>
        <div><dt className="text-muted-foreground">Approved</dt><dd>{beneficiary.approvedAt ? fmtDate(beneficiary.approvedAt) : 'Not yet approved'}</dd></div>
        <div><dt className="text-muted-foreground">Last collection</dt><dd>{fmtDate(beneficiary.lastCollectedDate)}</dd></div>
      </dl>

      {!beneficiary.approvedAt ? (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          This centre cannot receive a picking slip until it is approved.
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil />
            Edit details
          </Button>
          {!beneficiary.approvedAt ? (
            <Button type="button" variant="outline" onClick={onApprove}>
              <ShieldCheck />
              Approve
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onToggleActive}>
            <Power />
            {beneficiary.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      ) : null}
    </CardContent>
  </Card>
);

// ── Page ──────────────────────────────────────────────────────
export default function BeneficiaryDirectoryPage() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE.includes(user?.role);

  const [reducedMovement, setReducedMovement] = useState(false);

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list'); // list | create | edit

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadBeneficiaries = useCallback(async () => {
    setError(null);
    try {
      setBeneficiaries(await beneficiaryAPI.getBeneficiaries({ includeInactive, search }));
    } catch (err) {
      setError(err.message || 'Could not load beneficiaries.');
    }
  }, [includeInactive, search]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadBeneficiaries().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [loadBeneficiaries]);

  const open = async (id) => {
    setError(null);
    try {
      setSelected(await beneficiaryAPI.getBeneficiary(id));
      setMode('list');
    } catch (err) { setError(err.message); }
  };

  const create = async (payload) => {
    setBusy(true); setError(null);
    try {
      const created = await beneficiaryAPI.createBeneficiary(payload);
      setMode('list');
      await loadBeneficiaries();
      await open(created.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const save = async (payload) => {
    setBusy(true); setError(null);
    try {
      await beneficiaryAPI.updateBeneficiary(selected.id, payload);
      setMode('list');
      await loadBeneficiaries();
      await open(selected.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const toggleActive = async () => {
    setError(null);
    try {
      await beneficiaryAPI.setBeneficiaryStatus(selected.id, !selected.isActive);
      await loadBeneficiaries();
      await open(selected.id);
    } catch (err) { setError(err.message); }
  };

  const approve = async () => {
    setError(null);
    try {
      await beneficiaryAPI.approveBeneficiary(selected.id);
      await loadBeneficiaries();
      await open(selected.id);
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={() => setReducedMovement((v) => !v)}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Beneficiaries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ECDs, soup kitchens, dignity kitchens and benevolent package beneficiaries on record.
        </p>

        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} onRetry={loadBeneficiaries} />
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {mode === 'create' ? (
              <Card>
                <CardHeader><CardTitle>Add a beneficiary</CardTitle></CardHeader>
                <CardContent>
                  <BeneficiaryForm onSubmit={create} onCancel={() => setMode('list')} busy={busy} />
                </CardContent>
              </Card>
            ) : mode === 'edit' && selected ? (
              <Card>
                <CardHeader><CardTitle>Edit {selected.name}</CardTitle></CardHeader>
                <CardContent>
                  <BeneficiaryForm
                    initial={selected}
                    submitLabel="Save changes"
                    onSubmit={save}
                    onCancel={() => setMode('list')}
                    busy={busy}
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <InputGroup className="min-w-56 flex-1">
                    <InputGroupAddon align="inline-start">
                      <Search />
                    </InputGroupAddon>
                    <InputGroupInput
                      placeholder="Search by name or contact"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </InputGroup>

                  <Field orientation="horizontal" className="w-auto">
                    <Checkbox
                      id="include-inactive"
                      checked={includeInactive}
                      onCheckedChange={(v) => setIncludeInactive(Boolean(v))}
                    />
                    <FieldLabel htmlFor="include-inactive" className="font-normal">
                      Show inactive
                    </FieldLabel>
                  </Field>

                  {canManage ? (
                    <Button type="button" onClick={() => { setSelected(null); setMode('create'); }}>
                      <Plus />
                      Add beneficiary
                    </Button>
                  ) : null}
                </div>

                {selected ? (
                  <BeneficiaryDetail
                    beneficiary={selected}
                    canManage={canManage}
                    onEdit={() => setMode('edit')}
                    onToggleActive={toggleActive}
                    onApprove={approve}
                    onClose={() => setSelected(null)}
                  />
                ) : null}

                {beneficiaries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No beneficiaries match.</p>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Beneficiary</TableHead>
                            <TableHead>Cohort</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {beneficiaries.map((b) => (
                            <TableRow
                              key={b.id}
                              className="cursor-pointer"
                              onClick={() => open(b.id)}
                            >
                              <TableCell className="font-medium">{b.name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {COHORT_LABELS[b.cohort] ?? b.cohort}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {b.contactName || '—'}
                              </TableCell>
                              <TableCell className="flex justify-end gap-1">
                                {!b.approvedAt ? <Badge variant="outline">Unapproved</Badge> : null}
                                {!b.isActive ? <Badge variant="outline">Inactive</Badge> : null}
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
        )}
      </main>
    </>
  );
}
