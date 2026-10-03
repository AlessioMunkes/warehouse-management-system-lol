// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/OperationalInsight.jsx
//
// The report under an Operations chart. Until "Generate report" is
// clicked, only the button shows. Generating asks the server (and the
// AI, if available) for the write-up, then shows in this order:
//   1. About this chart: what the chart shows, in plain words
//   2. Business view: what it means for Ladles of Love
//   3. Key figures, including the change on the previous period
//   4. Related diagrams: two charts that help explain this one
//   5. Actions: the centres, suppliers, products or packers to follow
//      up with, with contact details and a link to fix it
// "PDF report" prints the same body with a letterhead.
//
// Operations reports only; the server refuses impact metrics here.
// Clicking a name in Actions highlights it on the chart, and back.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowDownRight, ArrowUpRight, ChevronDown, FileText, Mail, Phone, Printer, User,
} from 'lucide-react';
import OperationalChart from './OperationalChart';
import ComboChart from './ComboChart';
import OperationsReportPDF from './OperationsReportPDF';
import { getInsight } from '../../../services/reportingAPI';
import { STAFF } from '../../../routes/paths';
import '../operationalReport.css';

const MUTED  = 'var(--ink-soft)';
const BORDER = 'var(--line)';

const LINKS = {
  beneficiaries:    { to: STAFF.beneficiaries,    label: 'Open beneficiaries' },
  // The floor's screens are not the manager's: deliveries are read on
  // Receipts, decanting runs on the ledger's Decanting tab.
  deliveries:       { to: STAFF.receipts,         label: 'Open receipts' },
  purchaseOrders:   { to: STAFF.purchaseOrders,   label: 'Open purchase orders' },
  stockLedger:      { to: STAFF.stockLedger,      label: 'Open stock ledger' },
  decantingRecords: { to: `${STAFF.stockLedger}?status=decanted`, label: 'Open decanting in the ledger' },
  pickingSlips:     { to: STAFF.pickingSlips,     label: 'Open picking slips' },
};

const LIST_PREVIEW = 5;

// Browser storage can be unavailable (private windows, blocked site
// data). Collapsing still works for the visit; it just is not kept.
const COLLAPSE_KEY = 'op-report-collapsed';
const readCollapsed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]')); } catch { return new Set(); }
};
const writeCollapsed = (set) => {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* not kept */ }
};

function Collapsible({ id, title, note, printMode, children }) {
  const [open, setOpen] = useState(() => printMode || !readCollapsed().has(id));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    const set = readCollapsed();
    if (next) set.delete(id); else set.add(id);
    writeCollapsed(set);
  };
  if (printMode) {
    return (
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {note}
        <div className="mt-2">{children}</div>
      </div>
    );
  }
  return (
    <div>
      <h3>
        <button type="button" onClick={toggle} aria-expanded={open}
          className="flex w-full items-center gap-2 text-left text-sm font-bold">
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          {title}
        </button>
      </h3>
      {open && <>{note}<div className="mt-2">{children}</div></>}
    </div>
  );
}

