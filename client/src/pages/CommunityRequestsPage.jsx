// ─────────────────────────────────────────────────────────────
// client/src/pages/CommunityRequestsPage.jsx
//
// ADM-5.0 "Log Benevolent Package Request" (BR-28).
//
// A member of the public phones or walks in asking for goods; staff
// record what was asked for and what happened to it. LOG ONLY — this
// screen never moves stock.
//
// Two-step workflow, matching the live community_requests table:
//   log → claim (a staff member takes ownership, sets handled_by)
//        → resolve (records outcome + a note, sets resolved_at)
// Claiming and resolving are separate actions and the UI keeps them
// separate — a request can be resolved whether or not it was claimed
// first, and claiming does not resolve anything.
//
// Construction mirrors SupplierDirectoryPage.jsx: ManagerLayout shell,
// a header with a one-line description, a search + filter + primary
// button toolbar, the shared brand error banner, a Card-wrapped Table,
// and an inline Card form for create / resolve. No new visual patterns.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import CommunityRequestForm from '../features/communityRequests/components/CommunityRequestForm';
import communityRequestAPI, {
  OUTCOMES, OUTCOME_LABELS, RESOLVE_OUTCOMES,
} from '../services/communityRequestAPI';

import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group';
import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
import { Search, Plus, Loader2 } from 'lucide-react';

const OUTCOME_BADGE = {
  pending:             'secondary',
  fulfilled:           'default',
  partially_fulfilled: 'outline',
  declined:            'outline',
  referred:            'outline',
};

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

// Same markup as the global fetch error banner in
// InventoryManagementPage / SupplierDirectoryPage. One error style.
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

// ── Resolve panel ────────────────────────────────────────────
const ResolvePanel = ({ request, busy, error, onSubmit, onCancel }) => {
  const [outcome, setOutcome] = useState('fulfilled');
  const [note, setNote] = useState('');
  const [touchedNote, setTouchedNote] = useState(false);
  const noteMissing = !note.trim();

  const submit = () => {
    setTouchedNote(true);
    if (noteMissing) return;
    onSubmit({ outcome, outcomeNote: note });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolve request from {request.callerName || 'an unnamed caller'}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {request.itemsRequested}
          </p>

          <Field>
            <FieldLabel htmlFor="cr-resolve-outcome">Outcome</FieldLabel>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger id="cr-resolve-outcome" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLVE_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>{OUTCOME_LABELS[o]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={(touchedNote && noteMissing) || undefined}>
            <FieldLabel htmlFor="cr-resolve-note">Note</FieldLabel>
            <Textarea
              id="cr-resolve-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => setTouchedNote(true)}
              placeholder="What was given, referred, or why it was declined."
              aria-invalid={(touchedNote && noteMissing) || undefined}
            />
            {touchedNote && noteMissing
              ? <FieldError>A note is required when resolving.</FieldError>
              : null}
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Saving' : 'Save outcome'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

export default function CommunityRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [mode, setMode] = useState('list');       // list | create
  const [resolving, setResolving] = useState(null); // request being resolved

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await communityRequestAPI.getRequests({
        outcome: outcomeFilter === 'all' ? '' : outcomeFilter,
        search,
      }));
    } catch (err) {
      setError(err.message || 'Could not load requests.');
    }
  }, [outcomeFilter, search]);

  // The cancelled flag is the same guard SupplierDirectoryPage uses: a
  // fast filter change must not let a stale response overwrite fresher
  // state.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    load().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const create = async (payload) => {
    setBusy(true); setFormError(null);
    try {
      await communityRequestAPI.logRequest(payload);
      setMode('list');
      await load();
    } catch (err) {
      setFormError(err.message || 'Could not log the request.');
    } finally {
      setBusy(false);
    }
  };

  const claim = async (id) => {
    setError(null);
    try {
      await communityRequestAPI.claimRequest(id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not claim the request.');
    }
  };

  const resolve = async ({ outcome, outcomeNote }) => {
    if (!resolving) return;
    setBusy(true); setFormError(null);
    try {
      await communityRequestAPI.resolveRequest(resolving.id, { outcome, outcomeNote });
      setResolving(null);
      await load();
    } catch (err) {
      setFormError(err.message || 'Could not resolve the request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Benevolent Package Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Phone-in and walk-in requests for goods from the public, and what happened to each one.
        </p>

        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} onRetry={load} />
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          {mode === 'create' ? (
            <Card>
              <CardHeader><CardTitle>Log a request</CardTitle></CardHeader>
              <CardContent>
                <CommunityRequestForm
                  onSubmit={create}
                  onCancel={() => { setMode('list'); setFormError(null); }}
                  busy={busy}
                  error={formError}
                />
              </CardContent>
            </Card>
          ) : resolving ? (
            <ResolvePanel
              request={resolving}
              busy={busy}
              error={formError}
              onSubmit={resolve}
              onCancel={() => { setResolving(null); setFormError(null); }}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <InputGroup className="min-w-56 flex-1">
                  <InputGroupAddon align="inline-start">
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput
                    placeholder="Search by item or caller name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </InputGroup>

                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All outcomes</SelectItem>
                    {OUTCOMES.map((o) => (
                      <SelectItem key={o} value={o}>{OUTCOME_LABELS[o]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button type="button" onClick={() => { setMode('create'); setFormError(null); }}>
                  <Plus />
                  Log a request
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requests match.</p>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Requested</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Quantity note</TableHead>
                          <TableHead>Caller</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requests.map((r) => {
                          const resolved = r.outcome !== 'pending';
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="whitespace-nowrap text-muted-foreground">
                                {fmtDateTime(r.requestedAt)}
                              </TableCell>
                              <TableCell className="max-w-xs whitespace-pre-line">
                                {r.itemsRequested}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {r.quantityNote || '—'}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {r.callerName || 'Not given'}
                                {r.callerContact ? (
                                  <span className="block text-xs">{r.callerContact}</span>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <Badge variant={OUTCOME_BADGE[r.outcome] ?? 'outline'}>
                                  {OUTCOME_LABELS[r.outcome] ?? r.outcome}
                                </Badge>
                                {resolved && r.outcomeNote ? (
                                  <span className="mt-1 block max-w-xs text-xs text-muted-foreground whitespace-pre-line">
                                    {r.outcomeNote}
                                  </span>
                                ) : null}
                                {r.handledByName ? (
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    Handled by {r.handledByName}
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right">
                                {resolved ? (
                                  <span className="text-xs text-muted-foreground">
                                    {fmtDateTime(r.resolvedAt)}
                                  </span>
                                ) : (
                                  <div className="flex justify-end gap-2">
                                    {r.handledBy == null ? (
                                      <Button
                                        type="button" variant="outline" size="sm"
                                        onClick={() => claim(r.id)}
                                      >
                                        Claim
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button" size="sm"
                                      onClick={() => { setResolving(r); setFormError(null); }}
                                    >
                                      Resolve
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </ManagerLayout>
  );
}
