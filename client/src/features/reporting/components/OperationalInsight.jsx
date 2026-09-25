// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/OperationalInsight.jsx
//
// Everything under an operational chart that turns it into work:
//   key figures     — the headline, change on the previous period,
//                     and the biggest contributor or latest bucket
//   who to act on   — the named centres, suppliers, products and
//                     packers behind the number, with contact
//                     details and a link to the screen to fix it on
//   written report  — on request: what happened, what the related
//                     charts add, what it means, next steps. Printable.
//
// OPERATIONS ONLY. Used on ReportingPage alone; the server refuses
// impact metrics on /insight, so this cannot drift onto the Impact
// Report page by accident.
//
// Each section can be collapsed; the choice is remembered per
// browser. Clicking a name in a list highlights it on the main chart
// and the reverse, through the page's shared `highlight`.
//
// The figures and lists load with every report because they are
// plain SQL. The written report waits for a click because it calls
// the model, which is rate-limited and sometimes slow.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowDownRight, ArrowUpRight, ChevronDown, FileText, Mail, Phone, Printer, User,
} from 'lucide-react';
import ReportChart from './ReportChart';
import OperationalChart from './OperationalChart';
import ComboChart from './ComboChart';
import { getInsight } from '../../../services/reportingAPI';
import { STAFF } from '../../../routes/paths';
import '../operationalReport.css';

const MUTED  = 'var(--ink-soft)';
const BORDER = 'var(--line)';

const LINKS = {
  beneficiaries:    { to: STAFF.beneficiaries,    label: 'Open beneficiaries' },
  deliveries:       { to: STAFF.deliveries,       label: 'Open deliveries' },
  purchaseOrders:   { to: STAFF.purchaseOrders,   label: 'Open purchase orders' },
  stockLedger:      { to: STAFF.stockLedger,      label: 'Open stock ledger' },
  decantingRecords: { to: STAFF.decantingRecords, label: 'Open decanting sheets' },
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
    <div className="rounded-[4px] border-2 bg-surface p-3" style={{ borderColor: BORDER }}>
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

function ActionList({ list, printMode, highlight, onHighlight }) {
  const [expanded, setExpanded] = useState(false);
  const shown = printMode || expanded ? list.entries : list.entries.slice(0, LIST_PREVIEW);
  const link = LINKS[list.link];

  return (
    <section className="op-avoid-break rounded-[4px] border-2 bg-surface p-4" style={{ borderColor: BORDER }}>
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
                className="-mx-1 flex gap-3 rounded-[4px] px-1 text-sm"
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

function Narrative({ n }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <p className="text-base font-bold">{n.headline}</p>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>What happened</h4>
        <p className="mt-1">{n.whatHappened}</p>
        {n.context && <p className="mt-2">{n.context}</p>}
      </div>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>What this means for the operation</h4>
        <p className="mt-1">{n.meaning}</p>
      </div>
      {n.nextSteps?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Next steps</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {n.nextSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </div>
      )}
      <p className="text-xs" style={{ color: MUTED }}>
        {n.source === 'ai'
          ? 'Written by the AI assistant from the figures on this page. Check the numbers before quoting them.'
          : n.fallbackReason
            ? 'The AI assistant was unavailable, so this reading was written from the figures directly.'
            : 'Written from the figures directly.'}
      </p>
    </div>
  );
}

// The body of the report, shared by the screen view and the printed
// copy so the two cannot differ.
function ReportBody({ data, narrative, printMode, highlight, onHighlight }) {
  const { report, figures, related, actions, listRange, combo } = data;
  return (
    <div className="space-y-5">
      {figures?.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {figures.map((f) => <Figure key={f.label} f={f} />)}
        </div>
      )}

      {narrative && (
        <section className="op-avoid-break rounded-[4px] border-2 bg-surface p-4 sm:p-5" style={{ borderColor: BORDER }}>
          <Narrative n={narrative} />
        </section>
      )}

      {printMode && (
        <section className="op-avoid-break">
          <h3 className="mb-2 text-sm font-bold">{report.description}</h3>
          <ReportChart report={report} compact />
        </section>
      )}

      {actions?.length > 0 && (
        <Collapsible
          id="actions" title="Who to act on" printMode={printMode}
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

      {combo && !printMode && (
        <Collapsible id="combo" title={combo.title}>
          <section className="rounded-[4px] border-2 bg-surface p-4" style={{ borderColor: BORDER }}>
            <ComboChart combo={combo} />
          </section>
        </Collapsible>
      )}

      {related?.length > 0 && (
        <Collapsible id="related" title="Related views" printMode={printMode}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {related.map((r) => (
              <section key={r.description} className="op-avoid-break rounded-[4px] border-2 bg-surface p-4" style={{ borderColor: BORDER }}>
                <p className="mb-2 text-xs font-medium">{r.description}</p>
                {/* Print keeps the static SVG chart: Recharts measures
                    its container, which is hidden until the print
                    dialog opens. */}
                {printMode ? <ReportChart report={r} compact /> : <OperationalChart report={r} compact />}
              </section>
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

  // Printing renders a clean copy straight into <body> and hides
  // everything else (operationalReport.css), so the sidebar, builder
  // and buttons never reach the paper. "Save as PDF" in the print
  // dialog is the download.
  useEffect(() => {
    if (!printing) return undefined;
    document.documentElement.classList.add('op-printing');
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
      document.documentElement.classList.remove('op-printing');
    };
  }, [printing]);

  if (!spec) return null;

  return (
    <div className="mt-5">
      {loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-[4px]" />)}
        </div>
      )}

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
              className="bg-ink hover:bg-ink/90 text-on-ink font-bold text-xs tracking-wider rounded-[4px] px-4"
            >
              <FileText aria-hidden="true" className="mr-2 h-4 w-4" />
              {writing ? 'WRITING…' : narrative ? 'REWRITE REPORT' : 'WRITE UP THIS REPORT'}
            </Button>
            {narrative && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPrinting(true)}
                className="rounded-[4px] border-2 text-xs font-bold tracking-wider"
              >
                <Printer aria-hidden="true" className="mr-2 h-4 w-4" />
                PRINT / SAVE AS PDF
              </Button>
            )}
            {writeError && (
              <p role="alert" className="text-xs">
                <span aria-hidden="true" className="mr-1 font-bold text-brand">!</span>{writeError}
              </p>
            )}
          </div>

          <ReportBody data={data} narrative={narrative} highlight={highlight} onHighlight={onHighlight} />
        </>
      )}

      {printing && data && createPortal(
        <div className="op-print-root text-ink font-['Montserrat',sans-serif]">
          <header className="mb-4 border-b-2 pb-3" style={{ borderColor: BORDER }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Ladles of Love · Operations report</p>
            <h1 className="mt-1 text-xl font-bold">{data.report.description}</h1>
            <p className="text-xs" style={{ color: MUTED }}>
              Generated {new Date(data.generatedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </header>
          <ReportBody data={data} narrative={narrative} printMode />
          {data.report.meta?.caveat && (
            <p className="mt-4 text-xs" style={{ color: MUTED }}>{data.report.meta.caveat}</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