const formatValue = (value, unit) => {
  const n = Number(value ?? 0);
  if (unit === 'ZAR') return `R${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
  if (unit === 'ZAR/unit') return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (unit === '%') return `${n.toFixed(1)}%`;
  return n.toLocaleString('en-ZA', { maximumFractionDigits: 1 });
};

const unitSuffix = (unit) =>
  !unit || unit === 'ZAR' || unit === 'ZAR/unit' || unit === '%' ? (unit === 'ZAR/unit' ? 'per unit' : '') : unit;

// Direction in words as well as an arrow and a colour — ACC-03.
const TONE_WORD = { good: 'better', bad: 'worse', neutral: '' };
const TONE_COLOR = { good: 'var(--good-ink)', bad: 'var(--brand)', neutral: MUTED };

function Figure({ f }) {
  const hasDelta = f.delta !== null && f.delta !== undefined;
  const Arrow = f.delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-3" style={{ borderColor: BORDER }}>
      <p className="text-xs font-medium" style={{ color: MUTED }}>{f.label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">
        {formatValue(f.value, f.unit)}
        {unitSuffix(f.unit) && <span className="ml-1 text-sm font-medium" style={{ color: MUTED }}>{unitSuffix(f.unit)}</span>}
      </p>
      {hasDelta && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium" style={{ color: TONE_COLOR[f.tone] }}>
          {f.delta !== 0 && <Arrow aria-hidden="true" className="h-3.5 w-3.5" />}
          {f.delta > 0 ? '+' : ''}{f.delta}% {f.deltaLabel}
          {TONE_WORD[f.tone] && <span>({TONE_WORD[f.tone]})</span>}
        </p>
      )}
      {f.note && <p className="mt-1 text-xs" style={{ color: MUTED }}>{f.note}</p>}
    </div>
  );
}

function Contact({ c }) {
  if (!c) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: MUTED }}>
      {c.person && <span className="inline-flex items-center gap-1"><User aria-hidden="true" className="h-3 w-3" />{c.person}</span>}
      {c.phone && (
        <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
          <Phone aria-hidden="true" className="h-3 w-3" />{c.phone}
        </a>
      )}
      {c.email && (
        <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
          <Mail aria-hidden="true" className="h-3 w-3" />{c.email}
        </a>
      )}
    </span>
  );
}

export function ActionList({ list, printMode, highlight, onHighlight }) {
  const [expanded, setExpanded] = useState(false);
  const shown = printMode || expanded ? list.entries : list.entries.slice(0, LIST_PREVIEW);
  const link = LINKS[list.link];

  return (
    <section className="op-avoid-break rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4" style={{ borderColor: BORDER }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold">{list.title}</h4>
        {link && !printMode && (
          <Link to={link.to} className="op-no-print text-xs font-medium underline underline-offset-2">{link.label}</Link>
        )}
      </div>

      {list.total === 0 ? (
        <p className="mt-2 text-sm" style={{ color: MUTED }}>Nothing needs following up here.</p>
      ) : (
        <>
          <p className="mt-1 text-xs" style={{ color: MUTED }}>{list.intro}</p>
          <ol className="mt-3 space-y-2">
            {shown.map((e, i) => (
              <li
                key={`${e.name}-${i}`}
                className="-mx-1 flex gap-3 rounded-lg px-1 text-sm"
                style={highlight === e.name ? { background: 'color-mix(in srgb, var(--viz-1) 12%, transparent)' } : undefined}
              >
                <span aria-hidden="true" className="w-5 shrink-0 text-right font-bold" style={{ color: MUTED }}>{i + 1}.</span>
                <span className="min-w-0">
                  {onHighlight && !printMode ? (
                    <button type="button" onClick={() => onHighlight(highlight === e.name ? null : e.name)}
                      aria-pressed={highlight === e.name}
                      className="text-left font-medium underline-offset-2 hover:underline">
                      {e.name}
                    </button>
                  ) : <span className="font-medium">{e.name}</span>}
                  <span className="block text-xs" style={{ color: MUTED }}>{e.detail}</span>
                  <Contact c={e.contact} />
                </span>
              </li>
            ))}
          </ol>
          {list.total > list.entries.length && (
            <p className="mt-2 text-xs" style={{ color: MUTED }}>
              Showing the {list.entries.length} most urgent of {list.total}.
            </p>
          )}
          {!printMode && list.entries.length > LIST_PREVIEW && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="op-no-print mt-2 text-xs font-medium underline underline-offset-2"
            >
              {expanded ? 'Show fewer' : `Show all ${list.entries.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const SOURCE_NOTE = (n) => (n.source === 'ai'
  ? 'Written by the AI assistant from the figures on this page. Check the numbers before quoting them.'
  : n.fallbackReason
    ? 'The AI assistant was unavailable, so this was written from the figures directly.'
    : 'Written from the figures directly.');

const SectionTitle = ({ children }) => (
  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{children}</h3>
);

// 1. What the chart shows, in words anyone can follow — first, so a
//    reader who has never seen this report knows what they are
//    looking at before being told what to think about it.
export function ChartExplanation({ n }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <SectionTitle>About this chart</SectionTitle>
      <p className="text-base font-bold">{n.headline}</p>
      {n.explanation ? <p>{n.explanation}</p> : null}
      {n.whatHappened ? <p>{n.whatHappened}</p> : null}
      {n.context ? <p>{n.context}</p> : null}
    </div>
  );
}

// 2. The same figures read against what Ladles of Love's operation
//    needs to hold true — is it being met, and what is at risk.
export function BusinessView({ n }) {
  const text = n.businessView ?? n.meaning;
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <SectionTitle>Business view</SectionTitle>
      {text ? <p>{text}</p> : null}
      {n.nextSteps?.length > 0 && (
        <div>
          <h4 className="mt-3 text-sm font-bold">Next steps</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {n.nextSteps.map((st) => <li key={st}>{st}</li>)}
          </ol>
        </div>
      )}
      <p className="pt-1 text-xs" style={{ color: MUTED }}>{SOURCE_NOTE(n)}</p>
    </div>
  );
}

