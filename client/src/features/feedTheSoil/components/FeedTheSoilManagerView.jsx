// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/components/FeedTheSoilManagerView.jsx
//
// The desktop, oversight-shaped view of Feed the Soil kit tracking —
// same lifecycle as FeedTheSoilFlow.jsx (assign, log, dispatch), same
// status naming, different vocabulary (Table/Card, not .stf-*) for
// someone auditing at a desk rather than working a bucket by hand.
//
// Two tabs, same split as the staff flow: Kits (assign, search, open
// one for its owner info and full log history) and Records (the flat,
// cross-kit list — not-yet-dispatched first, dispatched at the
// bottom, exactly the order the server already returns).
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import collectionKitAPI from '../../../services/collectionKitAPI';
import formatKitCode from '../kitCode';

import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input }    from '@/components/ui/input';
import {
  Field, FieldGroup, FieldLabel, FieldError, FieldDescription,
} from '@/components/ui/field';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Loader2, Search } from 'lucide-react';

const STATUS_LABELS = { assigned: 'Assigned', logged: 'Logged', dispatched: 'Dispatched' };
const STATUS_BADGE  = { assigned: 'outline', logged: 'secondary', dispatched: 'default' };

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

const fmtKg = (value) => (value === null || value === undefined ? '—' : `${Number(value).toLocaleString('en-ZA')} kg`);

const StatusBadge = ({ status }) => (
  <Badge variant={STATUS_BADGE[status] ?? 'outline'}>{STATUS_LABELS[status] ?? status}</Badge>
);

const ErrorBanner = ({ message, onRetry }) => (
  <div className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
    <span>{message}</span>
    {onRetry ? (
      <button onClick={onRetry} className="text-xs sm:text-sm font-semibold underline hover:text-[#ef3a40] focus:outline-none">
        Try again
      </button>
    ) : null}
  </div>
);

const TABS = [
  { id: 'kits',    label: 'Kits' },
  { id: 'records', label: 'Records' },
];

