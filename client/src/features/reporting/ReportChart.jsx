// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ReportChart.jsx
//
// Renders one { series, chartType } payload: a number, bars, ranked
// rows, a line, or bars grouped by month. Drawn with Recharts, like
// every other chart in the app, with the shared hover tip
// (ChartTooltip.jsx) and the theme's chart colours (--viz-N).
//
// ACCESSIBILITY
// ACC-01 requires WCAG AA and ACC-03 forbids conveying status by
// colour alone. So every bar and point prints its figure, the whole
// chart carries a one-sentence summary for a screen reader, and there
// is a table view holding identical data. The toggle is not a nicety:
// it is how a screen-reader user, or anyone who would rather read
// figures, gets the same answer. The table is also the Excel source,
// so the two cannot disagree. The hover tip only adds to what is
// already printed.
//
// NEGATIVE VALUES: low_stock_items reports how far BELOW the reorder
// threshold each product is, so bars run the other way and zero is
// the line to beat. Those rows are all drawn in the "gone wrong" red:
// "this far under" is a warning, not a category.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import ChartTooltip from './ChartTooltip';
import { useChartMotion } from './useChartMotion';
import {
  BAR_CURSOR, BENEFICIARY_COLOURS, LINE_CURSOR, SERIES, entityColours, fitLabel,
  formatLabel as baseLabel, isAdditive,
} from './chartFormat';
import { exportExcel } from '../../lib/excelExport';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const INK = 'var(--ink)', LINE = 'var(--line)', MUTED = 'var(--ink-soft)', SURF = 'var(--surface)';
const UNDER = 'var(--rag-bad)';
// A value axis of at least 0 to 1, so a report whose figures are all
// zero still has a scale to print its "0" labels against.
const ATLEAST_ONE = [0, (max) => Math.max(max, 1)];
const TREND = SERIES[0];

const axisProps = { tick: { fill: MUTED, fontSize: 11 }, axisLine: { stroke: LINE }, tickLine: false };

// Percentages keep a decimal; counts and weights read better whole.
// "94.7 children" would be nonsense on screen.
const fmt = (value, unit) =>
  unit === '%'
    ? `${Number(value).toFixed(1)}%`
    : Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 0 });

const truncate = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// grouped_bar packs two axes into one label ("2026-07|Children", see
// reportCatalog.js's CHART_TYPES note) so it still fits the flat
// [{label,value}] shape every chart type returns. GroupedBarView
// parses that itself for the chart; this handles it for the table,
// the Excel sheet and the screen-reader summary. Months, weeks and
// days read as dates (chartFormat.js), anything else is humanised.
const GROUP_MONTH = /^(\d{4}-\d{2})\|(.+)$/;
const formatLabel = (label) => {
  const groupMonth = GROUP_MONTH.exec(label);
  if (groupMonth) return `${baseLabel(groupMonth[1])} – ${groupMonth[2]}`;
  return baseLabel(label);
};

// The one grouped_bar producer today (meals_served_by_group) uses the
// same colour per group as BeneficiaryTypeChart.jsx, so the two charts
// never disagree about what a colour means. Any other group name (a
// future grouped_bar metric) takes the theme's colours in order.
const GROUP_COLOURS = {
  Children: BENEFICIARY_COLOURS.children,
  Adults: BENEFICIARY_COLOURS.adults,
  Households: BENEFICIARY_COLOURS.households,
};
const colourForGroup = (name, i) => GROUP_COLOURS[name] ?? SERIES[i % SERIES.length];

// An axis label on up to two lines, sized to the slot it sits in.
function FitTick({ x, y, payload, width, visibleTicksCount }) {
  const slot = (Number(width) || 0) / Math.max(visibleTicksCount || 1, 1) - 6;
  return (
    <text x={x} y={y + 10} textAnchor="middle" fontSize={11} fill={MUTED}>
      {fitLabel(formatLabel(payload?.value ?? ''), slot).map((line, i) => (
        <tspan key={line + i} x={x} dy={i === 0 ? 0 : 13}>{line}</tspan>
      ))}
    </text>
  );
}

