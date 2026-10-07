// ─────────────────────────────────────────────────────────────
// client/src/pages/PickingSlipManagementPage.jsx
//
// The week's picking slips, laid out like every manager list (the
// Inventory pattern): title, the week, view tabs with counts, a
// toolbar, the table, and a panel down the right for one slip.
//
// The pieces live in features/pickingSlips: slipViews.js (what each
// tab means, and the week), SlipList, SlipDetailPanel, SlipForms. This
// file loads data, holds which slip is open, and runs the actions.
//
// WHO PACKS A SLIP
// Workers claim slips from the floor themselves. A manager can also
// hand slips to a named worker, or send claimed ones back to the floor
// ("Assign to floor") — one at a time from the panel, or many at once
// from the bulk bar. Each bulk action is the same per-slip request the
// panel makes, run for each ticked slip it applies to.
//
// URL
//   ?status=<tab>      the tab (the dashboard's Needs attention links)
//   ?date=YYYY-MM-DD   open the week holding that day ("slips generated"
//                      notification)
//   ?open=<id>         open that slip (the admin Activity screen)
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, PackagePlus, ArrowLeft } from 'lucide-react';
import beneficiaryAPI from '../services/beneficiaryAPI';
import productAPI from '../services/productAPI';
import {
  fetchPickingSlips, fetchPickingSlip, fetchAssignableWorkers,
  assignSlip, releaseSlip, addSecondPacker,
} from '../services/pickingAPI';
import { Button } from '@/components/ui/button';
import ViewTabs from '@/components/ui/view-tabs';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import ErrorBanner from '@/components/ui/error-banner';
import { useToast } from '@/components/ui/toastContext';
import { publicAppOrigin, isReachableByPhone } from '../features/packing/palletLabelPdf';
import { buildPickingSlipPdf, loadSlipLogo } from '../features/pickingSlips/pickingSlipPdf';
import useOpenFromQuery from '../features/masterdata/hooks/useOpenFromQuery';
import { takeUrlParam } from '../features/staff/resumeParam';
import SlipList from '../features/pickingSlips/components/SlipList';
import SlipDetailPanel from '../features/pickingSlips/components/SlipDetailPanel';
import { GenerateSlipsForm, CreateSlipForm, EditSlipForm } from '../features/pickingSlips/components/SlipForms';
import {
  VIEWS, countViews, shiftWeek, todaySast, viewById, weekLabel, weekOf,
} from '../features/pickingSlips/slipViews';
import { useRecordCache } from '@/lib/recordCache';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function PickingSlipManagementPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = viewById(searchParams.get('status')).id;

  const [mode, setMode] = useState('list'); // list | generate | create | edit
  const [week, setWeek] = useState(() => {
    const asked = takeUrlParam('date');
    return weekOf(asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : todaySast());
  });

  const [slips, setSlips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [labelError, setLabelError] = useState(null);

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [products, setProducts] = useState([]);

  const [open, setOpen] = useState(null);     // the slip in the panel, with its items
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => countViews(slips), [slips]);

  // ── Data ───────────────────────────────────────────────────
  const loadSlips = useCallback(async () => {
    setError(null);
    try {
      setSlips(await fetchPickingSlips({ from: week.from, to: week.to }));
    } catch (err) {
      setError(err.message || 'Could not load picking slips.');
    }
  }, [week]);

  useEffect(() => {
    let cancelled = false;
    fetchPickingSlips({ from: week.from, to: week.to })
      .then((rows) => { if (!cancelled) { setSlips(rows); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load picking slips.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [week]);

  useEffect(() => {
    let cancelled = false;
    // Each surfaced only where it is used: a failure here costs one
    // picker, not the list.
    beneficiaryAPI.getBeneficiaries({ includeInactive: false })
      .then((rows) => { if (!cancelled) setBeneficiaries(rows); }).catch(() => {});
    fetchAssignableWorkers()
      .then((rows) => { if (!cancelled) setWorkers(rows); }).catch(() => {});
    productAPI.getProducts({ includeInactive: false })
      .then((rows) => { if (!cancelled) setProducts(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const changeWeek = (next) => { setIsLoading(true); setWeek(next); };
  const showWeekOf = async (day) => {
    const next = weekOf(day);
    if (next.from === week.from) await loadSlips();
    else changeWeek(next);
  };

  const changeView = (id) => {
    setSearchParams(id === 'all' ? {} : { status: id }, { replace: true });
  };

  // A row click reuses what resting on the row already asked for; every
  // other caller (after a change, from a link) reads the slip again.
  const records = useRecordCache((slipId) => fetchPickingSlip(slipId));
  const openSlip = useCallback(async (slipId, { fresh = true } = {}) => {
    setError(null);
    try {
      setOpen(await records.load(slipId, { fresh }));
    } catch (err) { setError(err.message); }
  }, [records]);
  useOpenFromQuery(openSlip);

  // ── One slip, from the panel ───────────────────────────────
  const act = async (fn) => {
    if (!open) return;
    setBusy(true);
    try {
      await fn(open.id);
      await loadSlips();
      await openSlip(open.id);
    } catch (err) {
      toast({ variant: 'error', title: 'That did not go through', description: err.message });
    } finally { setBusy(false); }
  };

  // ── Many slips, from the bulk bar ──────────────────────────
  // One request per slip, in turn: they are row-locked server-side
  // and a handful at a time, so there is nothing to gain from racing
  // them. Whatever fails is reported by name; the rest still happen.
  const runEach = async (list, fn, { done, verb }) => {
    setBusy(true);
    const failed = [];
    for (const slip of list) {
      try { await fn(slip); } catch (err) { failed.push(`${slip.ecd_name}: ${err.message}`); }
    }
    await loadSlips();
    setBusy(false);
    const ok = list.length - failed.length;
    if (ok) toast({ variant: 'success', title: done(ok) });
    if (failed.length) {
      toast({ variant: 'error', title: `Could not ${verb} ${plural(failed.length, 'slip')}`, description: failed.join(' · ') });
    }
  };

  const bulkAssign = (list, workerId) => {
    const worker = workers.find((w) => w.id === workerId);
    return runEach(list, (s) => assignSlip(s.id, workerId), {
      verb: 'assign',
      done: (n) => `Assigned ${plural(n, 'slip')} to ${worker ? worker.first_name : 'that worker'}`,
    });
  };

  const bulkRelease = (list) => runEach(list, (s) => releaseSlip(s.id), {
    verb: 'release',
    done: (n) => `${plural(n, 'slip')} back on the floor`,
  });

  // ── Printed picking slips (and their BR-22 QR codes) ────────
  // Generated on demand, never stored: the token does not change, so a
  // reprint carries the same code, and a stored PDF could go stale
  // against an edited slip. The origin is checked so the page can warn
  // when the codes would not scan off this machine — the address itself
  // is not shown; a manager cannot act on a URL.
  const labelOrigin = publicAppOrigin();
  const labelsReachable = isReachableByPhone(labelOrigin);

  // What gets printed is the picking slip itself — the sheet that goes
  // on the pallet, with its items, the logo and the pallet's QR code —
  // one page per slip. The list rows carry no items, so each slip is read
  // in full first, a few at a time.
  const printSlips = async (rows) => {
    setLabelError(null);
    if (rows.length === 0) return;

    // Opened now, inside the click, and pointed at the PDF once it is
    // built. A window opened after the requests below is a pop-up as far
    // as the browser is concerned, and gets blocked.
    const tab = window.open('', '_blank');
    if (!tab) {
      setLabelError('Pop-up blocked — allow pop-ups for this site to open the slips.');
      return;
    }
    try { tab.document.title = 'Preparing picking slips…'; } catch { /* another origin's blank page */ }

    setBusy(true);
    try {
      const full = [];
      const BATCH = 6;
      for (let i = 0; i < rows.length; i += BATCH) {
        full.push(...await Promise.all(rows.slice(i, i + BATCH).map(async (row) => {
          const slip = row.items ? row : await fetchPickingSlip(row.id);
          // The plain calendar day comes from the list row; dispatch_date
          // reads as the day before once a timezone is applied to it.
          const listed = slips.find((s) => s.id === row.id);
          return { ...slip, dispatch_date_iso: listed?.dispatch_date_iso ?? row.dispatch_date_iso ?? slip.dispatch_date_iso };
        })));
      }
      const logo = await loadSlipLogo();
      const { pdf } = buildPickingSlipPdf(full, { origin: labelOrigin, logo });
      tab.location.href = pdf.output('bloburl');

      if (!labelsReachable) {
        console.warn(
          `[picking slips] QR codes generated against "${labelOrigin}", which a phone on mobile data cannot reach. `
          + 'Set VITE_PUBLIC_APP_ORIGIN to override the printed address.',
        );
      }
      const noCode = full.filter((s) => !s.public_token).length;
      if (noCode > 0) setLabelError(`${plural(noCode, 'slip')} had no QR code yet and printed without one.`);
    } catch (err) {
      tab.close();
      setLabelError(err.message || 'Could not prepare the slips. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const backToList = () => setMode('list');

  return (
    <PageShell>
      <PageHeader
        title="Picking slips"
        description="Generate, print and track this week’s pallets. New slips go to the floor for anyone to claim."
        actions={mode === 'list' ? (
          <>
            <Button type="button" variant="outline" onClick={() => setMode('create')}>
              <PackagePlus /> Create a new slip
            </Button>
            <Button type="button" onClick={() => setMode('generate')}>
              <CalendarPlus /> Generate this week's slips
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={backToList}>
            <ArrowLeft /> Back to picking slips
          </Button>
        )}
      />

      {mode === 'generate' ? (
        <div className="mt-6">
          <GenerateSlipsForm onGenerated={showWeekOf} onDone={backToList} />
        </div>
      ) : mode === 'create' ? (
        <div className="mt-6">
          <CreateSlipForm
            beneficiaries={beneficiaries} products={products}
            onCreated={async (day) => { await showWeekOf(day); backToList(); }}
            onCancel={backToList}
          />
        </div>
      ) : mode === 'edit' && open ? (
        <div className="mt-6">
          <EditSlipForm
            slip={open} products={products}
            onSaved={async (day) => { await showWeekOf(day); await openSlip(open.id); backToList(); }}
            onCancel={backToList}
          />
        </div>
      ) : (
        <>
          {/* The week the list covers. Buttons rather than a week
              input: <input type="week"> does not exist in Firefox. */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              type="button" variant="outline" size="icon-sm" aria-label="Previous week"
              onClick={() => changeWeek(shiftWeek(week, -1))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-44 text-center text-sm font-medium tabular-nums" aria-live="polite">
              {weekLabel(week)}
            </span>
            <Button
              type="button" variant="outline" size="icon-sm" aria-label="Next week"
              onClick={() => changeWeek(shiftWeek(week, 1))}
            >
              <ChevronRight />
            </Button>
            {week.from !== weekOf(todaySast()).from ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => changeWeek(weekOf(todaySast()))}>
                This week
              </Button>
            ) : null}
          </div>

          <ErrorBanner className="mt-4" message={error} onRetry={loadSlips} />

          <ViewTabs
            className="mt-4"
            label="Slip views"
            value={view}
            onChange={changeView}
            tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, alert: v.alert, count: isLoading ? null : counts[v.id] }))}
          />

          {/* Whether printed labels will scan, in words a manager can
              act on (ACC-03: icon and sentence both carry it). Printing
              is not blocked — someone testing has to be able to. */}
          {!labelsReachable ? (
            <p
              className="mt-4 flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-destructive"
              title={`Labels would point at ${labelOrigin || 'an address this app could not determine'}`}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>The QR codes on these slips will only work on this computer.</strong>{' '}
                Please don’t print them for the warehouse — a volunteer scanning one
                would not be able to open their pallet.
              </span>
            </p>
          ) : null}
          {labelError ? <p className="mt-2 text-sm text-destructive">{labelError}</p> : null}

          <div className="mt-6">
            <SlipList
              slips={slips}
              view={view}
              isLoading={isLoading}
              workers={workers}
              weekText={week.from}
              onOpen={(slipId) => openSlip(slipId, { fresh: false })}
              onIntent={(slipId) => records.warm(slipId)}
              onAssign={bulkAssign}
              onRelease={bulkRelease}
              onPrintLabels={printSlips}
            />
          </div>
        </>
      )}

      {open && mode === 'list' ? (
        <SlipDetailPanel
          key={open.id}
          slip={open}
          workers={workers}
          busy={busy}
          onAssign={(workerId) => act((id) => assignSlip(id, workerId))}
          onRelease={() => act((id) => releaseSlip(id))}
          onAddSecond={(workerId) => act((id) => addSecondPacker(id, workerId))}
          onEdit={() => setMode('edit')}
          onPrintLabel={() => printSlips([open])}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </PageShell>
  );
}
