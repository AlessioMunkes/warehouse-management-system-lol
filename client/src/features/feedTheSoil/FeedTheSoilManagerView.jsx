// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/FeedTheSoilManagerView.jsx
//
// The desktop, oversight-shaped view of Feed the Soil kit tracking —
// same lifecycle as FeedTheSoilFlow.jsx (assign, log, dispatch), same
// status naming, same information architecture (a kit and a record
// are different things to open), different vocabulary (Table/Card,
// not .stf-*) for someone auditing at a desk rather than working a
// bucket by hand.
//
// Two tabs, same split as the staff flow: Kits (assign, search, open
// one for its owner info and full log history) and Records (the flat,
// cross-kit list — not-yet-dispatched first, dispatched at the
// bottom, exactly the order the server already returns). A list row
// identifies a record by its kit only; date, weight and dispatch
// destination live on the record's own detail, opened by clicking the
// row, not repeated in the list.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import collectionKitAPI from '../../services/collectionKitAPI';
import formatKitCode from './kitCode';
import { todayISO } from '../packing/spareSlips';

import { Button }   from '@/components/ui/button';
import StatusBadge from '@/components/ui/status-badge';
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
import { Plus, Loader2, Search, Sprout } from 'lucide-react';
import TablePager from '@/components/ui/table-pager';
import SortableHead from '@/components/ui/sortable-head';
import useSortable from '@/lib/useSortable';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/usePaged';
import useDetailFocus from '../masterdata/useDetailFocus';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';

const STATUS_LABELS = { assigned: 'Assigned', logged: 'Logged', dispatched: 'Dispatched' };
// Amber with the household, blue once compost is in and waiting to go
// to a farm, green when it has gone — lib/statusStyles.js.

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

const fmtKg = (value) => (value === null || value === undefined ? '—' : `${Number(value).toLocaleString('en-ZA')} kg`);

// Click a column name to sort by it. Status sorts in the order a kit
// moves through (assigned → logged → dispatched), not alphabetically.
const STATUS_ORDER = { assigned: 0, logged: 1, dispatched: 2 };
const time = (v) => (v ? new Date(v).getTime() : null);
const KIT_SORT = {
  kit: (k) => Number(k.id),
  owner: (k) => k.owner_name,
  suburb: (k) => k.suburb,
  status: (k) => STATUS_ORDER[k.status] ?? 9,
  lastLogged: (k) => time(k.last_logged_at),
  assigned: (k) => time(k.assigned_at),
};
const RECORD_SORT = {
  kit: (r) => Number(r.kit_id),
  owner: (r) => r.owner_name,
  status: (r) => STATUS_ORDER[r.status] ?? 9,
};

const KitStatus = ({ status }) => (
  <StatusBadge kind="kit" status={status}>{STATUS_LABELS[status] ?? status}</StatusBadge>
);

const TABS = [
  { id: 'kits',    label: 'Kits' },
  { id: 'records', label: 'Records' },
];

