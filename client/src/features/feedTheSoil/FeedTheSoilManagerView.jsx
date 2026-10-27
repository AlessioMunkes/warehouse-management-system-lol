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
import { useSearchParams } from 'react-router-dom';
import collectionKitAPI from '../../services/collectionKitAPI';
import formatKitCode from './kitCode';

import { Button }   from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Sprout } from 'lucide-react';
import TablePager from '@/components/ui/table-pager';
import SortableHead from '@/components/ui/sortable-head';
import useSortable from '@/lib/useSortable';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/usePaged';
import useDetailFocus from '../masterdata/useDetailFocus';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import ListToolbar from '@/components/ui/list-toolbar';
import useTableView from '@/features/masterdata/useTableView';
import useListFilters from '@/features/masterdata/useListFilters';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import { formatShortDate as fmtDate } from '@/lib/dates';
import {
  KIT_COLUMNS,
  RECORD_COLUMNS,
  KIT_FILTERS,
  RECORD_FILTERS,
  columnsProp,
  fmtKg,
  KIT_SORT,
  RECORD_SORT,
  TABS,
} from './feedTheSoilLists';
import {
  KitStatus,
  AssignKitPanel,
  LogCompostPanel,
  DispatchPanel,
  LogPickKitPanel,
  KitDetail,
  RecordDetail,
} from './FeedTheSoilPanels';
import DropPointsTab from './DropPointsTab';

// Columns menu: every column but the kit code can be hidden.