// The body of the report, shared by the screen view and the printed
// copy so the two cannot differ.
function ReportBody({ data, narrative, printMode, highlight, onHighlight }) {
  const { report, figures, related, actions, listRange, combo, target } = data;
  return (
    <div className="space-y-5">
      {narrative && (
        <section className="op-avoid-break rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4 sm:p-5" style={{ borderColor: BORDER }}>
          <ChartExplanation n={narrative} />
        </section>
      )}

      {narrative && (
        <section className="op-avoid-break rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4 sm:p-5" style={{ borderColor: BORDER }}>
          <BusinessView n={narrative} />
        </section>
      )}

      {figures?.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {figures.map((f) => <Figure key={f.label} f={f} />)}
        </div>
      )}

      {printMode && (
        <section className="op-avoid-break">
          <h3 className="mb-2 text-sm font-bold">{report.description}</h3>
          {/* The same Recharts chart as on screen, drawn for paper. The
              PDF sheet is a fixed 794px and visible while it is
              captured, so the chart can measure itself. */}
          <OperationalChart report={report} target={target} hint={report.meta?.chartHint} print />
        </section>
      )}

      {combo && (
        <Collapsible id="combo" title={combo.title} printMode={printMode}>
          <section className="op-avoid-break rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4" style={{ borderColor: BORDER }}>
            <ComboChart combo={combo} syncId={printMode ? 'combo-print' : 'combo'} print={printMode} />
          </section>
        </Collapsible>
      )}

      {/* Two related diagrams, always shown with the report, each with
          a short note on how it connects to the main chart (written
          from the figures when the AI is available). */}
      {related?.length > 0 && (
        <section aria-labelledby="op-related-title">
          <h3 id="op-related-title" className="text-sm font-bold">Related diagrams</h3>
          <p className="mb-2 mt-0.5 text-xs" style={{ color: MUTED }}>
            {related.length === 1 ? 'A chart' : 'Two charts'} that help explain the one above, and how they connect.
          </p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {related.map((r, i) => (
              <section key={r.description} className="op-avoid-break rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 p-4" style={{ borderColor: BORDER }}>
                <p className="text-xs font-medium">{r.description}</p>
                {(narrative?.relatedConnections?.[i] || r.why) && (
                  <p className="mb-2 mt-1 text-xs leading-relaxed" style={{ color: MUTED }}>
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>How it connects: </span>
                    {narrative?.relatedConnections?.[i] || r.why}
                  </p>
                )}
                <OperationalChart report={r} compact print={printMode} />
              </section>
            ))}
          </div>
        </section>
      )}

      {/* Last: who to follow up with, once the reader knows why. */}
      {actions?.length > 0 && (
        <Collapsible
          id="actions" title="Actions" printMode={printMode}
          note={listRange && (
            <p className="text-xs" style={{ color: MUTED }}>
              Lists cover {listRange.from} to {listRange.to}, since this report has no period of its own.
            </p>
          )}
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {actions.map((a) => (
              <ActionList key={a.id} list={a} printMode={printMode} highlight={highlight} onHighlight={onHighlight} />
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

export default function OperationalInsight({ report, highlight, onHighlight, onLoaded }) {
  const [data, setData]           = useState(null);
  // Starts loading: the page remounts this component (key = spec)
  // for every new report, so there is never stale state to clear.
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [writing, setWriting]     = useState(false);
  const [writeError, setWriteError] = useState(null);
  const [printing, setPrinting]   = useState(false);

  const spec = report?.spec;

  useEffect(() => {
    if (!spec) return undefined;
    let cancelled = false;
    getInsight(spec)
      .then((res) => {
        if (cancelled) return;
        const d = res.data ?? res;
        setData(d);
        onLoaded?.(d);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Mount-only on purpose: the page keys this component by spec.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeUp = async () => {
    setWriting(true);
    setWriteError(null);
    try {
      const res = await getInsight(spec, { narrate: true });
      const next = res.data ?? res;
      setData(next);
      setNarrative(next.narrative);
    } catch (err) {
      setWriteError(err.message);
    } finally {
      setWriting(false);
    }
  };

  if (!spec) return null;

  return (
    <div className="mt-5">
      {/* Nothing to show while the breakdown loads: the page is the
          chart above until a report is generated. */}
      {loading && <Skeleton className="h-9 w-44 rounded-lg" />}

      {error && (
        <p className="text-xs" style={{ color: MUTED }}>
          The breakdown for this report could not be loaded ({error}). The chart above is unaffected.
        </p>
      )}

      {data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={writeUp}
              disabled={writing}
              className="bg-ink hover:bg-ink/90 text-on-ink font-bold text-xs tracking-wider rounded-lg px-4"
            >
              <FileText aria-hidden="true" className="mr-2 h-4 w-4" />
              {writing ? 'GENERATING…' : narrative ? 'REGENERATE REPORT' : 'GENERATE REPORT'}
            </Button>
            {/* The PDF is the generated report, so it waits for one. */}
            {narrative && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPrinting(true)}
                className="rounded-lg border text-xs font-bold tracking-wider"
              >
                <Printer aria-hidden="true" className="mr-2 h-4 w-4" />
                PDF REPORT
              </Button>
            )}
            {writeError && (
              <p role="alert" className="text-xs">
                <span aria-hidden="true" className="mr-1 font-bold text-brand">!</span>{writeError}
              </p>
            )}
          </div>

          {/* Until a report is generated the page is just the chart and
              its table above — the write-up, figures, related views and
              actions all arrive together, in reading order. */}
          {narrative ? (
            <ReportBody data={data} narrative={narrative} highlight={highlight} onHighlight={onHighlight} />
          ) : (
            <p className="text-xs" style={{ color: MUTED }}>
              Generate the report for a plain-English explanation of this chart, what it means for the operation, and who to follow up with.
            </p>
          )}
        </>
      )}

      {printing && data && (
        <OperationsReportPDF
          data={data}
          narrative={narrative}
          onClose={() => setPrinting(false)}
          renderBody={(p) => <ReportBody {...p} printMode />}
        />
      )}
    </div>
  );
}