// ── Assign-a-kit panel ─────────────────────────────────────────
const AssignKitPanel = ({ busy, error, onSubmit, onCancel }) => {
  const [ownerName, setOwnerName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [assignedAt, setAssignedAt] = useState(todayISO());
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
  const [loggedAt, setLoggedAt] = useState(todayISO());
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

// ── Dispatch panel ───────────────────────────────────────────
// A record needs a destination to count as dispatched — see
// collectionKit.service.js's markDispatched. A one-tap action can't
// capture that, so this is its own small step like Assign/Log.
const DispatchPanel = ({ record, busy, error, onSubmit, onCancel }) => {
  const [dispatchedTo, setDispatchedTo] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = !dispatchedTo.trim();

  const submit = () => {
    setTouched(true);
    if (missing) return;
    onSubmit(dispatchedTo.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mark dispatched · {formatKitCode(record.kit_id)}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}

          <p className="text-sm text-muted-foreground">
            {fmtKg(record.kg_compost)} collected {fmtDate(record.logged_at)}
          </p>

          <Field data-invalid={(touched && missing) || undefined}>
            <FieldLabel htmlFor="fts-dispatch-to">Farmer or drop-off point</FieldLabel>
            <Input
              id="fts-dispatch-to" value={dispatchedTo} onChange={(e) => setDispatchedTo(e.target.value)}
              onBlur={() => setTouched(true)} placeholder="e.g. Voorbrug Farm"
              aria-invalid={(touched && missing) || undefined}
            />
            {touched && missing ? <FieldError>Where this compost went is required.</FieldError> : null}
          </Field>

          <Field orientation="horizontal">
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? 'Marking dispatched' : 'Mark dispatched'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

// ── Pick a kit to log against — reached from the Records tab,
// where no kit is known yet. Reuses the Kits tab's own list.
const LogPickKitPanel = ({ kits, isLoading, search, onSearch, onPick, onCancel }) => (
  <Card>
    <CardHeader><CardTitle>Log a collection</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8" placeholder="Search by owner or suburb"
          value={search} onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : kits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No kits match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kit</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Suburb</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kits.map((k) => (
              <TableRow key={k.id} className="cursor-pointer" onClick={() => onPick(k)}>
                <TableCell className="font-medium">{formatKitCode(k.id)}</TableCell>
                <TableCell>{k.owner_name}</TableCell>
                <TableCell className="text-muted-foreground">{k.suburb || '—'}</TableCell>
                <TableCell><KitStatus status={k.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </CardContent>
  </Card>
);

// ── Kit detail ────────────────────────────────────────────────
const KitDetail = ({ kit, onLogCompost, onOpenRecord, onClose }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>Collection kit details</CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatKitCode(kit.id)} · {kit.owner_name} · {kit.suburb || 'No suburb on record'} · assigned {fmtDate(kit.assigned_at)}
        </p>
      </div>
      <KitStatus status={kit.status} />
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
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kit.records.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpenRecord(r.id)}>
                <TableCell>{fmtDate(r.logged_at)}</TableCell>
                <TableCell><KitStatus status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button type="button" variant="ghost" size="sm" onClick={onClose}>Back to kits</Button>
    </CardContent>
  </Card>
);

// ── Record detail ─────────────────────────────────────────────
// What a record row opens into, whichever tab it was clicked from — a
// record's own date, weight, status and (once dispatched) destination,
// with the kit it belongs to shown as a reference, not the subject.
const RecordDetail = ({ record, onDispatch, onOpenKit, onClose, backLabel }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle>Compost record details</CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatKitCode(record.kit_id)} · {record.owner_name}{record.suburb ? ` · ${record.suburb}` : ''}
        </p>
      </div>
      <KitStatus status={record.status} />
    </CardHeader>
    <CardContent className="space-y-4">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="text-muted-foreground">Date collected</TableCell>
            <TableCell>{fmtDate(record.logged_at)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Weight</TableCell>
            <TableCell>{fmtKg(record.kg_compost)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Notes</TableCell>
            <TableCell>{record.notes || '—'}</TableCell>
          </TableRow>
          {record.status === 'dispatched' ? (
            <>
              <TableRow>
                <TableCell className="text-muted-foreground">Dispatched</TableCell>
                <TableCell>{fmtDateTime(record.dispatched_at)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Sent to</TableCell>
                <TableCell>{record.dispatched_to || '—'}</TableCell>
              </TableRow>
            </>
          ) : null}
        </TableBody>
      </Table>

      <div className="flex flex-wrap gap-2">
        {record.status === 'logged' ? (
          <Button type="button" size="sm" onClick={() => onDispatch(record)}>Mark dispatched</Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenKit(record.kit_id)}>
          View kit details
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>{backLabel}</Button>
      </div>
    </CardContent>
  </Card>
);

export default function FeedTheSoilManagerView() {
  const [tab, setTab] = useState('kits');
  // 'list' | 'assign' | 'log' | 'logPickKit' | 'dispatch'
  const [view, setView] = useState('list');
  const [selectedKit, setSelectedKit] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  // Where a record's "back" action returns to.
  const [recordOrigin, setRecordOrigin] = useState('records');
  // A kit, a record or a form opens above the list: move the page to it.
  const [detailRef, focusDetail] = useDetailFocus();
  const go = (next) => { setView(next); focusDetail(); };

  const [kits, setKits] = useState([]);
  const [kitSearch, setKitSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [recordSearch, setRecordSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
      const res = await collectionKitAPI.listRecords({ search: recordSearch });
      setRecords(res?.data ?? res ?? []);
    } catch (err) {
      setError(err.message || 'Could not load compost records.');
    }
  }, [recordSearch]);

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
      setSelectedRecord(null);
      setView('list');
      focusDetail();
    } catch (err) {
      setError(err.message || 'Could not load this kit.');
    }
  };

  const openRecord = async (id, { fromKit = false } = {}) => {
    setError(null);
    try {
      const res = await collectionKitAPI.getRecord(id);
      setSelectedRecord(res?.data ?? res);
      setSelectedKit(null);
      setRecordOrigin(fromKit ? 'kit' : 'records');
      setView('list');
      focusDetail();
    } catch (err) {
      setError(err.message || 'Could not load this record.');
    }
  };

  const assignKit = async (payload) => {
    setBusy(true); setFormError(null);
    try {
      const res = await collectionKitAPI.createKit(payload);
      const kit = res?.data ?? res;
      setView('list');
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
      setView('list');
      await loadRecords();
      await openKit(selectedKit.id);
    } catch (err) {
      setFormError(err.message || 'Could not log the compost collected.');
    } finally {
      setBusy(false);
    }
  };

  const dispatchRecord = async (dispatchedTo) => {
    if (!selectedRecord) return;
    setBusy(true); setFormError(null);
    try {
      await collectionKitAPI.markDispatched(selectedRecord.id, dispatchedTo);
      await openRecord(selectedRecord.id, { fromKit: recordOrigin === 'kit' });
    } catch (err) {
      setFormError(err.message || 'Could not mark this record dispatched.');
    } finally {
      setBusy(false);
    }
  };

  const closeRecord = async () => {
    setFormError(null);
    if (recordOrigin === 'kit' && selectedRecord) {
      await openKit(selectedRecord.kit_id);
    } else {
      setSelectedRecord(null);
      setView('list');
      await loadRecords();
    }
  };

  // Kits, fifteen to a page.
  const kitSort = useSortable(kits, KIT_SORT);
  const kitPage = usePaged(kitSort.rows, TABLE_PAGE_SIZE, `${kitSearch}|${kits.length}|${kitSort.sort?.key}|${kitSort.sort?.dir}`);
  // Records, fifteen to a page.
  const recordSort = useSortable(records, RECORD_SORT);
  const recordPage = usePaged(recordSort.rows, TABLE_PAGE_SIZE, `${recordSearch}|${records.length}|${recordSort.sort?.key}|${recordSort.sort?.dir}`);
  // The page's main action follows the tab, and only on the list itself.
  const onList = view === 'list' && !selectedKit && !selectedRecord;
  const headerAction = !onList ? null : tab === 'kits' ? (
    <Button type="button" onClick={() => go('assign')}>
      <Plus /> Assign a kit
    </Button>
  ) : (
    <Button type="button" onClick={() => { setFormError(null); go('logPickKit'); }}>
      <Plus /> Log a collection
    </Button>
  );

  return (
    <PageShell>
      <PageHeader
        title="Feed the Soil"
        description="Assign compost kits to households and log the compost collected."
        actions={headerAction}
      />

      <ErrorBanner className="mt-4" message={error} onRetry={tab === 'kits' ? loadKits : loadRecords} />

      <ViewTabs
        className="mt-5"
        label="Feed the Soil views"
        value={tab}
        onChange={(id) => { setTab(id); setView('list'); setSelectedKit(null); setSelectedRecord(null); }}
        tabs={TABS}
      />

      <div ref={detailRef} tabIndex={-1} className="mt-6 space-y-6 scroll-mt-6 outline-none">
        {view === 'assign' ? (
          <AssignKitPanel busy={busy} error={formError} onSubmit={assignKit} onCancel={() => { setView('list'); setFormError(null); }} />
        ) : view === 'log' && selectedKit ? (
          <LogCompostPanel kit={selectedKit} busy={busy} error={formError} onSubmit={logCompost} onCancel={() => setView('list')} />
        ) : view === 'logPickKit' ? (
          <LogPickKitPanel
            kits={kits} isLoading={isLoading} search={kitSearch} onSearch={setKitSearch}
            onPick={(kit) => { setSelectedKit(kit); setFormError(null); go('log'); }}
            onCancel={() => { setView('list'); setFormError(null); }}
          />
        ) : view === 'dispatch' && selectedRecord ? (
          <DispatchPanel
            record={selectedRecord} busy={busy} error={formError}
            onSubmit={dispatchRecord}
            onCancel={() => openRecord(selectedRecord.id, { fromKit: recordOrigin === 'kit' })}
          />
        ) : selectedRecord ? (
          <RecordDetail
            record={selectedRecord}
            onDispatch={() => { setFormError(null); go('dispatch'); }}
            onOpenKit={openKit}
            onClose={closeRecord}
            backLabel={recordOrigin === 'kit' ? 'Back to kit' : 'Back to records'}
          />
        ) : selectedKit ? (
          <KitDetail
            kit={selectedKit}
            onLogCompost={() => go('log')}
            onOpenRecord={(id) => openRecord(id, { fromKit: true })}
            onClose={() => { setSelectedKit(null); loadKits(); }}
          />
        ) : tab === 'kits' ? (
          <ListCard
            header={<ListToolbar search={{ value: kitSearch, onChange: setKitSearch, placeholder: 'Search by owner or suburb' }} />}
            footer={!isLoading && kits.length ? <TablePager {...kitPage} noun="kits" alwaysShow /> : null}
          >
            {isLoading ? (
              <div className="space-y-2 p-4" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : kits.length === 0 ? (
              <EmptyState
                icon={Sprout}
                title={kitSearch ? 'No kits match' : 'No kits assigned yet'}
                description={kitSearch ? 'Nothing matches the search.' : 'Assign a kit to a community member to start.'}
              />
            ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Kit" sortKey="kit" sort={kitSort.sort} onSort={kitSort.toggle} />
                <SortableHead label="Owner" sortKey="owner" sort={kitSort.sort} onSort={kitSort.toggle} />
                <SortableHead label="Suburb" sortKey="suburb" sort={kitSort.sort} onSort={kitSort.toggle} />
                <SortableHead label="Status" sortKey="status" sort={kitSort.sort} onSort={kitSort.toggle} />
                <SortableHead label="Last logged" sortKey="lastLogged" sort={kitSort.sort} onSort={kitSort.toggle} />
                <SortableHead label="Assigned" sortKey="assigned" sort={kitSort.sort} onSort={kitSort.toggle} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {kitPage.slice.map((k) => (
                <TableRow key={k.id} className="cursor-pointer" onClick={() => openKit(k.id)}>
                  <TableCell className="font-medium">{formatKitCode(k.id)}</TableCell>
                  <TableCell>{k.owner_name}</TableCell>
                  <TableCell className="text-muted-foreground">{k.suburb || '—'}</TableCell>
                  <TableCell><KitStatus status={k.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(k.last_logged_at)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(k.assigned_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            )}
          </ListCard>
        ) : (
          <ListCard
            header={<ListToolbar search={{ value: recordSearch, onChange: setRecordSearch, placeholder: 'Search by owner or suburb' }} />}
            footer={!isLoading && records.length ? <TablePager {...recordPage} noun="records" alwaysShow /> : null}
          >
            {isLoading ? (
              <div className="space-y-2 p-4" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : records.length === 0 ? (
              <EmptyState
                icon={Sprout}
                title={recordSearch ? 'No records match' : 'No compost logged yet'}
                description={recordSearch ? 'Nothing matches the search.' : 'Log a collection against a kit when compost comes in.'}
              />
            ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Kit" sortKey="kit" sort={recordSort.sort} onSort={recordSort.toggle} />
                <SortableHead label="Owner" sortKey="owner" sort={recordSort.sort} onSort={recordSort.toggle} />
                <SortableHead label="Status" sortKey="status" sort={recordSort.sort} onSort={recordSort.toggle} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordPage.slice.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => openRecord(r.id)}>
                  <TableCell className="font-medium">{formatKitCode(r.kit_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.owner_name}{r.suburb ? ` · ${r.suburb}` : ''}</TableCell>
                  <TableCell><KitStatus status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            )}
          </ListCard>
        )}
      </div>
    </PageShell>
  );
}
