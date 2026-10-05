// ─────────────────────────────────────────────────────────────
// client/src/features/pickingSlips/components/SlipList.jsx
//
// The week's slips: search and labels above, tick boxes down the left,
// the beneficiary's name as the way into one slip. Same shared pieces
// as the Inventory list (ListToolbar, BulkActionBar, SortableHead).
//
// Bulk actions, for the ticked slips the action applies to:
//   Assign to…        hand them to one worker (on the floor or claimed)
//   Assign to floor   release claimed ones back for anyone to take
//   Print labels      one pallet label each
// A ticked slip the action cannot apply to (already packed, say) is
// left alone, and the bar says how many will actually change.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { ClipboardList, Printer, Undo2, UserRoundCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import ListCard from '@/components/ui/list-card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import StatusBadge from '@/components/ui/status-badge';
import SortableHead from '@/components/ui/sortable-head';
import TablePager from '@/components/ui/table-pager';
import ListToolbar from '@/components/ui/list-toolbar';
import BulkActionBar from '@/components/ui/bulk-action-bar';
import useTableView from '@/features/masterdata/hooks/useTableView';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/hooks/usePaged';
import {
  SLIP_STATE_LABEL, canAssign, canRelease, dayLabel, filterSlips, packers, slipState,
} from '../slipViews';
import { rowIntent } from '@/lib/recordCache';

// Problems first when sorting by status.
const STATE_RANK = {
  not_collected: 6, pending: 5, in_progress: 4, complete: 3, dispatched: 2, collected: 1, cancelled: 0,
};

const COLUMNS = [
  { key: 'name',   label: 'Beneficiary', alwaysOn: true, sort: (s) => (s.ecd_name ?? '').toLowerCase() },
  { key: 'day',    label: 'Dispatch',    minWidth: 'sm', sort: (s) => s.dispatch_date_iso ?? '' },
  { key: 'status', label: 'Status',      alwaysOn: true, numeric: true, sort: (s) => STATE_RANK[slipState(s)] ?? 0 },
  { key: 'packer', label: 'Packer',      minWidth: 'md', sort: (s) => (packers(s) || '').toLowerCase() },
  { key: 'items',  label: 'Packed',      minWidth: 'md', numeric: true, align: 'right',
    sort: (s) => (Number(s.total_items) ? Number(s.confirmed_items) / Number(s.total_items) : 0) },
];