export default function FeedTheSoilManagerView() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => (searchParams.get('status') === 'idle' ? 'idle' : 'kits'));
  const kitsTab = tab === 'kits' || tab === 'idle';
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
    const load = kitsTab ? loadKits() : loadRecords();
    load.finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [kitsTab, loadKits, loadRecords]);

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
  const idleKits = kits.filter((k) => k.is_idle);
  const kitView = useTableView('fts-kits', KIT_COLUMNS);
  const recordView = useTableView('fts-records', RECORD_COLUMNS);
  const kShow = kitView.isVisible;
  const rShow = recordView.isVisible;
  const kitFilters = useListFilters(KIT_FILTERS, kits);
  const recordFilters = useListFilters(RECORD_FILTERS, records);
  const shownKits = kitFilters.apply(tab === 'idle' ? idleKits : kits);
  const filteredRecords = recordFilters.apply(records);
  const kitSort = useSortable(shownKits, KIT_SORT);
  const kitPage = usePaged(kitSort.rows, TABLE_PAGE_SIZE, `${tab}|${kitSearch}|${shownKits.length}|${kitSort.sort?.key}|${kitSort.sort?.dir}`);
  // Records, fifteen to a page.
  const recordSort = useSortable(filteredRecords, RECORD_SORT);
  const recordPage = usePaged(recordSort.rows, TABLE_PAGE_SIZE, `${recordSearch}|${filteredRecords.length}|${recordSort.sort?.key}|${recordSort.sort?.dir}`);
  // The page's main action follows the tab, and only on the list itself.
  const onList = view === 'list' && !selectedKit && !selectedRecord;
  const headerAction = !onList || tab === 'sites' ? null : kitsTab ? (
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

      <ErrorBanner className="mt-4" message={error} onRetry={kitsTab ? loadKits : loadRecords} />

      <ViewTabs
        className="mt-5"
        label="Feed the Soil views"
        value={tab}
        onChange={(id) => { setTab(id); setView('list'); setSelectedKit(null); setSelectedRecord(null); }}
        tabs={TABS.filter((t) => t.id !== 'idle' || idleKits.length > 0 || tab === 'idle')
          .map((t) => (t.id === 'idle' ? { ...t, count: idleKits.length } : t))}
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
        ) : tab === 'sites' ? (
          <DropPointsTab />
        ) : kitsTab ? (
          <ListCard
            header={(
              <ListToolbar
                search={{ value: kitSearch, onChange: setKitSearch, placeholder: 'Search by owner or suburb' }}
                filters={kitFilters.filters}
                onClearAll={() => { setKitSearch(''); kitFilters.clear(); }}
                columns={columnsProp('fts-kits', kitView)}
              />
            )}
            footer={!isLoading && shownKits.length ? <TablePager {...kitPage} noun="kits" alwaysShow /> : null}
          >
            {isLoading ? (
              <div className="space-y-2 p-4" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : shownKits.length === 0 ? (
              <EmptyState
                icon={Sprout}
                title={kitSearch || kitFilters.active ? 'No kits match' : tab === 'idle' ? 'No idle kits' : 'No kits assigned yet'}
                description={kitSearch || kitFilters.active ? 'Nothing matches the search or filters.' : tab === 'idle'
                  ? 'Every kit has had compost logged, or was given out less than three months ago.'
                  : 'Assign a kit to a community member to start.'}
              />
            ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Kit" sortKey="kit" sort={kitSort.sort} onSort={kitSort.toggle} />
                {kShow('owner') ? <SortableHead label="Owner" sortKey="owner" sort={kitSort.sort} onSort={kitSort.toggle} /> : null}
                {kShow('suburb') ? <SortableHead label="Suburb" sortKey="suburb" sort={kitSort.sort} onSort={kitSort.toggle} /> : null}
                {kShow('status') ? <SortableHead label="Status" sortKey="status" sort={kitSort.sort} onSort={kitSort.toggle} /> : null}
                {kShow('lastLogged') ? <SortableHead label="Last logged" sortKey="lastLogged" sort={kitSort.sort} onSort={kitSort.toggle} /> : null}
                {kShow('assigned') ? <SortableHead label="Assigned" sortKey="assigned" sort={kitSort.sort} onSort={kitSort.toggle} /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {kitPage.slice.map((k) => (
                <TableRow key={k.id} className="cursor-pointer" onClick={() => openKit(k.id)}>
                  <TableCell className="font-medium">{formatKitCode(k.id)}</TableCell>
                  {kShow('owner') ? <TableCell>{k.owner_name}</TableCell> : null}
                  {kShow('suburb') ? <TableCell className="text-muted-foreground">{k.suburb || '-'}</TableCell> : null}
                  {kShow('status') ? <TableCell><KitStatus status={k.status} /></TableCell> : null}
                  {kShow('lastLogged') ? <TableCell className="text-muted-foreground">{fmtDate(k.last_logged_at)}</TableCell> : null}
                  {kShow('assigned') ? <TableCell className="text-muted-foreground">{fmtDate(k.assigned_at)}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
            )}
          </ListCard>
        ) : (
          <ListCard
            header={(
              <ListToolbar
                search={{ value: recordSearch, onChange: setRecordSearch, placeholder: 'Search by owner or suburb' }}
                filters={recordFilters.filters}
                onClearAll={() => { setRecordSearch(''); recordFilters.clear(); }}
                columns={columnsProp('fts-records', recordView)}
              />
            )}
            footer={!isLoading && filteredRecords.length ? <TablePager {...recordPage} noun="records" alwaysShow /> : null}
          >
            {isLoading ? (
              <div className="space-y-2 p-4" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filteredRecords.length === 0 ? (
              <EmptyState
                icon={Sprout}
                title={recordSearch || recordFilters.active ? 'No records match' : 'No compost logged yet'}
                description={recordSearch || recordFilters.active ? 'Nothing matches the search or filters.' : 'Log a collection against a kit when compost comes in.'}
              />
            ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Kit" sortKey="kit" sort={recordSort.sort} onSort={recordSort.toggle} />
                {rShow('owner') ? <SortableHead label="Owner" sortKey="owner" sort={recordSort.sort} onSort={recordSort.toggle} /> : null}
                {rShow('logged') ? <TableHead>Logged</TableHead> : null}
                {rShow('weight') ? <TableHead className="text-right">Weight</TableHead> : null}
                {rShow('sentTo') ? <TableHead>Sent to</TableHead> : null}
                {rShow('status') ? <SortableHead label="Status" sortKey="status" sort={recordSort.sort} onSort={recordSort.toggle} /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordPage.slice.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => openRecord(r.id)}>
                  <TableCell className="font-medium">{formatKitCode(r.kit_id)}</TableCell>
                  {rShow('owner') ? <TableCell className="text-muted-foreground">{r.owner_name}{r.suburb ? ` · ${r.suburb}` : ''}</TableCell> : null}
                  {rShow('logged') ? <TableCell className="text-muted-foreground">{fmtDate(r.logged_at)}</TableCell> : null}
                  {rShow('weight') ? <TableCell className="text-right tabular-nums">{fmtKg(r.kg_compost)}</TableCell> : null}
                  {rShow('sentTo') ? <TableCell className="text-muted-foreground">{r.dispatched_to || '-'}</TableCell> : null}
                  {rShow('status') ? <TableCell><KitStatus status={r.status} /></TableCell> : null}
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
