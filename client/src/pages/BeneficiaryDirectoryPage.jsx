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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth }     from '../context/AuthContext';
import BeneficiaryForm from '../features/beneficiaries/components/BeneficiaryForm';
import beneficiaryAPI  from '../services/beneficiaryAPI';
import useTableView    from '../features/masterdata/hooks/useTableView';
import useOpenFromQuery from '../features/masterdata/hooks/useOpenFromQuery';
import MasterDataTable from '../features/masterdata/components/MasterDataTable';
import {
  BENEFICIARY_COLUMNS, COHORT_LABELS,
} from '../features/beneficiaries/components/beneficiaryColumns';

import { Button }    from '@/components/ui/button';
import { Skeleton }  from '@/components/ui/skeleton';
import StatusBadge   from '@/components/ui/status-badge';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs      from '@/components/ui/view-tabs';
import ListCard      from '@/components/ui/list-card';
import ListToolbar   from '@/components/ui/list-toolbar';
import DetailPanel   from '@/components/ui/detail-panel';
import EmptyState    from '@/components/ui/empty-state';
import ErrorBanner   from '@/components/ui/error-banner';
import { Plus, Pencil, Power, ShieldCheck, RotateCcw, Building2 } from 'lucide-react';
import { useRecordCache } from '@/lib/recordCache';

const CAN_MANAGE = ['manager', 'admin'];
const OTHER_COHORT = { tuesday: 'thursday', thursday: 'tuesday' };

