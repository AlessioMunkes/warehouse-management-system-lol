// ─────────────────────────────────────────────────────────────
// client/src/pages/CommunityRequestsPage.jsx
//
// Benevolent requests (ADM-5.0 / BR-28), the manager's screen.
//
// A member of the public phones or walks in asking for goods. Staff log
// the request; a manager approves it by choosing real products and
// quantities from the stock list (which sets that stock aside); a worker
// packs it and confirms what actually went out; or the manager declines
// it. The floor logs and packs on its own screen,
// StaffCommunityRequestsPage.
//
// The tabs follow that flow, and each row offers what comes next:
//   Awaiting approval  → Approve and choose items
//   Approved           → Assign packer · Decline
//   Needs new items    → Choose other items · Decline
//                        (a pallet used the stock that was set aside;
//                         pallets always come first)
//   Fulfilled · Declined · All
//                        (a fulfilled request's detail offers Reverse:
//                         the stock goes back and it ends as declined)
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, PhoneIncoming } from 'lucide-react';
import communityRequestAPI from '../services/communityRequestAPI';
import { getManifest } from '../services/stockAPI';
import { fetchAssignableWorkers } from '../services/pickingAPI';
import CommunityRequestForm from '../features/communityRequests/CommunityRequestForm';
import ApproveItemsPanel from '../features/communityRequests/ApproveItemsPanel';
import DeclinePanel from '../features/communityRequests/DeclinePanel';
import ReversePanel from '../features/communityRequests/ReversePanel';
import AssignPanel from '../features/communityRequests/AssignPanel';
import RequestDetailPanel from '../features/communityRequests/RequestDetailPanel';
import {
  DISPLAY_LABELS, VIEWS, displayStatus, isFlagged, packerLabel, rowsForView, shortProductNames, viewById,
} from '../features/communityRequests/requestViews';
import { timeAgo } from '../features/notifications/notificationMatrix';
import { fmtQty } from '@/lib/quantity';

import { Button }   from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import TablePager from '@/components/ui/table-pager';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/usePaged';
import useTableView from '@/features/masterdata/useTableView';
import useListFilters from '@/features/masterdata/useListFilters';

// Every column but when it was requested can be hidden; the last column
// is the row's buttons and always shows.
const COLUMNS = [
  { key: 'requested', label: 'Requested', alwaysOn: true },
  { key: 'items', label: 'Items' },
  { key: 'notes', label: 'Quantity and collection notes' },
  { key: 'caller', label: 'Caller' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: '', alwaysOn: true },
];
// The tabs narrow by where a request has got to; these by who handled it.
const REQUEST_FILTERS = [
  { key: 'loggedBy', label: 'Logged by', valueOf: (r) => r.loggedByName },
  { key: 'packer', label: 'Packer', valueOf: (r) => r.assignedToName },
  { key: 'handledBy', label: 'Handled by', valueOf: (r) => r.handledByName },
];
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import DetailPanel from '@/components/ui/detail-panel';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import { formatShortDateTime as fmtDateTime } from '@/lib/dates';

const EMPTY = {
  pending:       'Nothing is waiting for approval.',
  approved:      'No approved request is waiting to be packed.',
  'needs-items': 'No request needs new items.',
  fulfilled:     'No request has been fulfilled yet.',
  declined:      'No request has been declined.',
  all:           'No requests yet. Log one when someone calls.',
};

