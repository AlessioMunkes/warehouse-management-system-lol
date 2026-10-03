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
//
// One route, two shapes, picked by role — the same pattern
// FeedTheSoilPage.jsx and DecantingPage.jsx use. A manager gets the
// desktop table below (CommunityRequestsManagerView, this file's
// original body, moved verbatim). A warehouse worker gets
// CommunityRequestFlow inside StaffShell — the phone-first tab bar
// and app chrome every other floor task uses, which this page never
// had: it always rendered <ManagerLayout> regardless of role, so a
// worker got a desktop sidebar page with no bottom nav, and (when the
// route also wrapped it in ManagerLayout via ProtectedRoute's shell
// prop) a doubled-up sidebar whose drawer state fought itself.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CommunityRequestForm from '../features/communityRequests/components/CommunityRequestForm';
import communityRequestAPI, {
  OUTCOMES, OUTCOME_LABELS, RESOLVE_OUTCOMES,
} from '../services/communityRequestAPI';

import { Button }   from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Field, FieldGroup, FieldLabel, FieldError,
} from '@/components/ui/field';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2, PhoneIncoming } from 'lucide-react';
import TablePager from '@/components/ui/table-pager';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/hooks/usePaged';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import DetailPanel from '@/components/ui/detail-panel';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';

// Pending amber, fulfilled solid green, part-fulfilled soft green,
// referred blue, declined red — each with its own icon
// (lib/statusStyles.js).

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

// Same markup as the global fetch error banner in
// InventoryManagementPage / SupplierDirectoryPage. One error style.
// The tabs: one per outcome, Pending first because that is the work.
// `id` is what goes in ?status=; Pending leaves the URL bare.
const VIEWS = [
  ...OUTCOMES.map((o) => ({ id: o, label: OUTCOME_LABELS[o], alert: o === 'pending', test: (r) => r.outcome === o })),
  { id: 'all', label: 'All', test: () => true },
];
const viewById = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

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
    <DetailPanel
      open
      onClose={onCancel}
      eyebrow="Resolve request"
      title={request.callerName || 'An unnamed caller'}
    >
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
    </DetailPanel>
  );
};


// The manager's screen. The floor logs requests on its own screen,
// StaffCommunityRequestsPage.
export default function CommunityRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewById(searchParams.get('status'));
  const changeView = (id) => setSearchParams(id === VIEWS[0].id ? {} : { status: id }, { replace: true });
  const [mode, setMode] = useState('list');       // list | create
  const [resolving, setResolving] = useState(null); // request being resolved

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await communityRequestAPI.getRequests({ outcome: '', search }));
    } catch (err) {
      setError(err.message || 'Could not load requests.');
    }
  }, [search]);

  // The cancelled flag is the same guard SupplierDirectoryPage uses: a
  // fast filter change must not let a stale response overwrite fresher
  // state.
  useEffect(() => {
    let cancelled = false;
    // Every outcome at once: the tabs filter here, so each can say how
    // many it holds.
    communityRequestAPI.getRequests({ outcome: '', search })
      .then((rows) => {
        if (!cancelled) {
          setRequests(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load requests.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [search]);

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

  // Requests, fifteen to a page; back to page one when the list changes.
  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, requests.filter(v.test).length])),
    [requests],
  );
  const visible = useMemo(() => requests.filter(view.test), [requests, view]);
  const requestPage = usePaged(visible, TABLE_PAGE_SIZE, `${search}|${view.id}|${visible.length}`);

  return (
    <PageShell>
      <PageHeader
        title="Benevolent requests"
        description="Phone-in and walk-in requests for goods from the public, and what happened to each one."
        actions={
          <Button type="button" onClick={() => { setMode('create'); setFormError(null); }}>
            <Plus />
            Log a request
          </Button>
        }
      />

      <ErrorBanner className="mt-4" message={error} onRetry={load} />

      <ViewTabs
        className="mt-5"
        label="Request views"
        value={view.id}
        onChange={changeView}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          // Mounted through a reload, so the search box keeps its focus.
          header={
            <ListToolbar
              search={{
                value: search,
                onChange: (value) => { setIsLoading(true); setSearch(value); },
                placeholder: 'Search by item or caller name',
              }}
            />
          }
          footer={!isLoading && visible.length ? <TablePager {...requestPage} noun="requests" alwaysShow /> : null}
        >
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={PhoneIncoming}
              title={search ? 'No requests match' : 'Nothing in this view'}
              description={search ? 'Nothing matches the search.' : 'No request has this outcome.'}
              action={search ? { label: 'Clear search', onClick: () => { setIsLoading(true); setSearch(''); } } : undefined}
            />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-5">Requested</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Quantity note</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestPage.slice.map((r) => {
                const resolved = r.outcome !== 'pending';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap pl-4 text-muted-foreground sm:pl-5">
                      {fmtDateTime(r.requestedAt)}
                    </TableCell>
                    <TableCell className="min-w-40 max-w-xs whitespace-pre-line">
                      {r.itemsRequested}
                    </TableCell>
                    <TableCell className="min-w-32 whitespace-normal text-muted-foreground">
                      {r.quantityNote || '—'}
                    </TableCell>
                    <TableCell className="min-w-36 whitespace-normal text-muted-foreground">
                      {r.callerName || 'Not given'}
                      {r.callerContact ? (
                        <span className="block text-xs">{r.callerContact}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <StatusBadge kind="communityRequest" status={r.outcome}>
                        {OUTCOME_LABELS[r.outcome] ?? r.outcome}
                      </StatusBadge>
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
                    <TableCell className="whitespace-nowrap pr-4 text-right sm:pr-5">
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
          )}
        </ListCard>
      </div>

      {mode === 'create' ? (
        <DetailPanel open onClose={() => { setMode('list'); setFormError(null); }} title="Log a request">
          <CommunityRequestForm
            onSubmit={create}
            onCancel={() => { setMode('list'); setFormError(null); }}
            busy={busy}
            error={formError}
          />
        </DetailPanel>
      ) : null}

      {resolving ? (
        <ResolvePanel
          key={resolving.id}
          request={resolving}
          busy={busy}
          error={formError}
          onSubmit={resolve}
          onCancel={() => { setResolving(null); setFormError(null); }}
        />
      ) : null}
    </PageShell>
  );
}