const NumberView = ({ series, unit }) => (
  <div className="py-10 text-center">
    <div className="text-5xl sm:text-6xl font-bold tracking-tight" style={{ color: INK }}>
      {fmt(series[0]?.value ?? 0, unit)}
    </div>
    {unit !== '%' && <div className="mt-2 text-sm" style={{ color: MUTED }}>{unit}</div>}
  </div>
);

const BarView = ({ rows, unit, tip, colourOf, animate }) => (
  <ResponsiveContainer width="100%" height={260}>
    <BarChart data={rows} margin={{ top: 22, right: 8, left: 8, bottom: 0 }} barCategoryGap="20%">
      <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
      <XAxis dataKey="name" {...axisProps} tick={<FitTick />} height={40} interval={0} />
      <YAxis hide domain={ATLEAST_ONE} />
      {tip(BAR_CURSOR)}
      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={animate}>
        {rows.map((r) => <Cell key={r.name} fill={colourOf(r.name)} />)}
        {/* Printed value: ACC-03, height is never the only carrier. */}
        <LabelList dataKey="value" position="top" fontSize={12} fontWeight={600} fill={INK}
          formatter={(v) => fmt(v, unit)} />
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

const HBarView = ({ rows, unit, tip, colourOf, animate }) => {
  // Negative values (below reorder level) run left from a zero line.
  const hasNeg = rows.some((r) => r.value < 0);
  const values = rows.map((r) => r.value);
  const domain = [Math.min(0, ...values), Math.max(hasNeg ? 0 : 1, ...values)];
  const label = (r) => `${fmt(r.value, unit)}${r.unit ? ` ${r.unit}` : ''}`;
  return (
    <ResponsiveContainer width="100%" height={rows.length * 30 + 16}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, left: 0, bottom: 4 }} barCategoryGap="20%">
        <XAxis type="number" hide domain={domain} />
        <YAxis type="category" dataKey="name" width={150} {...axisProps} axisLine={false}
          tick={{ fill: INK, fontSize: 12 }} tickFormatter={(v) => truncate(formatLabel(v), 22)} />
        {hasNeg ? <ReferenceLine x={0} stroke={LINE} strokeWidth={1.5} /> : null}
        {tip(BAR_CURSOR)}
        <Bar dataKey="value" radius={hasNeg ? [4, 0, 0, 4] : [0, 4, 4, 0]} maxBarSize={18} isAnimationActive={animate}>
          {rows.map((r) => <Cell key={r.name} fill={hasNeg ? UNDER : colourOf(r.name)} />)}
          <LabelList position={hasNeg ? 'left' : 'right'} fontSize={12} fontWeight={600} fill={INK}
            content={({ x, y, width, height, index }) => {
              const r = rows[index];
              if (!r) return null;
              const end = hasNeg ? x + width - 6 : x + width + 6;
              return (
                <text x={end} y={y + height / 2 + 4} fontSize={12} fontWeight={600} fill={INK}
                  textAnchor={hasNeg ? 'end' : 'start'}>
                  {label(r)}
                </text>
              );
            }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const LineView = ({ rows, unit, tip, animate }) => {
  // Every point's value on a short series, every other on a long one,
  // so the figures stay readable without running into each other.
  const every = rows.length > 8 ? 2 : 1;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 24, right: 24, left: 24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
        <XAxis dataKey="name" {...axisProps} tick={<FitTick />} height={40} interval={every - 1} />
        <YAxis hide domain={ATLEAST_ONE} />
        {tip(LINE_CURSOR)}
        <Line type="monotone" dataKey="value" stroke={TREND} strokeWidth={2} isAnimationActive={animate}
          dot={{ r: 4, fill: TREND, stroke: SURF, strokeWidth: 2 }} activeDot={{ r: 6 }}>
          <LabelList dataKey="value" position="top" fontSize={11} fontWeight={600} fill={INK}
            content={({ x, y, value, index }) => (index % every === 0
              ? <text x={x} y={y - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK}>{fmt(value, unit)}</text>
              : null)} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
};

// One cluster per month, one bar per group within it: "compared over
// time" rather than BarView's single snapshot.
const GroupedBarView = ({ series, unit, tip, animate }) => {
  const parsed = series.map((row) => {
    const [month, group] = String(row.label).split('|');
    return { month, group: group ?? 'Total', value: row.value };
  });
  const months = [...new Set(parsed.map((r) => r.month))].sort();
  const groups = [...new Set(parsed.map((r) => r.group))];
  const data = months.map((month) => ({
    name: month,
    ...Object.fromEntries(groups.map((g) => [g, parsed.find((r) => r.month === month && r.group === g)?.value ?? 0])),
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="20%" barGap={2}>
          <CartesianGrid vertical={false} stroke={LINE} strokeOpacity={0.6} />
          <XAxis dataKey="name" {...axisProps} tick={<FitTick />} height={40} interval={0} />
          <YAxis hide domain={ATLEAST_ONE} />
          {tip(BAR_CURSOR)}
          {groups.map((g, gi) => (
            <Bar key={g} dataKey={g} name={g} fill={colourForGroup(g, gi)} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {groups.map((group, gi) => (
          <span key={group} className="inline-flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: colourForGroup(group, gi) }} />
            {group}
          </span>
        ))}
        {unit ? <span className="text-xs" style={{ color: MUTED }}>· in {unit}</span> : null}
      </div>
    </div>
  );
};

// A row's own note (where a product's days of stock came from) gets a
// column of its own when any row has one.
const TableView = ({ series, unit, dimensionLabel }) => {
  const notes = series.some((row) => row.meta?.note);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{dimensionLabel}</TableHead>
          <TableHead className="text-right">{unit === '%' ? 'Percentage' : unit}</TableHead>
          {notes ? <TableHead>Worked out from</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {series.map((row) => (
          <TableRow key={row.label}>
            <TableCell>{formatLabel(row.label)}</TableCell>
            <TableCell className="text-right font-medium">
              {fmt(row.value, unit)}{row.meta?.unit ? ` ${row.meta.unit}` : ''}
            </TableCell>
            {notes ? <TableCell className="whitespace-normal text-xs" style={{ color: MUTED }}>{row.meta?.note ?? ''}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

// Built from the same series the table renders, so file and screen
// cannot disagree. Takes `series` separately from `report.series` so
// an on-screen sort (bar/hbar only, see SORT_OPTIONS below) carries
// into the file.
const downloadSheet = (report, dimensionLabel, series) => {
  const range = report.spec.dateRange;
  const period = range ? `${range.from} to ${range.to}` : 'As it stands now';
  const unit = report.meta?.unit ?? '';
  return exportExcel({
    filename: `${report.spec.metric}-${range ? `${range.from}-to-${range.to}` : 'current'}`,
    sheetName: 'Report',
    title: report.description ?? 'Report',
    // Uploaded data says so inside the file. Without it an exported
    // sheet is indistinguishable from a warehouse report the moment it
    // leaves this screen.
    subtitle: report.meta?.uploaded ? `${period}  ·  uploaded file, not warehouse data` : period,
    columns: [
      { key: 'label', label: dimensionLabel, kind: 'text' },
      { key: 'value', label: unit === '%' ? 'Percentage' : (unit || 'Value'), kind: unit === 'ZAR' ? 'money' : 'number' },
    ],
    rows: series.map((r) => ({ label: formatLabel(r.label), value: r.value })),
  });
};

// Sorting only makes sense for a categorical comparison (bar/hbar): a
// line's point order is time, and a number has nothing to sort. 'desc'
// matches what the backend already returns for every categorical
// dimension, so the first render is the server's order.
const SORT_OPTIONS = [
  { id: 'desc',  label: 'Highest first' },
  { id: 'asc',   label: 'Lowest first' },
  { id: 'alpha', label: 'A to Z' },
];

const sortSeries = (series, sort) => {
  // 'none' keeps the server's order: a month-by-month trend has to
  // read left to right in time, not tallest first.
  if (sort === 'none') return series;
  if (sort === 'desc') return [...series].sort((a, b) => b.value - a.value);
  if (sort === 'asc')  return [...series].sort((a, b) => a.value - b.value);
  return [...series].sort((a, b) => formatLabel(a.label).localeCompare(formatLabel(b.label)));
};

// compact drops the table, Excel and sort row and the hover tips for a
// small preview card (TrendCard.jsx). The summary still carries every
// value to assistive tech, so this is a visual simplification, not an
// accessibility trade-off.
//
// HOVER TIPS. Each bar, row or point answers the pointer with the
// shared tip: its full name (the axis may have cut it), its figure,
// its share of the total where a total means something, and the
// report's note (`note`), one short line per point.
export default function ReportChart({ report, dimensionLabel = 'Category', compact = false, initialSort = 'desc', note }) {
  const [asTable, setAsTable] = useState(false);
  const [sort, setSort] = useState(initialSort);
  const animate = useChartMotion();
  const { series: rawSeries, chartType, meta } = report;
  const unit = meta?.unit ?? '';

  if (!rawSeries || rawSeries.length === 0) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: MUTED }}>
        No data for this period. Try widening the date range, or check the report
        builder below to confirm the same report is empty there too.
      </p>
    );
  }

  const sortable = chartType === 'bar' || chartType === 'hbar';
  const series = sortable ? sortSeries(rawSeries, sort) : rawSeries;
  const rows = series.map((r) => ({ name: r.label, value: Number(r.value), unit: r.meta?.unit, note: r.meta?.note }));
  // The colour follows the category in the server's order, so a sort
  // never repaints a bar.
  const colourOf = entityColours(rawSeries);

  const total = rawSeries.reduce((sum, r) => sum + Number(r.value || 0), 0);
  const shares = isAdditive(unit, rawSeries) && chartType !== 'grouped_bar' && rawSeries.length > 1 && total > 0;

  // Recharts draws the tip; compact charts have none.
  const tip = (cursor) => (compact ? null : (
    <Tooltip
      cursor={cursor}
      content={<ChartTooltip unit={unit} labelFor={(l) => formatLabel(l)} total={shares ? total : null} note={note}
        extraFor={(shown) => (shown[0]?.payload?.note ? shown[0].payload.note.split('. ') : [])} />}
    />
  ));

  // One sentence summarising the chart, for screen readers. The
  // drawing inside is not announced on its own.
  const summary = `${report.description}. ` +
    series.map((r) => `${formatLabel(r.label)}: ${fmt(r.value, unit)}`).join('. ');

  const views = {
    number: <NumberView series={series} unit={unit} />,
    bar: <BarView rows={rows} unit={unit} tip={tip} colourOf={colourOf} animate={animate} />,
    hbar: <HBarView rows={rows} unit={unit} tip={tip} colourOf={colourOf} animate={animate} />,
    line: <LineView rows={rows} unit={unit} tip={tip} animate={animate} />,
    grouped_bar: <GroupedBarView series={series} unit={unit} tip={tip} animate={animate} />,
  };

  return (
    <div>
      <div className="relative" role="img" aria-label={summary}>
        {asTable
          ? <TableView series={series} unit={unit} dimensionLabel={dimensionLabel} />
          : views[chartType] ?? views.bar}
      </div>

      {compact ? null : (
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm"
                onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'View as chart' : 'View as table'}
        </Button>
        <Button type="button" variant="outline" size="sm"
                onClick={() => downloadSheet(report, dimensionLabel, series)}>
          Export to Excel
        </Button>
        {sortable ? (
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-8 w-36 text-sm" aria-label="Sort order">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      )}
    </div>
  );
}
