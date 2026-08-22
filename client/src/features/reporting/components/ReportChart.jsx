// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ReportChart.jsx
//
// Renders one { series, chartType } payload. Four shapes, plain SVG,
// no charting dependency.
//
// ACCESSIBILITY IS THE REASON THIS IS HAND-ROLLED
// ACC-01 requires WCAG AA and ACC-03 forbids conveying status by
// colour alone. An SVG chart is close to invisible to a screen
// reader, so every shape prints a numeric label and the whole
// component has a table view holding identical data. The toggle is
// not a nicety — it is how a screen-reader user, or anyone who would
// rather read figures, gets the same answer. The table is also the
// CSV source, so the two cannot disagree.
//
// NEGATIVE VALUES: low_stock_items reports how far BELOW the reorder
// threshold each product is, so bars run the other way and zero is
// the line to beat. Handled in HBarView rather than by making the
// metric report an absolute number, because "12 below" is the fact a
// manager acts on.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const RED = '#ef3a40', CHARCOAL = '#2b3336', BORDER = '#e9e3dd', MUTED = '#676767';

// Percentages keep a decimal; counts and weights read better whole.
// "94.7 children" would be nonsense on screen.
const fmt = (value, unit) =>
  unit === '%'
    ? `${Number(value).toFixed(1)}%`
    : Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 0 });

const truncate = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// Enum values arrive as stored. A manager should not have to read
// 'qualifying_pending_donor'.
const humanise = (s) =>
  String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const NumberView = ({ series, unit }) => (
  <div className="py-10 text-center">
    <div className="text-5xl sm:text-6xl font-bold tracking-tight" style={{ color: CHARCOAL }}>
      {fmt(series[0]?.value ?? 0, unit)}
    </div>
    {unit !== '%' && <div className="mt-2 text-sm" style={{ color: MUTED }}>{unit}</div>}
  </div>
);