// Cohort and approval as tabs, client-side over the fetched rows, so
// neither races the server-side search or "Show inactive".
const VIEWS = [
  { id: 'all',      label: 'All',               test: () => true },
  { id: 'tuesday',  label: 'Tuesday',           test: (b) => b.cohort === 'tuesday' },
  { id: 'thursday', label: 'Thursday',          test: (b) => b.cohort === 'thursday' },
  { id: 'pending',  label: 'Awaiting approval', alert: true, test: (b) => !b.approvedAt },
];

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const BeneficiaryDetail = ({ beneficiary, canManage, onEdit, onToggleActive, onApprove, onRollbackCohort, onClose }) => (
  <DetailPanel
    open
    onClose={onClose}
    eyebrow={`${COHORT_LABELS[beneficiary.cohort] ?? beneficiary.cohort} cohort`}
    title={beneficiary.name}
    badges={!beneficiary.approvedAt || beneficiary.isActive === false ? <>
      {beneficiary.approvedAt ? null : <StatusBadge kind="record" status="inactive">Awaiting approval</StatusBadge>}
      {beneficiary.isActive === false ? <StatusBadge kind="record" status="inactive">Inactive</StatusBadge> : null}
    </> : null}
    actions={canManage ? (
      <>
        {!beneficiary.approvedAt ? (
          <Button type="button" onClick={onApprove}>
            <ShieldCheck />
            Approve
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onEdit}>
          <Pencil />
          Edit details
        </Button>
        <Button type="button" variant="outline" onClick={onRollbackCohort}>
          <RotateCcw />
          Move to {COHORT_LABELS[OTHER_COHORT[beneficiary.cohort]] ?? 'other cohort'}
        </Button>
        <Button type="button" variant="outline" onClick={onToggleActive}>
          <Power />
          {beneficiary.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      </>
    ) : null}
  >
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Contact</dt><dd>{beneficiary.contactName || '—'}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">Email</dt><dd className="break-words">{beneficiary.contactEmail || '—'}</dd></div>
      <div><dt className="text-muted-foreground">Mobile</dt><dd>{beneficiary.mobileNumber || '—'}</dd></div>
      <div><dt className="text-muted-foreground">Children served</dt><dd>{beneficiary.childCount ?? 'Not recorded'}</dd></div>
      <div><dt className="text-muted-foreground">Approved</dt><dd>{beneficiary.approvedAt ? fmtDate(beneficiary.approvedAt) : 'Not yet approved'}</dd></div>
      <div><dt className="text-muted-foreground">Last collection</dt><dd>{fmtDate(beneficiary.lastCollectedDate)}</dd></div>
    </dl>

    {!beneficiary.approvedAt ? (
      <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Approve this centre before it can receive picking slips.
      </p>
    ) : null}
  </DetailPanel>
);

// ── Page ──────────────────────────────────────────────────────
export default function BeneficiaryDirectoryPage() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE.includes(user?.role);

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list'); // list | create | edit

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [tab, setTab] = useState('all');
  const view = useTableView('beneficiaries', BENEFICIARY_COLUMNS);
  const current = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];

  const visibleBeneficiaries = useMemo(
    () => view.sortRows(beneficiaries.filter(current.test)),
    [beneficiaries, current, view],
  );
  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, beneficiaries.filter(v.test).length])),
    [beneficiaries],
  );

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
    beneficiaryAPI.getBeneficiaries({ includeInactive, search })
      .then((rows) => {
        if (!cancelled) {
          setBeneficiaries(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load beneficiaries.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [includeInactive, search]);

  // A centre, and its add/edit form, open in the panel down the right;
  // the list stays where it was behind it.
  // A row click reuses what resting on the row already asked for; every
  // other caller (after a save, from a link) reads the record again.
  const records = useRecordCache((id) => beneficiaryAPI.getBeneficiary(id));
  const open = async (id, { fresh = true } = {}) => {
    setError(null);
    try {
      setSelected(await records.load(id, { fresh }));
      setMode('list');
    } catch (err) { setError(err.message); }
  };
  const startCreate = () => { setSelected(null); setMode('create'); };
  const startEdit = () => setMode('edit');
  // ?open=<id> from the admin Activity / Archive screens.
  useOpenFromQuery(open);

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

  const rollbackCohort = async () => {
    setError(null);
    try {
      await beneficiaryAPI.rollbackCohort(selected.id);
      await loadBeneficiaries();
      await open(selected.id);
    } catch (err) { setError(err.message); }
  };

  return (
    <PageShell>
      <PageHeader
        title="Beneficiaries"
        description="Add, approve and update the centres that collect food."
        actions={canManage ? (
          <Button type="button" onClick={startCreate}>
            <Plus />
            Add beneficiary
          </Button>
        ) : null}
      />

      <ErrorBanner className="mt-4" message={error} onRetry={loadBeneficiaries} />

      <ViewTabs
        className="mt-5"
        label="Beneficiary views"
        value={tab}
        onChange={setTab}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert, count: isLoading ? null : counts[v.id] }))}
      />

      <div className="mt-6">
        <ListCard
          // Mounted through a reload: the search triggers the fetch, and
          // swapping it for a skeleton would lose focus after each letter.
          header={
            <ListToolbar
              search={{
                value: search,
                onChange: (value) => { setIsLoading(true); setSearch(value); },
                placeholder: 'Search by name or contact',
              }}
              filters={[{
                key: 'inactive', label: 'Show inactive', active: includeInactive,
                onToggle: () => { setIsLoading(true); setIncludeInactive((v) => !v); },
              }]}
              columns={{
                idPrefix: 'beneficiaries',
                columns: view.availableColumns,
                hidden: view.hidden,
                onToggle: view.toggleColumn,
                onReset: view.resetColumns,
              }}
            />
          }
        >
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visibleBeneficiaries.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No beneficiaries match"
              description={search ? 'Nothing matches the search.' : 'Nobody is in this view.'}
              action={search ? { label: 'Clear search', onClick: () => { setIsLoading(true); setSearch(''); } } : undefined}
            />
          ) : (
            <MasterDataTable
              columns={view.visibleColumns}
              rows={visibleBeneficiaries}
              sort={view.sort}
              onToggleSort={view.toggleSort}
              onOpenRow={(b) => open(b.id, { fresh: false })}
              onRowIntent={(b) => records.warm(b.id)}
              noun="beneficiaries"
            />
          )}
        </ListCard>
      </div>

      {mode === 'list' && selected ? (
        <BeneficiaryDetail
          key={selected.id}
          beneficiary={selected}
          canManage={canManage}
          onEdit={startEdit}
          onToggleActive={toggleActive}
          onApprove={approve}
          onRollbackCohort={rollbackCohort}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {mode === 'create' ? (
        <DetailPanel open onClose={() => setMode('list')} title="Add a beneficiary">
          <BeneficiaryForm onSubmit={create} onCancel={() => setMode('list')} busy={busy} />
        </DetailPanel>
      ) : null}

      {mode === 'edit' && selected ? (
        <DetailPanel open onClose={() => setMode('list')} eyebrow="Edit" title={selected.name}>
          <BeneficiaryForm
            initial={selected}
            submitLabel="Save changes"
            onSubmit={save}
            onCancel={() => setMode('list')}
            busy={busy}
          />
        </DetailPanel>
      ) : null}
    </PageShell>
  );
}
