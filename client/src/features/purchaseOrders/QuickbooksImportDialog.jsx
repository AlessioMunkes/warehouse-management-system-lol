// ─────────────────────────────────────────────────────────────
// client/src/features/purchaseOrders/QuickbooksImportDialog.jsx
//
// "Import QuickBooks links": upload a QuickBooks PO export, check what
// would be linked, confirm, see the result. Four steps in one dialog:
//
//   file     choose the file, then the column with QuickBooks' number
//   preview  every row sorted by what would happen to it
//   confirm  totals only, with a toggle to see which POs are affected
//   done     what was linked and what was skipped
//
// Nothing is written until the last button on "confirm". Conflicts are
// off by default and the user ticks the ones to apply; "needs review"
// rows have no tickbox at all.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import NativeSelect from '@/components/ui/native-select';
import ErrorBanner from '@/components/ui/error-banner';
import { cn } from '@/lib/utils';
import purchaseOrderAPI from '../../services/purchaseOrderAPI';
import { readGrid } from '../reporting/parseUpload';
import {
  MAX_IMPORT_ROWS, REVIEW_REASONS, readTable, guessNumberColumn, extractRows, sortRows,
  mergePreview, conflictShort, conflictDetail, summarise, summaryLines,
} from './quickbooksImport';

const SHOW_FIRST = 50;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// A heading that opens and closes. Collapsed sections still show their
// count, so a long file stays scannable.
function Section({ title, hint, defaultOpen = false, tone, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-left text-sm font-medium"
      >
        <Chevron aria-hidden="true" className="size-4 shrink-0" />
        <span className={cn('whitespace-nowrap', tone === 'warn' && 'text-warn')}>{title}</span>
        {hint ? <span className="font-normal text-muted-foreground">{hint}</span> : null}
      </button>
      {open ? <div className="border-t px-3 py-2">{children}</div> : null}
    </section>
  );
}

// First 50, then a button for the rest.
function Rows({ rows, render }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOW_FIRST);
  return (
    <>
      <ul className="divide-y text-sm">{shown.map(render)}</ul>
      {rows.length > shown.length ? (
        <Button type="button" variant="link" size="sm" onClick={() => setAll(true)}>
          Show all {rows.length}
        </Button>
      ) : null}
    </>
  );
}

const Pair = ({ row }) => (
  <span>
    <span className="font-medium">{row.poNumber ?? row.poNumbers?.join(', ')}</span>
    {row.quickbooksNumber ? <> → {row.quickbooksNumber}</> : null}
  </span>
);

function ConflictRow({ row, ticked, onToggle }) {
  const [open, setOpen] = useState(false);
  const labelId = `qb-conflict-${row.poNumber}`;
  return (
    <li className="py-2">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={ticked}
          onCheckedChange={onToggle}
          aria-labelledby={labelId}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div id={labelId}><Pair row={row} /></div>
          <div className="text-xs text-warn" title={conflictDetail(row)}>
            {conflictShort(row)}
            {' '}
            <button
              type="button"
              className="underline underline-offset-2"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Hide details' : 'Details'}
            </button>
          </div>
          {open ? <p className="mt-1 text-xs text-muted-foreground">{conflictDetail(row)}</p> : null}
        </div>
      </div>
    </li>
  );
}

const RESULT_LABELS = [
  ['linked', 'linked'],
  ['overwritten', 'moved or replaced'],
  ['unchanged', 'already linked, no change'],
  ['skipped_conflict', 'skipped, changed since the preview'],
  ['not_found', 'PO number not found'],
  ['duplicate', 'skipped, repeated'],
  ['invalid', 'skipped, not valid'],
];