// The manager's screen. The floor logs requests on its own screen,
// StaffCommunityRequestsPage.
export default function CommunityRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewById(searchParams.get('status'));
  const changeView = (id) => setSearchParams(id === VIEWS[0].id ? {} : { status: id }, { replace: true });

  // What panel is open: { type: 'create' | 'approve' | 'rechoose' |
  // 'decline' | 'assign' | 'detail', request }
  const [panel, setPanel] = useState(null);
  const [products, setProducts] = useState(null);   // null until loaded
  const [workers, setWorkers] = useState(null);

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

  const closePanel = () => { setPanel(null); setFormError(null); };

  // ── Opening a panel ─────────────────────────────────────────
  // Stock is read fresh each time: what is available changes as pallets
  // are packed.
  const openItems = (type, request) => {
    setFormError(null);
    setProducts(null);
    setPanel({ type, request });
    getManifest()
      .then(setProducts)
      .catch((err) => setFormError(err.message || 'Could not load the stock list.'));
  };

  const openAssign = (request) => {
    setFormError(null);
    setWorkers(null);
    setPanel({ type: 'assign', request });
    fetchAssignableWorkers()
      .then((rows) => setWorkers(rows ?? []))
      .catch((err) => setFormError(err.message || 'Could not load the packers.'));
  };

  // ── Doing things ────────────────────────────────────────────
  // One shape for all of them: busy while it runs, the server's message
  // in the open panel if it is refused, the list reloaded if it works.
  const act = async (work, failure) => {
    setBusy(true); setFormError(null);
    try {
      await work();
      closePanel();
      await load();
    } catch (err) {
      setFormError(err.message || failure);
    } finally {
      setBusy(false);
    }
  };

  const create = (payload) => act(() => communityRequestAPI.logRequest(payload), 'Could not log the request.');

  const submitItems = (items) => act(
    () => (panel.type === 'rechoose'
      ? communityRequestAPI.rechooseItems(panel.request.id, items)
      : communityRequestAPI.approveRequest(panel.request.id, items)),
    'Could not save the items.',
  );

  const decline = (reason) => act(
    () => communityRequestAPI.declineRequest(panel.request.id, reason),
    'Could not decline the request.',
  );

  const reverse = (reason) => act(
    () => communityRequestAPI.reverseRequest(panel.request.id, reason),
    'Could not reverse the request.',
  );

  const assign = (userId) => act(
    () => communityRequestAPI.assignRequest(panel.request.id, userId),
    'Could not assign the packer.',
  );

  // ── The list ────────────────────────────────────────────────
  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, requests.filter(v.test).length])),
    [requests],
  );
  const tableView = useTableView('communityRequests', COLUMNS);
  const show = tableView.isVisible;
  const listFilters = useListFilters(REQUEST_FILTERS, requests);
  const { apply: applyFilters } = listFilters;
  const visible = useMemo(() => applyFilters(rowsForView(requests, view)), [requests, view, applyFilters]);
  const requestPage = usePaged(visible, TABLE_PAGE_SIZE, `${search}|${view.id}|${visible.length}`);

  return (
    <PageShell>
      <PageHeader
        title="Benevolent requests"
        description="Log, approve and record food parcel requests."
        actions={
          <Button type="button" onClick={() => { setPanel({ type: 'create' }); setFormError(null); }}>
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
        tabs={VIEWS.filter((v) => !v.onlyWhenAny || counts[v.id] > 0 || v.id === view.id)
          .map((v) => ({ id: v.id, label: v.label, alert: v.alert, count: isLoading ? null : counts[v.id] }))}
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
              filters={listFilters.filters}
              onClearAll={() => { setIsLoading(true); setSearch(''); listFilters.clear(); }}
              columns={{
                idPrefix: 'requests',
                columns: tableView.availableColumns,
                hidden: tableView.hidden,
                onToggle: tableView.toggleColumn,
                onReset: tableView.resetColumns,
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
              description={search ? 'Nothing matches the search.' : EMPTY[view.id]}
              action={search ? { label: 'Clear search', onClick: () => { setIsLoading(true); setSearch(''); } } : undefined}
            />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-5">Requested</TableHead>
                {show('items') ? <TableHead>Items</TableHead> : null}
                {show('notes') ? <TableHead className="min-w-28 whitespace-normal">Quantity and collection notes</TableHead> : null}
                {show('caller') ? <TableHead>Caller</TableHead> : null}
                {show('status') ? <TableHead>Status</TableHead> : null}
                {/* Not sticky: a sticky column sat on top of Caller and
                    Status at laptop widths and folded over them as the
                    table scrolled. Short labels keep it narrow instead. */}
                <TableHead className="pr-4 sm:pr-5"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestPage.slice.map((r) => {
                const resolved = r.outcome !== 'pending' && r.outcome !== 'approved';
                const status = displayStatus(r);
                const flagged = isFlagged(r);
                const packer = packerLabel(r);
                return (
                  <TableRow key={r.id}>
                    {/* The date over the time: one line was the widest cell. */}
                    <TableCell className="whitespace-nowrap pl-4 text-muted-foreground sm:pl-5">
                      {fmtDateTime(r.requestedAt).split(', ').map((part) => <span key={part} className="block">{part}</span>)}
                    </TableCell>
                    {show('items') ? (
                      <TableCell className="min-w-40 max-w-xs whitespace-pre-line">
                        {r.itemsRequested}
                        {r.items.length > 0 ? (
                          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground" aria-label="Items chosen">
                            {r.items.map((i) => (
                              <li key={i.id} className={i.shortAt ? 'text-warn' : undefined}>
                                {i.productName} · {fmtQty(i.quantityApproved, i.unit)}{i.shortAt ? ' (short)' : ''}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </TableCell>
                    ) : null}
                    {show('notes') ? (
                      <TableCell className="min-w-16 max-w-48 whitespace-pre-line text-muted-foreground">
                        {r.quantityNote || '-'}
                      </TableCell>
                    ) : null}
                    {show('caller') ? (
                      <TableCell className="min-w-28 whitespace-normal text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => setPanel({ type: 'detail', request: r })}
                          className="text-left text-foreground underline-offset-2 hover:underline focus-visible:underline"
                        >
                          {r.callerName || 'Not given'}
                        </button>
                        {r.callerContact ? (
                          <span className="block text-xs">{r.callerContact}</span>
                        ) : null}
                      </TableCell>
                    ) : null}
                    {show('status') ? (
                      <TableCell className="whitespace-normal">
                        <StatusBadge kind="communityRequest" status={status}>
                          {DISPLAY_LABELS[status] ?? status}
                        </StatusBadge>
                        {flagged ? (
                          <span className="mt-1 block max-w-xs text-xs text-warn">
                            Needs new items · flagged {timeAgo(r.itemsShortAt)}
                            {shortProductNames(r).length ? `. ${shortProductNames(r).join(', ')} ran short.` : ''}
                          </span>
                        ) : null}
                        {resolved && r.outcomeNote ? (
                          <span className="mt-1 block max-w-xs text-xs text-muted-foreground whitespace-pre-line">
                            {r.outcomeNote}
                          </span>
                        ) : null}
                        {resolved && r.handledByName ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Handled by {r.handledByName}
                          </span>
                        ) : null}
                        {!resolved && packer ? (
                          <span className="mt-1 block text-xs text-muted-foreground">{packer}</span>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap pr-4 text-right sm:pr-5">
                      {resolved ? (
                        <span className="text-xs text-muted-foreground">
                          {fmtDateTime(r.resolvedAt)}
                        </span>
                      ) : r.outcome === 'pending' ? (
                        <Button type="button" size="sm" aria-label="Approve and choose items" onClick={() => openItems('approve', r)}>
                          Approve
                        </Button>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {flagged ? (
                            <Button type="button" size="sm" aria-label="Choose other items" onClick={() => openItems('rechoose', r)}>
                              Other items
                            </Button>
                          ) : (
                            <Button type="button" variant="outline" size="sm" aria-label="Assign packer" onClick={() => openAssign(r)}>
                              Assign
                            </Button>
                          )}
                          <Button
                            type="button" variant="outline" size="sm"
                            onClick={() => { setFormError(null); setPanel({ type: 'decline', request: r }); }}
                          >
                            Decline
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

      {panel?.type === 'create' ? (
        <DetailPanel open onClose={closePanel} title="Log a request">
          <CommunityRequestForm
            onSubmit={create}
            onCancel={closePanel}
            busy={busy}
            error={formError}
          />
        </DetailPanel>
      ) : null}

      {panel?.type === 'approve' || panel?.type === 'rechoose' ? (
        <ApproveItemsPanel
          key={`${panel.type}-${panel.request.id}`}
          request={panel.request}
          mode={panel.type}
          products={products}
          busy={busy}
          error={formError}
          onSubmit={submitItems}
          onDecline={() => { setFormError(null); setPanel({ type: 'decline', request: panel.request }); }}
          onClose={closePanel}
        />
      ) : null}

      {panel?.type === 'decline' ? (
        <DeclinePanel
          key={panel.request.id}
          request={panel.request}
          busy={busy}
          error={formError}
          onSubmit={decline}
          onCancel={closePanel}
        />
      ) : null}

      {panel?.type === 'reverse' ? (
        <ReversePanel
          key={panel.request.id}
          request={panel.request}
          busy={busy}
          error={formError}
          onSubmit={reverse}
          onCancel={closePanel}
        />
      ) : null}

      {panel?.type === 'assign' ? (
        <AssignPanel
          key={panel.request.id}
          request={panel.request}
          workers={workers}
          busy={busy}
          error={formError}
          onSubmit={assign}
          onCancel={closePanel}
        />
      ) : null}

      {panel?.type === 'detail' ? (
        <RequestDetailPanel
          request={panel.request}
          onClose={closePanel}
          onReverse={() => { setFormError(null); setPanel({ type: 'reverse', request: panel.request }); }}
        />
      ) : null}
    </PageShell>
  );
}
