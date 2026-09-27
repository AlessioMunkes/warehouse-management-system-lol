// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ComparisonInsight.jsx
//
// Generate report, for a scatter comparison. The same shape as a
// single report's (OperationalInsight): nothing but the button until
// asked, then About this chart, Business view, and Actions — here the
// dots in the corner that needs attention — with a PDF of the lot.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runComparison } from '../../../services/reportingAPI';
import { ChartExplanation, BusinessView, ActionList } from './OperationalInsight';
import ComparisonChart from './ComparisonChart';
import OperationsReportPDF from './OperationsReportPDF';

const MUTED = 'var(--ink-soft)';
const BORDER = 'var(--line)';

function Body({ data, narrative, printMode = false }) {
  const actions = data.actions ?? [];
  return (
    <div className="space-y-5">
      <section className="op-avoid-break rounded-[4px] border-2 bg-surface p-4 sm:p-5" style={{ borderColor: BORDER }}>
        <ChartExplanation n={narrative} />
      </section>
      <section className="op-avoid-break rounded-[4px] border-2 bg-surface p-4 sm:p-5" style={{ borderColor: BORDER }}>
        <BusinessView n={narrative} />
      </section>
      {printMode && (
        <section className="op-avoid-break">
          <h3 className="mb-2 text-sm font-bold">{data.description}</h3>
          <ComparisonChart data={data} compact />
        </section>
      )}
      {actions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold">Actions</h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {actions.map((a) => <ActionList key={a.id} list={a} printMode={printMode} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComparisonInsight({ comparison }) {
  const [data, setData] = useState(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState(null);
  const [printing, setPrinting] = useState(false);

  const generate = async () => {
    setWriting(true);
    setError(null);
    try {
      const res = await runComparison(comparison.id, comparison.dateRange, { narrate: true });
      setData(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setWriting(false);
    }
  };

  // What the PDF's letterhead and details strip read.
  const pdfData = data && {
    report: { description: data.description, spec: { dateRange: data.dateRange }, meta: { caveat: data.caveat } },
    generatedAt: data.generatedAt,
  };

  return (
    <div className="mt-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={generate}
          disabled={writing}
          className="bg-ink hover:bg-ink/90 text-on-ink font-bold text-xs tracking-wider rounded-[4px] px-4"
        >
          <FileText aria-hidden="true" className="mr-2 h-4 w-4" />
          {writing ? 'GENERATING…' : data ? 'REGENERATE REPORT' : 'GENERATE REPORT'}
        </Button>
        {data?.narrative && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setPrinting(true)}
            className="rounded-[4px] border-2 text-xs font-bold tracking-wider"
          >
            <Printer aria-hidden="true" className="mr-2 h-4 w-4" />
            PDF REPORT
          </Button>
        )}
        {error && (
          <p role="alert" className="text-xs">
            <span aria-hidden="true" className="mr-1 font-bold text-brand">!</span>{error}
          </p>
        )}
      </div>

      {data?.narrative ? (
        <Body data={data} narrative={data.narrative} />
      ) : (
        <p className="text-xs" style={{ color: MUTED }}>
          Generate the report for a plain-English explanation of this chart, what it means for the operation, and who to follow up with.
        </p>
      )}

      {printing && data?.narrative && (
        <OperationsReportPDF
          data={pdfData}
          narrative={data.narrative}
          onClose={() => setPrinting(false)}
          renderBody={() => <Body data={data} narrative={data.narrative} printMode />}
        />
      )}
    </div>
  );
}
