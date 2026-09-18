// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/components/FeedTheSoilManagerView.jsx
//
// The desktop, oversight-shaped view of Feed the Soil kit logging —
// moved out of pages/FeedTheSoilPage.jsx verbatim (minus the
// ManagerLayout wrapper, which the page now applies) so that page can
// pick between this and the staff-floor flow (FeedTheSoilFlow.jsx) by
// role, the same way DecantingPage.jsx picks between DecantingPlanner
// and DecantingFlow.
//
// A manager still gets the full table + Select filter — that's the
// right shape for someone auditing every kit at a desk, not the
// "hard to operate" complaint the staff flow exists to fix.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import collectionKitAPI from '../../../services/collectionKitAPI';

import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input }    from '@/components/ui/input';
import {
  Field, FieldGroup, FieldLabel, FieldError,
} from '@/components/ui/field';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';

const STATUS_LABELS = { out: 'Out', returned: 'Returned' };
const STATUS_BADGE  = { out: 'secondary', returned: 'default' };

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

const fmtKg = (value) => (value === null || value === undefined ? '—' : `${Number(value).toLocaleString('en-ZA')} kg`);

// Same markup as the shared brand error banner used across the
// directory-style pages (SupplierDirectoryPage, CommunityRequestsPage).
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

// ── Log-a-kit panel ──────────────────────────────────────────
const LogKitPanel = ({ busy, error, onSubmit, onCancel }) => {
  const [kitLabel, setKitLabel] = useState('');
  const [location, setLocation] = useState('');
  const [dateOut, setDateOut] = useState(new Date().toISOString().slice(0, 10));
  const [kg, setKg] = useState('');
  const [touched, setTouched] = useState(false);

  const labelMissing = !kitLabel.trim();
  const kgInvalid = kg === '' || Number.isNaN(Number(kg)) || Number(kg) < 0;

  const submit = () => {
    setTouched(true);
    if (labelMissing || kgInvalid) return;
    onSubmit({ kitLabel: kitLabel.trim(), location: location.trim(), dateOut, kgFoodWasteCollected: Number(kg) });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Log a kit going out</CardTitle></CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <Field data-invalid={(touched && labelMissing) || undefined}>
            <FieldLabel htmlFor="fts-label">Kit / bucket label</FieldLabel>
            <Input
              id="fts-label" value={kitLabel} onChange={(e) => setKitLabel(e.target.value)}
              onBlur={() => setTouched(true)} placeholder="e.g. Bucket A1"
              aria-invalid={(touched && labelMissing) || undefined}
            />
            {touched && labelMissing ? <FieldError>A kit label is required.</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="fts-location">Location (optional)</FieldLabel>
            <Input id="fts-location" value={location} onChange={(e) => setLocation(e.target.value)}
                   placeholder="e.g. Cape Town Warehouse" />
          </Field>

          <Field>
            <FieldLabel htmlFor="fts-date">Date out</FieldLabel>
            <Input id="fts-date" type="date" value={dateOut} onChange={(e) => setDateOut(e.target.value)} />
          </Field>

          <Field data-invalid={(touched && kgInvalid) || undefined}>
            <FieldLabel htmlFor="fts-kg">Kilograms of food waste collected</FieldLabel>
            <Input
              id="fts-kg" type="number" min="0" step="0.1" value={kg}
              onChange={(e) => setKg(e.target.value)} onBlur={() => setTouched(true)}
              aria-invalid={(touched && kgInvalid) || undefined}
            />
            {touched && kgInvalid ? <FieldError>Enter a kilogram amount of 0 or more.</FieldError> : null}
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Logging' : 'Log kit'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

// ── Mark-returned panel ──────────────────────────────────────
const ReturnKitPanel = ({ kit, busy, error, onSubmit, onCancel }) => {
  const [kg, setKg] = useState('');
  const [touched, setTouched] = useState(false);
  const kgInvalid = kg === '' || Number.isNaN(Number(kg)) || Number(kg) < 0;

  const submit = () => {
    setTouched(true);
    if (kgInvalid) return;
    onSubmit(Number(kg));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mark "{kit.kit_label}" returned</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <p className="text-sm text-muted-foreground">
            Went out {fmtDate(kit.date_out)} with {fmtKg(kit.kg_food_waste_collected)} of food waste.
          </p>

          <Field data-invalid={(touched && kgInvalid) || undefined}>
            <FieldLabel htmlFor="fts-return-kg">Kilograms of compost returned</FieldLabel>
            <Input
              id="fts-return-kg" type="number" min="0" step="0.1" value={kg}
              onChange={(e) => setKg(e.target.value)} onBlur={() => setTouched(true)}
              aria-invalid={(touched && kgInvalid) || undefined}
            />
            {touched && kgInvalid ? <FieldError>Enter a kilogram amount of 0 or more.</FieldError> : null}
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Saving' : 'Mark returned'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

export default function FeedTheSoilManagerView() {
  const [kits, setKits] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [mode, setMode] = useState('list');   // list | create
  const [returning, setReturning] = useState(null); // kit being marked returned

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await collectionKitAPI.listKits(statusFilter === 'all' ? undefined : statusFilter);
      setKits(res.data ?? res ?? []);
    } catch (err) {
      setError(err.message || 'Could not load kits.');
    }
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    load().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const logKit = async (payload) => {
    setBusy(true); setFormError(null);
    try {
      await collectionKitAPI.logKitOut(payload);
      setMode('list');
      await load();
    } catch (err) {
      setFormError(err.message || 'Could not log the kit.');
    } finally {
      setBusy(false);
    }
  };

  const markReturned = async (kgCompostReturned) => {
    if (!returning) return;
    setBusy(true); setFormError(null);
    try {
      await collectionKitAPI.markReturned(returning.id, kgCompostReturned);
      setReturning(null);
      await load();
    } catch (err) {
      setFormError(err.message || 'Could not mark the kit returned.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-medium">Feed the Soil</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Kits (buckets) of food waste swapped for compost. Log a kit when it goes out, and
        again when it comes back — the Impact Calculator's compost figure comes straight
        from what's logged here.
      </p>

      {error ? (
        <div className="mt-4"><ErrorBanner message={error} onRetry={load} /></div>
      ) : null}

      <div className="mt-6 space-y-6">
        {mode === 'create' ? (
          <LogKitPanel
            busy={busy} error={formError}
            onSubmit={logKit}
            onCancel={() => { setMode('list'); setFormError(null); }}
          />
        ) : returning ? (
          <ReturnKitPanel
            kit={returning} busy={busy} error={formError}
            onSubmit={markReturned}
            onCancel={() => { setReturning(null); setFormError(null); }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kits</SelectItem>
                  <SelectItem value="out">Out</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>

              <Button type="button" onClick={() => { setMode('create'); setFormError(null); }}>
                <Plus />
                Log a kit going out
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
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
                        <TableHead>Location</TableHead>
                        <TableHead>Out</TableHead>
                        <TableHead>Waste collected</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Compost returned</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kits.map((k) => (
                        <TableRow key={k.id}>
                          <TableCell className="font-medium">{k.kit_label}</TableCell>
                          <TableCell className="text-muted-foreground">{k.location || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {fmtDate(k.date_out)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fmtKg(k.kg_food_waste_collected)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_BADGE[k.status] ?? 'outline'}>
                              {STATUS_LABELS[k.status] ?? k.status}
                            </Badge>
                            {k.logged_by_name ? (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Logged by {k.logged_by_name}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {k.status === 'returned' ? (
                              <>
                                {fmtKg(k.kg_compost_returned)}
                                <span className="block text-xs">{fmtDateTime(k.returned_at)}</span>
                              </>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {k.status === 'out' ? (
                              <Button
                                type="button" variant="outline" size="sm"
                                onClick={() => { setReturning(k); setFormError(null); }}
                              >
                                Mark returned
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