// ── Assign-a-kit panel ─────────────────────────────────────────
const AssignKitPanel = ({ busy, error, onSubmit, onCancel }) => {
  const [ownerName, setOwnerName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [assignedAt, setAssignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [touched, setTouched] = useState(false);
  const ownerMissing = !ownerName.trim();

  const submit = () => {
    setTouched(true);
    if (ownerMissing) return;
    onSubmit({ ownerName: ownerName.trim(), suburb: suburb.trim(), assignedAt });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Assign a kit</CardTitle></CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <Field data-invalid={(touched && ownerMissing) || undefined}>
            <FieldLabel htmlFor="fts-owner">Owner's name</FieldLabel>
            <Input
              id="fts-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
              onBlur={() => setTouched(true)} placeholder="Jane M."
              aria-invalid={(touched && ownerMissing) || undefined}
            />
            {touched && ownerMissing ? <FieldError>An owner name is required.</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="fts-suburb">Suburb</FieldLabel>
            <Input id="fts-suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Delft" />
            <FieldDescription>No street address or contact details are kept.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="fts-assigned">Date assigned</FieldLabel>
            <Input id="fts-assigned" type="date" value={assignedAt} onChange={(e) => setAssignedAt(e.target.value)} />
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Assigning' : 'Assign kit'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

// ── Log-compost panel ────────────────────────────────────────
const LogCompostPanel = ({ kit, busy, error, onSubmit, onCancel }) => {
  const [kg, setKg] = useState('');
  const [loggedAt, setLoggedAt] = useState(new Date().toISOString().slice(0, 10));
  const [touched, setTouched] = useState(false);
  const kgInvalid = kg === '' || Number.isNaN(Number(kg)) || Number(kg) < 0;

  const submit = () => {
    setTouched(true);
    if (kgInvalid) return;
    onSubmit({ kgCompost: Number(kg), loggedAt });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Log compost · {kit.owner_name}</CardTitle></CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <Field data-invalid={(touched && kgInvalid) || undefined}>
            <FieldLabel htmlFor="fts-kg">Kilograms of compost collected</FieldLabel>
            <Input
              id="fts-kg" type="number" min="0" step="0.1" value={kg}
              onChange={(e) => setKg(e.target.value)} onBlur={() => setTouched(true)}
              aria-invalid={(touched && kgInvalid) || undefined}
            />
            {touched && kgInvalid ? <FieldError>Enter a kilogram amount of 0 or more.</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="fts-logged">Date collected</FieldLabel>
            <Input id="fts-logged" type="date" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} />
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Logging' : 'Log compost'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

// ── Kit detail ────────────────────────────────────────────────
const KitDetail = ({ kit, onLogCompost, onDispatch, dispatchingId, onClose }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>{kit.owner_name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatKitCode(kit.id)} · {kit.suburb || 'No suburb on record'} · assigned {fmtDate(kit.assigned_at)}
        </p>
      </div>
      <StatusBadge status={kit.status} />
    </CardHeader>
    <CardContent className="space-y-4">
      <Button type="button" size="sm" onClick={() => onLogCompost(kit)}>Log compost</Button>

      {kit.records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No compost logged for this kit yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Compost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {kit.records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{fmtDate(r.logged_at)}</TableCell>
                <TableCell>{fmtKg(r.kg_compost)}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                  {r.status === 'dispatched' ? (
                    <span className="mt-1 block text-xs text-muted-foreground">{fmtDateTime(r.dispatched_at)}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  {r.status === 'logged' ? (
                    <Button
                      type="button" variant="outline" size="sm"
                      disabled={dispatchingId === r.id}
                      onClick={() => onDispatch(r.id)}
                    >
                      {dispatchingId === r.id ? 'Dispatching…' : 'Dispatch'}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
    </CardContent>
  </Card>
);

export default function FeedTheSoilManagerView() {
  const [tab, setTab] = useState('kits');
  const [mode, setMode] = useState('list'); // list | assign | log
  const [selectedKit, setSelectedKit] = useState(null);

  const [kits, setKits] = useState([]);
  const [kitSearch, setKitSearch] = useState('');
  const [records, setRecords] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dispatchingId, setDispatchingId] = useState(null);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const loadKits = useCallback(async () => {
    setError(null);
    try {
      const res = await collectionKitAPI.listKits(kitSearch);
      setKits(res?.data ?? res ?? []);
    } catch (err) {
      setError(err.message || 'Could not load kits.');
    }
  }, [kitSearch]);

  const loadRecords = useCallback(async () => {
    setError(null);
    try {
      const res = await collectionKitAPI.listRecords();
      setRecords(res?.data ?? res ?? []);
    } catch (err) {
      setError(err.message || 'Could not load compost records.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const load = tab === 'kits' ? loadKits() : loadRecords();
    load.finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, loadKits, loadRecords]);

  const openKit = async (id) => {
    setError(null);
    try {
      const res = await collectionKitAPI.getKit(id);
      setSelectedKit(res?.data ?? res);
      setMode('list');
    } catch (err) {
      setError(err.message || 'Could not load this kit.');
    }
  };

  const assignKit = async (payload) => {
    setBusy(true); setFormError(null);
    try {
      const res = await collectionKitAPI.createKit(payload);
      const kit = res?.data ?? res;
      setMode('list');
      await loadKits();
      await openKit(kit.id);
    } catch (err) {
      setFormError(err.message || 'Could not assign the kit.');
    } finally {
      setBusy(false);
    }
  };

  const logCompost = async (payload) => {
    if (!selectedKit) return;
    setBusy(true); setFormError(null);
    try {
      await collectionKitAPI.logCompost(selectedKit.id, payload);
      setMode('list');
      await loadKits();
      await openKit(selectedKit.id);
    } catch (err) {
      setFormError(err.message || 'Could not log the compost collected.');
    } finally {
      setBusy(false);
    }
  };

  const dispatchRecord = async (recordId) => {
    setDispatchingId(recordId);
    setError(null);
    try {
      await collectionKitAPI.markDispatched(recordId);
      await loadRecords();
      if (selectedKit) await openKit(selectedKit.id);
    } catch (err) {
      setError(err.message || 'Could not mark this record dispatched.');
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-medium">Feed the Soil</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Collection kits assigned to community members and the compost logged against each one.
        The Impact Calculator's compost figure comes straight from what's logged here.
      </p>

      {error ? <div className="mt-4"><ErrorBanner message={error} onRetry={tab === 'kits' ? loadKits : loadRecords} /></div> : null}

      <div className="mt-5 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id} type="button"
            onClick={() => { setTab(t.id); setMode('list'); setSelectedKit(null); }}
            className={t.id === tab
              ? 'border-b-2 border-foreground px-4 py-2 text-sm font-medium'
              : 'px-4 py-2 text-sm text-muted-foreground'}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {mode === 'assign' ? (
          <AssignKitPanel busy={busy} error={formError} onSubmit={assignKit} onCancel={() => { setMode('list'); setFormError(null); }} />
        ) : mode === 'log' && selectedKit ? (
          <LogCompostPanel kit={selectedKit} busy={busy} error={formError} onSubmit={logCompost} onCancel={() => setMode('list')} />
        ) : selectedKit ? (
          <KitDetail
            kit={selectedKit}
            onLogCompost={() => setMode('log')}
            onDispatch={dispatchRecord}
            dispatchingId={dispatchingId}
            onClose={() => setSelectedKit(null)}
          />
        ) : tab === 'kits' ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8" placeholder="Search by owner or suburb"
                  value={kitSearch} onChange={(e) => setKitSearch(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => setMode('assign')}>
                <Plus /> Assign a kit
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : kits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No kits match.</p>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kit</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Suburb</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last logged</TableHead>
                        <TableHead>Assigned</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kits.map((k) => (
                        <TableRow key={k.id} className="cursor-pointer" onClick={() => openKit(k.id)}>
                          <TableCell className="font-medium">{formatKitCode(k.id)}</TableCell>
                          <TableCell>{k.owner_name}</TableCell>
                          <TableCell className="text-muted-foreground">{k.suburb || '—'}</TableCell>
                          <TableCell><StatusBadge status={k.status} /></TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(k.last_logged_at)}</TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(k.assigned_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : records.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compost has been logged yet.</p>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Owner</TableHead>
                        <TableHead>Kit</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Compost</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.owner_name}</TableCell>
                          <TableCell className="text-muted-foreground">{formatKitCode(r.kit_id)}{r.suburb ? ` · ${r.suburb}` : ''}</TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(r.logged_at)}</TableCell>
                          <TableCell className="text-muted-foreground">{fmtKg(r.kg_compost)}</TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                            {r.status === 'dispatched' ? (
                              <span className="mt-1 block text-xs text-muted-foreground">{fmtDateTime(r.dispatched_at)}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.status === 'logged' ? (
                              <Button
                                type="button" variant="outline" size="sm"
                                disabled={dispatchingId === r.id}
                                onClick={() => dispatchRecord(r.id)}
                              >
                                {dispatchingId === r.id ? 'Dispatching…' : 'Dispatch'}
                              </Button>
                            ) : null}
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
    </main>
  );
}
