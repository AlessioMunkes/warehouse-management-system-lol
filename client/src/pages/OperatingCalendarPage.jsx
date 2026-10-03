// ─────────────────────────────────────────────────────────────
// client/src/pages/OperatingCalendarPage.jsx
//
// The operating calendar (managers and admins): which weekday each
// cohort collects on, and the days the warehouse is shut — public
// holidays and closures. The server reads it in three places:
// collection reminders are not sent for a closed day, the not-collected
// cut-off does not write off pallets due on one, and the week's slips
// cannot be generated for one.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarOff, Flag, Plus, Trash2 } from 'lucide-react';
import calendarAPI from '../services/calendarAPI';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NativeSelect from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import StatusBadge from '@/components/ui/status-badge';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ViewTabs from '@/components/ui/view-tabs';
import ListCard from '@/components/ui/list-card';
import DetailPanel from '@/components/ui/detail-panel';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import Notice from '@/components/ui/notice';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const COHORTS = [
  { id: 'tuesday',  label: 'Tuesday cohort' },
  { id: 'thursday', label: 'Thursday cohort' },
];
const KIND_LABEL = { public_holiday: 'Public holiday', closure: 'Closure' };

const todaySast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());
// 1 = Monday … 7 = Sunday, as the server counts.
const isoWeekday = (iso) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const fmtDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

const VIEWS = [
  { id: 'upcoming', label: 'Upcoming', test: (c, today) => c.date >= today },
  { id: 'past',     label: 'Past',     test: (c, today) => c.date < today },
  { id: 'all',      label: 'All',      test: () => true },
];

// ── Collection days ──────────────────────────────────────────
function CollectionDays({ saved, onSave, busy }) {
  const [days, setDays] = useState(saved);
  const changed = COHORTS.some((c) => days[c.id] !== saved[c.id]);
  const clash = days.tuesday === days.thursday;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Collection days</CardTitle>
        <CardDescription>
          Choose the weekday each cohort collects on. Slips are generated for this day; reminders go out the day before.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        {COHORTS.map((c) => (
          <label key={c.id} className="grid gap-1.5 text-sm">
            <span className="font-medium">{c.label}</span>
            <NativeSelect
              className="w-44"
              value={days[c.id] ?? ''}
              onChange={(e) => setDays((d) => ({ ...d, [c.id]: Number(e.target.value) }))}
            >
              {WEEKDAYS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </NativeSelect>
          </label>
        ))}
        <Button type="button" disabled={!changed || clash || busy} onClick={() => onSave(days)} loading={busy}>
          {busy ? 'Saving…' : 'Save collection days'}
        </Button>
        {clash ? <p className="w-full text-sm text-danger">The two cohorts need different days.</p> : null}
      </CardContent>
    </Card>
  );
}