function BulkAssign({ slips, workers, onAssign }) {
  const [workerId, setWorkerId] = useState('');
  const [open, setOpen] = useState(false);
  const eligible = slips.filter(canAssign);
  const taken = eligible.filter((s) => s.status === 'in_progress' && String(s.assigned_to) !== workerId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" disabled={eligible.length === 0}>
          <UserRoundCheck /> Assign to…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <p className="text-sm font-medium">Assign {eligible.length} slip{eligible.length === 1 ? '' : 's'} to</p>
          <Select value={workerId || undefined} onValueChange={setWorkerId}>
            <SelectTrigger aria-label="Worker" className="w-full"><SelectValue placeholder="Choose a worker" /></SelectTrigger>
            <SelectContent>
              {workers.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>{w.first_name} {w.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {workerId && taken.length ? (
            <p className="text-xs text-muted-foreground">
              {taken.length} of these {taken.length === 1 ? 'is' : 'are'} being packed by someone else and will move to this worker.
            </p>
          ) : null}
          {eligible.length < slips.length ? (
            <p className="text-xs text-muted-foreground">
              {slips.length - eligible.length} ticked slip{slips.length - eligible.length === 1 ? ' is' : 's are'} already packed or closed and will be left alone.
            </p>
          ) : null}
          <Button
            type="button" size="sm" className="w-full" disabled={!workerId}
            onClick={() => { setOpen(false); onAssign(eligible, Number(workerId)); }}
          >
            Assign
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function SlipList({
  slips = [], view = 'all', isLoading = false, workers = [], weekText = '',
  onOpen, onIntent, onAssign, onRelease, onPrintLabels,
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  // A new tab or week is a new list; ticks from the last one would act
  // on rows that are no longer on screen.
  const listKey = `${view}|${weekText}`;
  const [lastKey, setLastKey] = useState(listKey);
  if (listKey !== lastKey) {
    setLastKey(listKey);
    setSelected(new Set());
  }

  const tableView = useTableView('pickingSlips', COLUMNS);
  const { sortRows, visibleColumns: columns } = tableView;

  const rows = useMemo(() => sortRows(filterSlips(slips, { view, search })), [slips, view, search, sortRows]);
  const page = usePaged(rows, TABLE_PAGE_SIZE, `${listKey}|${search}|${tableView.sort?.key}|${tableView.sort?.direction}|${slips.length}`);

  const selectedSlips = useMemo(() => slips.filter((s) => selected.has(s.id)), [slips, selected]);
  const allTicked  = rows.length > 0 && rows.every((s) => selected.has(s.id));
  const someTicked = !allTicked && rows.some((s) => selected.has(s.id));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allTicked ? new Set() : new Set(rows.map((s) => s.id)));
  const clear = () => setSelected(new Set());

  const releasable = selectedSlips.filter(canRelease);
  const sort = tableView.sort ? { key: tableView.sort.key, dir: tableView.sort.direction } : null;

  const header = selectedSlips.length ? (
    <BulkActionBar count={selectedSlips.length} noun="slips" onClear={clear}>
      <BulkAssign slips={selectedSlips} workers={workers} onAssign={(list, id) => { clear(); onAssign(list, id); }} />
      <Button
        type="button" variant="outline" size="sm" disabled={releasable.length === 0}
        onClick={() => { clear(); onRelease(releasable); }}
      >
        <Undo2 /> Assign to floor{releasable.length && releasable.length < selectedSlips.length ? ` (${releasable.length})` : ''}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => onPrintLabels(selectedSlips)}>
        <Printer /> Print pallet labels
      </Button>
    </BulkActionBar>
  ) : (
    <ListToolbar
      search={{ value: search, onChange: setSearch, placeholder: 'Search by beneficiary name' }}
      columns={{
        idPrefix: 'slips',
        columns: tableView.availableColumns,
        hidden: tableView.hidden,
        onToggle: tableView.toggleColumn,
        onReset: tableView.resetColumns,
      }}
    >
      {/* Labels for exactly the slips the list is showing. */}
      <Button type="button" variant="outline" size="sm" disabled={rows.length === 0} onClick={() => onPrintLabels(rows)}>
        <Printer /> Print labels ({rows.length})
      </Button>
    </ListToolbar>
  );

  return (
    <ListCard
      header={header}
      footer={!isLoading && rows.length ? <TablePager {...page} noun="slips" alwaysShow /> : null}
    >
      {isLoading ? (
        <div className="space-y-2 p-4" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={search.trim() ? 'No slips match this search' : slips.length ? 'Nothing in this view' : 'No slips this week'}
          description={
            search.trim() ? 'No beneficiary on this week\'s slips matches what you typed.'
              : slips.length ? 'No slip this week is in this state right now.'
              : 'Generate the week\'s slips, or move to another week.'
          }
          action={search.trim() ? { label: 'Clear the search', onClick: () => setSearch('') } : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4 sm:pl-5">
                <Checkbox
                  checked={allTicked} indeterminate={someTicked} onCheckedChange={toggleAll}
                  aria-label={allTicked ? 'Untick all slips in this view' : 'Tick all slips in this view'}
                />
              </TableHead>
              {columns.map((c) => (
                <SortableHead
                  key={c.key} label={c.label} sortKey={c.key} sort={sort}
                  onSort={tableView.toggleSort} align={c.align}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.slice.map((slip) => {
              const ticked = selected.has(slip.id);
              const state = slipState(slip);
              return (
                <TableRow
                  key={slip.id}
                  data-state={ticked ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => onOpen(slip.id)}
                  {...(onIntent ? rowIntent(() => onIntent(slip.id)) : null)}
                >
                  <TableCell className="w-10 pl-4 sm:pl-5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={ticked} onCheckedChange={() => toggleOne(slip.id)} aria-label={`Select ${slip.ecd_name}`} />
                  </TableCell>
                  {columns.map((c) => {
                    if (c.key === 'name') return (
                      <TableCell key={c.key} className="max-w-64 whitespace-normal">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpen(slip.id); }}
                          className="block max-w-full break-words text-left font-medium hover:underline"
                        >
                          {slip.ecd_name}
                        </button>
                        <span className="block text-xs text-muted-foreground">
                          {slip.cohort === 'thursday' ? 'Thursday' : 'Tuesday'} cohort
                        </span>
                      </TableCell>
                    );
                    if (c.key === 'day') return (
                      <TableCell key={c.key} className="tabular-nums text-muted-foreground">{dayLabel(slip.dispatch_date_iso)}</TableCell>
                    );
                    if (c.key === 'status') return (
                      <TableCell key={c.key}>
                        <StatusBadge kind="pickingSlip" status={state}>{SLIP_STATE_LABEL[state] ?? state}</StatusBadge>
                      </TableCell>
                    );
                    if (c.key === 'packer') return (
                      <TableCell key={c.key} className="text-muted-foreground">{packers(slip) || '—'}</TableCell>
                    );
                    return (
                      <TableCell key={c.key} className="text-right tabular-nums">
                        {slip.confirmed_items ?? 0} of {slip.total_items ?? 0}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </ListCard>
  );
}