export default function QuickbooksImportDialog({ open, onOpenChange, onDone }) {
  const [step, setStep] = useState('file');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState(null);
  const [numberColumn, setNumberColumn] = useState('');
  const [sorted, setSorted] = useState(null);       // { noPo, review }
  const [groups, setGroups] = useState(null);       // mergePreview output
  const [ticked, setTicked] = useState(() => new Set());
  const [showWhich, setShowWhich] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [changed, setChanged] = useState(false);

  const reset = () => {
    setStep('file'); setFileName(''); setTable(null); setNumberColumn('');
    setSorted(null); setGroups(null); setTicked(new Set()); setShowWhich(false);
    setBusy(false); setError(null); setResult(null); setChanged(false);
  };

  const close = () => {
    const didChange = changed;
    reset();
    onOpenChange(false);
    if (didChange) onDone?.();
  };

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { grid } = await readGrid(file);
      const t = readTable(grid);
      setTable(t);
      setFileName(file.name);
      setNumberColumn(guessNumberColumn(t.columns) ?? '');
    } catch (err) {
      setTable(null); setFileName('');
      setError(err.message);
    }
  };

  const checkFile = async () => {
    setBusy(true); setError(null);
    try {
      const rows = extractRows(table, numberColumn);
      const s = sortRows(rows);
      if (s.candidates.length > MAX_IMPORT_ROWS) {
        throw new Error(`That file has ${s.candidates.length} rows to link. Import up to ${MAX_IMPORT_ROWS} at a time: split the file and import it in parts.`);
      }
      const server = s.candidates.length
        ? await purchaseOrderAPI.previewQuickbooksImport(
            s.candidates.map((c) => ({ poNumber: c.poNumber, quickbooksNumber: c.quickbooksNumber })))
        : { rows: [] };
      setSorted({ noPo: s.noPo, review: s.review });
      setGroups(mergePreview(s.candidates, server.rows));
      setTicked(new Set());
      setStep('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const tickedConflicts = useMemo(
    () => (groups ? groups.conflicts.filter((c) => ticked.has(c.poNumber)) : []),
    [groups, ticked],
  );
  const summary = useMemo(
    () => (groups ? summarise(groups.willLink, tickedConflicts) : null),
    [groups, tickedConflicts],
  );

  const toggle = (poNumber) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(poNumber)) next.delete(poNumber); else next.add(poNumber);
    return next;
  });

  const apply = async () => {
    setBusy(true); setError(null);
    try {
      const pairs = [
        ...groups.willLink.map((r) => ({ poNumber: r.poNumber, quickbooksNumber: r.quickbooksNumber, overwrite: false })),
        ...tickedConflicts.map((r) => ({ poNumber: r.poNumber, quickbooksNumber: r.quickbooksNumber, overwrite: true })),
      ];
      const out = await purchaseOrderAPI.applyQuickbooksImport(pairs);
      setResult(out);
      setChanged((out.counts.linked ?? 0) + (out.counts.overwritten ?? 0) > 0);
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reviewCount = groups ? sorted.review.length + groups.extraReview.length : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import QuickBooks links</DialogTitle>
          <DialogDescription>
            {step === 'file' && 'Upload a QuickBooks PO export (.csv or .xlsx). Nothing is changed until you confirm.'}
            {step === 'preview' && `${fileName}: check each group, then continue.`}
            {step === 'confirm' && 'Check the totals, then link.'}
            {step === 'done' && 'The import has finished.'}
          </DialogDescription>
        </DialogHeader>

        <ErrorBanner message={error} />

        {step === 'file' && (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              QuickBooks PO export file
              <Input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={chooseFile} />
            </label>
            {table ? (
              <label className="grid gap-1.5 text-sm font-medium">
                Column with the QuickBooks PO number
                <NativeSelect
                  className="w-full"
                  value={numberColumn}
                  onChange={(e) => setNumberColumn(e.target.value)}
                >
                  <option value="">Choose a column</option>
                  {table.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </NativeSelect>
              </label>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="button" onClick={checkFile} disabled={!table || !numberColumn || busy}>
                {busy ? 'Checking…' : 'Check the file'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && groups && (
          <div className="grid gap-3">
            <p className="text-sm">
              <strong>{groups.willLink.length}</strong> will link
              {' · '}{groups.unchanged.length} already linked
              {' · '}{groups.conflicts.length} {groups.conflicts.length === 1 ? 'conflict' : 'conflicts'}
              {' · '}{reviewCount} need review
              {' · '}{groups.notFound.length} not found
              {' · '}{sorted.noPo.length} without a PO number
            </p>

            <Section title={`${groups.willLink.length} will link`} defaultOpen={groups.willLink.length > 0 && groups.willLink.length <= 10}>
              {groups.willLink.length ? <Rows rows={groups.willLink} render={(r) => <li key={r.poNumber} className="py-1.5"><Pair row={r} /></li>} /> : <p className="text-sm text-muted-foreground">Nothing to link.</p>}
            </Section>

            {groups.conflicts.length > 0 && (
              <Section
                tone="warn"
                title={`${plural(groups.conflicts.length, 'conflict', 'conflicts')}: not applied unless you tick them`}
              >
                <Rows
                  rows={groups.conflicts}
                  render={(r) => (
                    <ConflictRow key={r.poNumber} row={r} ticked={ticked.has(r.poNumber)} onToggle={() => toggle(r.poNumber)} />
                  )}
                />
              </Section>
            )}

            {reviewCount > 0 && (
              <Section tone="warn" title={`${reviewCount} need review`} hint="Nothing is linked for these. Fix them in QuickBooks and import again.">
                <Rows
                  rows={[...sorted.review, ...groups.extraReview]}
                  render={(r, i) => (
                    <li key={`${r.rowNumber}-${i}`} className="py-1.5">
                      <Pair row={r} />
                      <div className="text-xs text-muted-foreground">{REVIEW_REASONS[r.reason] ?? r.message ?? 'This row could not be checked.'}</div>
                    </li>
                  )}
                />
              </Section>
            )}

            {groups.notFound.length > 0 && (
              <Section tone="warn" title={`${groups.notFound.length} PO ${groups.notFound.length === 1 ? 'number' : 'numbers'} not found`} hint="Skipped. Check for a typo or a deleted PO.">
                <Rows rows={groups.notFound} render={(r) => <li key={r.poNumber} className="py-1.5"><Pair row={r} /></li>} />
              </Section>
            )}

            {groups.unchanged.length > 0 && (
              <Section title={`${groups.unchanged.length} already linked`} hint="No change.">
                <Rows rows={groups.unchanged} render={(r) => <li key={r.poNumber} className="py-1.5"><Pair row={r} /></li>} />
              </Section>
            )}

            {sorted.noPo.length > 0 && (
              <Section title={`${sorted.noPo.length} ${sorted.noPo.length === 1 ? 'row has' : 'rows have'} no PO number`} hint="Normal for QuickBooks POs that are not from the warehouse.">
                <Rows rows={sorted.noPo} render={(r) => <li key={r.rowNumber} className="py-1.5 text-muted-foreground">{r.quickbooksNumber ? `QuickBooks PO number ${r.quickbooksNumber}` : 'No QuickBooks PO number'}</li>} />
              </Section>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setStep('file'); setError(null); }}>
                Choose another file
              </Button>
              <Button type="button" onClick={() => { setStep('confirm'); setError(null); }} disabled={summary.total === 0}>
                Continue to confirm
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'confirm' && summary && (
          <div className="grid gap-3">
            <div className="grid gap-1 text-sm">
              {summaryLines(summary).map((line) => <p key={line}>{line}</p>)}
            </div>
            {summary.movedPos.length + summary.replacedPos.length > 0 && (
              <div>
                <Button type="button" variant="link" size="sm" aria-expanded={showWhich} onClick={() => setShowWhich((v) => !v)}>
                  {showWhich ? 'Hide which' : 'Show which'}
                </Button>
                {showWhich && (
                  <ul className="mt-1 divide-y rounded-lg border px-3 text-sm">
                    {summary.movedPos.map((m) => (
                      <li key={`m-${m.to}`} className="py-1.5">
                        {m.quickbooksNumber} moves from {m.from} to {m.to}. {m.from} becomes unlinked.
                      </li>
                    ))}
                    {summary.replacedPos.map((r) => (
                      <li key={`r-${r.poNumber}`} className="py-1.5">
                        {r.poNumber} changes from {r.was} to {r.now}.
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep('preview')} disabled={busy}>
                Back to the preview
              </Button>
              <Button type="button" onClick={apply} disabled={busy || summary.total === 0}>
                {busy ? 'Linking…' : `Link ${plural(summary.total, 'QuickBooks number', 'QuickBooks numbers')}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'done' && result && (
          <div className="grid gap-3">
            <p className="text-sm font-medium">
              {plural((result.counts.linked ?? 0) + (result.counts.overwritten ?? 0), 'link', 'links')} saved.
            </p>
            <ul className="text-sm">
              {RESULT_LABELS.filter(([k]) => result.counts[k]).map(([k, label]) => (
                <li key={k}>{result.counts[k]} {label}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Open a purchase order to see its QuickBooks PO number.
            </p>
            <DialogFooter>
              <Button type="button" onClick={close}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