// ── Adding closed days ───────────────────────────────────────
function AddClosurePanel({ busy, error, onSubmit, onClose }) {
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [kind, setKind] = useState('closure');
  const [label, setLabel] = useState('');
  const ready = date && label.trim() && (!endDate || endDate >= date);
  return (
    <DetailPanel
      open
      onClose={onClose}
      title="Add a closed day"
      actions={(
        <>
          <Button type="button" disabled={!ready || busy}
            onClick={() => onSubmit({ date, endDate: endDate || undefined, kind, label: label.trim() })} loading={busy}>
            {busy ? 'Saving…' : 'Close the warehouse'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </>
      )}
    >
      <p className="text-sm text-muted-foreground">
        Reminders and the not-collected cut-off skip closed days.
      </p>
      <ErrorBanner message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">First day</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Last day <span className="font-normal text-muted-foreground">(optional)</span></span>
          <Input type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Type</span>
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="closure">Closure (stocktake, shutdown, other)</option>
          <option value="public_holiday">Public holiday</option>
        </NativeSelect>
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Reason</span>
        <Input value={label} maxLength={120} placeholder="e.g. Year-end shutdown" onChange={(e) => setLabel(e.target.value)} />
      </label>
    </DetailPanel>
  );
}

function PublicHolidaysPanel({ busy, error, onSubmit, onClose }) {
  const thisYear = Number(todaySast().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  return (
    <DetailPanel
      open
      onClose={onClose}
      title="Add public holidays"
      actions={(
        <>
          <Button type="button" disabled={busy} onClick={() => onSubmit(year)} loading={busy}>
            {busy ? 'Adding…' : `Add ${year}’s public holidays`}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </>
      )}
    >
      <p className="text-sm text-muted-foreground">
        Adds South Africa’s public holidays for the year, including Easter and Sunday holidays moved to Monday.
        Days already closed are kept. Add once-off holidays as a closed day.
      </p>
      <ErrorBanner message={error} />
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Year</span>
        <NativeSelect className="w-32" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </NativeSelect>
      </label>
    </DetailPanel>
  );
}

// ── Page ─────────────────────────────────────────────────────
export default function OperatingCalendarPage() {
  const [calendar, setCalendar] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [panel, setPanel] = useState(null);       // 'closure' | 'holidays'
  const [panelError, setPanelError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try { setCalendar(await calendarAPI.getCalendar()); } catch (err) { setError(err.message || 'Could not load the calendar.'); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    calendarAPI.getCalendar()
      .then((c) => { if (!cancelled) setCalendar(c); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the calendar.'); });
    return () => { cancelled = true; };
  }, []);

  const today = todaySast();
  const closures = useMemo(() => calendar?.closures ?? [], [calendar]);
  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, closures.filter((c) => v.test(c, today)).length])),
    [closures, today],
  );
  const view = VIEWS.find((v) => v.id === tab) ?? VIEWS[0];
  const rows = closures.filter((c) => view.test(c, today));
  const cohortOn = (iso) => COHORTS.find((c) => calendar?.cohorts?.[c.id] === isoWeekday(iso));

  const run = async (work, done) => {
    setBusy(true); setPanelError(null); setError(null);
    try {
      const result = await work();
      setNotice(done(result));
      setPanel(null);
      await load();
    } catch (err) {
      if (panel) setPanelError(err.message); else setError(err.message);
    } finally { setBusy(false); }
  };
  const added = ({ created = [], alreadyClosed = 0 }) =>
    `${created.length} day${created.length === 1 ? '' : 's'} closed${alreadyClosed ? `; ${alreadyClosed} already were` : ''}.`;

  return (
    <PageShell>
      <PageHeader
        title="Operating calendar"
        description="Set each cohort’s collection day and the days the warehouse is closed. Reminders and the not-collected cut-off skip closed days."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={() => { setPanelError(null); setPanel('holidays'); }}>
              <Flag /> Add public holidays
            </Button>
            <Button type="button" onClick={() => { setPanelError(null); setPanel('closure'); }}>
              <Plus /> Add closed day
            </Button>
          </>
        )}
      />

      <ErrorBanner className="mt-4" message={error} onRetry={load} />
      <Notice className="mt-4" message={notice} onClear={() => setNotice(null)} />

      <div className="mt-6">
        {calendar ? (
          <CollectionDays
            key={`${calendar.cohorts.tuesday}-${calendar.cohorts.thursday}`}
            saved={calendar.cohorts}
            busy={busy && !panel}
            onSave={(days) => run(() => calendarAPI.setCohortDays(days), () => 'Collection days saved.')}
          />
        ) : <Skeleton className="h-36 w-full" />}
      </div>

      <h2 className="mt-8 text-lg font-medium">Closed days</h2>
      <ViewTabs
        className="mt-3"
        label="Closed day views"
        value={tab}
        onChange={setTab}
        tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: calendar ? counts[v.id] : null }))}
      />
      <div className="mt-6">
        <ListCard>
          {!calendar ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title={tab === 'past' ? 'No past closed days' : 'No closed days coming up'}
              description="Add this year’s public holidays, and any day the warehouse will be shut."
              action={tab === 'past' ? undefined : { label: 'Add public holidays', onClick: () => setPanel('holidays') }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Collection affected</TableHead>
                  <TableHead><span className="sr-only">Remove</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const cohort = cohortOn(c.date);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{fmtDay(c.date)}</TableCell>
                      <TableCell className="whitespace-normal font-medium">{c.label}</TableCell>
                      <TableCell><StatusBadge kind="closure" status={c.kind}>{KIND_LABEL[c.kind] ?? c.kind}</StatusBadge></TableCell>
                      <TableCell className="text-muted-foreground">{cohort ? `${cohort.label} misses its collection` : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${c.label} on ${fmtDay(c.date)}`}
                          onClick={() => setRemoving(c)}>
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ListCard>
      </div>

      {panel === 'closure' ? (
        <AddClosurePanel
          busy={busy} error={panelError} onClose={() => setPanel(null)}
          onSubmit={(body) => run(() => calendarAPI.addClosure(body), added)}
        />
      ) : null}
      {panel === 'holidays' ? (
        <PublicHolidaysPanel
          busy={busy} error={panelError} onClose={() => setPanel(null)}
          onSubmit={(year) => run(() => calendarAPI.addPublicHolidays(year), added)}
        />
      ) : null}

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open the warehouse on {removing ? fmtDay(removing.date) : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.label} comes off the calendar. Reminders and the not-collected cut-off treat it as a normal day again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it closed</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const c = removing;
              setRemoving(null);
              run(() => calendarAPI.removeClosure(c.id), () => `${c.label} removed; the warehouse is open that day.`);
            }}>
              Remove closed day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