const BarView = ({ series, unit }) => {
  const max = Math.max(...series.map((r) => r.value), 0) || 1;
  const W = 640, H = 240, PAD_B = 44, PAD_T = 24;
  const slot = W / series.length;
  const barW = Math.min(slot * 0.6, 64);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="presentation">
      <line x1="0" y1={H - PAD_B} x2={W} y2={H - PAD_B} stroke={BORDER} strokeWidth="1.5" />
      {series.map((row, i) => {
        const h = ((row.value / max) * (H - PAD_B - PAD_T)) || 0;
        const x = i * slot + (slot - barW) / 2;
        const y = H - PAD_B - h;
        return (
          <g key={row.label}>
            <rect x={x} y={y} width={barW} height={h} rx="3" fill={RED} />
            {/* Printed value: ACC-03, height is never the only carrier. */}
            <text x={x + barW / 2} y={y - 6} textAnchor="middle"
                  fontSize="12" fontWeight="600" fill={CHARCOAL}>
              {fmt(row.value, unit)}
            </text>
            <text x={x + barW / 2} y={H - PAD_B + 18} textAnchor="middle"
                  fontSize="11" fill={MUTED}>
              {truncate(humanise(row.label), 12)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const HBarView = ({ series, unit }) => {
  // Negative values (below reorder level) need a zero axis with bars
  // running left; all-positive series keep the full width.
  const values  = series.map((r) => r.value);
  const hasNeg  = values.some((v) => v < 0);
  const maxAbs  = Math.max(...values.map(Math.abs), 0) || 1;

  const ROW = 30, LABEL_W = 150, VALUE_W = 62, W = 640;
  const H = series.length * ROW + 8;
  const trackW = W - LABEL_W - VALUE_W;
  const zeroX  = hasNeg ? LABEL_W + trackW : LABEL_W;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="presentation">
      {hasNeg && (
        <line x1={zeroX} y1="0" x2={zeroX} y2={H} stroke={BORDER} strokeWidth="1.5" />
      )}
      {series.map((row, i) => {
        const y = i * ROW + 4;
        const w = (Math.abs(row.value) / maxAbs) * trackW;
        const x = hasNeg ? zeroX - w : LABEL_W;
        return (
          <g key={row.label}>
            <text x="0" y={y + 15} fontSize="12" fill={CHARCOAL}>
              {truncate(humanise(row.label), 22)}
            </text>
            <rect x={x} y={y + 4} width={Math.max(w, 2)} height="16" rx="3" fill={RED} />
            <text x={W} y={y + 16} textAnchor="end"
                  fontSize="12" fontWeight="600" fill={CHARCOAL}>
              {fmt(row.value, unit)}{row.meta?.unit ? ` ${row.meta.unit}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const LineView = ({ series, unit }) => {
  const max = Math.max(...series.map((r) => r.value), 0) || 1;
  const W = 640, H = 240, PAD_B = 44, PAD_T = 28, PAD_X = 24;
  const span = W - PAD_X * 2;
  const step = series.length > 1 ? span / (series.length - 1) : 0;

  const points = series.map((row, i) => ({
    x: PAD_X + i * step,
    y: H - PAD_B - (row.value / max) * (H - PAD_B - PAD_T),
  }));

  // Label every point on a short series, every other on a long one,
  // so values stay readable without overlapping.
  const every = series.length > 8 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="presentation">
      <line x1="0" y1={H - PAD_B} x2={W} y2={H - PAD_B} stroke={BORDER} strokeWidth="1.5" />
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none" stroke={RED} strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round" />
      {series.map((row, i) => (
        <g key={row.label}>
          <circle cx={points[i].x} cy={points[i].y} r="4" fill={RED} />
          {i % every === 0 && (
            <>
              <text x={points[i].x} y={points[i].y - 10} textAnchor="middle"
                    fontSize="11" fontWeight="600" fill={CHARCOAL}>
                {fmt(row.value, unit)}
              </text>
              <text x={points[i].x} y={H - PAD_B + 18} textAnchor="middle"
                    fontSize="11" fill={MUTED}>
                {truncate(row.label, 10)}
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
};

const TableView = ({ series, unit, dimensionLabel }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{dimensionLabel}</TableHead>
        <TableHead className="text-right">{unit === '%' ? 'Percentage' : unit}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {series.map((row) => (
        <TableRow key={row.label}>
          <TableCell>{humanise(row.label)}</TableCell>
          <TableCell className="text-right font-medium">
            {fmt(row.value, unit)}{row.meta?.unit ? ` ${row.meta.unit}` : ''}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

// Built from the same series the table renders, so file and screen
// cannot disagree. Quoted because ECD and product names contain
// commas.
const downloadCSV = (report, dimensionLabel) => {
  const rows = [
    [dimensionLabel, report.meta?.unit ?? 'Value'],
    ...report.series.map((r) => [r.label, r.value]),
  ];
  const csv = rows
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  const range = report.spec.dateRange
    ? `${report.spec.dateRange.from}_${report.spec.dateRange.to}`
    : 'current';
  a.download = `${report.spec.metric}_${range}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export default function ReportChart({ report, dimensionLabel = 'Category' }) {
  const [asTable, setAsTable] = useState(false);
  const { series, chartType, meta } = report;
  const unit = meta?.unit ?? '';

  if (!series || series.length === 0) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: MUTED }}>
        No data for this period. Try widening the date range, or check the report
        builder below to confirm the same report is empty there too.
      </p>
    );
  }

  const Chart = { number: NumberView, bar: BarView, hbar: HBarView, line: LineView }[chartType]
    ?? BarView;

  // One sentence summarising the chart, for screen readers. The
  // visual is marked presentational so it is not announced twice.
  const summary = `${report.description}. ` +
    series.map((r) => `${humanise(r.label)}: ${fmt(r.value, unit)}`).join('. ');

  return (
    <div>
      <div role="img" aria-label={summary}>
        {asTable
          ? <TableView series={series} unit={unit} dimensionLabel={dimensionLabel} />
          : <Chart series={series} unit={unit} />}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm"
                onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'View as chart' : 'View as table'}
        </Button>
        <Button type="button" variant="outline" size="sm"
                onClick={() => downloadCSV(report, dimensionLabel)}>
          Export CSV
        </Button>
      </div>
    </div>
  );
}
