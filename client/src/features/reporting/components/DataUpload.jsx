// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/DataUpload.jsx
//
// Drop a CSV or Excel file, or paste a Google Sheets link, and chart
// it. Everything happens in the browser — no upload, no storage.
//
// The chart itself is the existing ReportChart, handed a payload of
// the same shape the server produces. That is deliberate: an
// uploaded chart gets the same four shapes, the same table toggle,
// the same CSV export and the same screen-reader treatment, with no
// second rendering path to keep in step.
//
// WHAT IT DOES NOT SHARE is the provenance. Everything below the
// dashed border came from a file, not the warehouse, and it says so
// in the heading, under the chart, and inside the exported CSV.
// ─────────────────────────────────────────────────────────────
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ReportChart from './ReportChart';

const CHARCOAL = '#2b3336', MUTED = '#676767', BORDER = '#e9e3dd', RED = '#ef3a40';

const AGGREGATIONS = [
  { value: 'sum',     label: 'Total' },
  { value: 'average', label: 'Average' },
  { value: 'count',   label: 'Count of rows' },
];

const CHARTS = [
  { value: 'bar',    label: 'Bars' },
  { value: 'hbar',   label: 'Ranked bars' },
  { value: 'line',   label: 'Line' },
  { value: 'number', label: 'Single figure' },
];

export default function DataUpload() {
  const [table, setTable]   = useState(null);
  const [config, setConfig] = useState(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const load = async (fn) => {
    setBusy(true); setError(null);
    try {
      const { detectColumns } = await import('../parseUpload');
      const parsed = await fn();
      const detected = detectColumns(parsed);
      setTable(parsed);
      setConfig({ ...detected, aggregation: 'sum', chartType: 'bar' });
    } catch (err) {
      setError(err.message);
      setTable(null); setConfig(null);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file) => {
    if (!file) return;
    const { parseFile } = await import('../parseUpload');
    load(() => parseFile(file));
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    onFile(e.dataTransfer.files?.[0]);
  };

  const onSheet = async () => {
    if (!sheetUrl.trim()) return;
    const { parseSheetUrl } = await import('../parseUpload');
    load(() => parseSheetUrl(sheetUrl.trim()));
  };

  const reset = () => { setTable(null); setConfig(null); setError(null); setSheetUrl(''); };

  // Built lazily so changing a dropdown re-derives the chart without
  // re-reading the file.
  const [built, setBuilt] = useState(null);
  const rebuild = async (nextConfig) => {
    const { buildSeries } = await import('../parseUpload');
    setBuilt(buildSeries(table, nextConfig));
  };

  const update = (patch) => {
    const next = { ...config, ...patch };
    setConfig(next);
    if (table) rebuild(next);
  };

  // First build once a table lands.
  if (table && config && !built) rebuild(config);

  // Same payload shape the server returns, so ReportChart needs no
  // knowledge of where the data came from. spec.metric carries the
  // filename so the exported CSV is named after its source.
  const safeName = (table?.sourceName ?? 'upload')
    .replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 40);

  const report = built && {
    spec: { metric: `uploaded-${safeName}`, dimension: 'none', filters: {}, dateRange: null },
    description: `From uploaded file: ${table.sourceName} — ${config.aggregation === 'count'
      ? 'row count' : `${config.aggregation} of ${config.valueColumn}`} by ${config.labelColumn}`,
    chartType: config.chartType,
    series: built.series,
    total: built.series.reduce((s, r) => s + r.value, 0),
    meta: { unit: config.aggregation === 'count' ? 'rows' : config.valueColumn, uploaded: true },
  };

  const field = 'flex flex-col gap-1.5 min-w-0';

  return (
    <section
      className="rounded-[4px] border-2 border-dashed bg-white p-4 sm:p-5"
      style={{ borderColor: BORDER }}
    >
      <header className="mb-3">
        <h2 className="text-sm font-bold tracking-tight">Chart a spreadsheet</h2>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          Drop a CSV or Excel file to chart it. The file is read in your browser and is
          never uploaded or stored. These charts are not warehouse figures.
        </p>
      </header>

      {!table && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Drop a spreadsheet here, or press Enter to choose a file"
            className="cursor-pointer rounded-[4px] border-2 border-dashed px-4 py-8 text-center text-sm transition-colors"
            style={{
              borderColor: dragging ? CHARCOAL : BORDER,
              color: MUTED,
              background: dragging ? '#faf9f7' : 'transparent',
            }}
          >
            {busy ? 'Reading…' : 'Drop a CSV or Excel file here, or click to choose one'}
          </div>
          <input
            ref={fileInput} type="file" className="hidden"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
            onChange={(e) => onFile(e.target.files?.[0])}
          />

          <div className="mt-3 flex gap-2">
            <Input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSheet()}
              placeholder="…or paste a Google Sheets link"
              disabled={busy}
            />
            <Button type="button" variant="outline" onClick={onSheet}
                    disabled={busy || !sheetUrl.trim()} className="shrink-0">
              Load
            </Button>
          </div>
          {/* Stated up front rather than after a failure: a link that
              works here is a link that works for anyone who has it. */}
          <p className="mt-2 text-xs" style={{ color: MUTED }}>
            A Google Sheet has to be shared as “anyone with the link” to be read this way,
            which makes it readable by anyone who has it. Downloading it and dropping the
            file keeps it private.
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm">
          <span aria-hidden="true" className="mr-2 font-bold" style={{ color: RED }}>!</span>
          {error}
        </p>
      )}

      {table && config && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={field}>
              <Label htmlFor="u-label">Group by</Label>
              <Select value={config.labelColumn} onValueChange={(v) => update({ labelColumn: v })}>
                <SelectTrigger id="u-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {table.columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className={field}>
              <Label htmlFor="u-agg">Show</Label>
              <Select value={config.aggregation} onValueChange={(v) => update({ aggregation: v })}>
                <SelectTrigger id="u-agg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGGREGATIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {config.aggregation !== 'count' && (
              <div className={field}>
                <Label htmlFor="u-value">Of column</Label>
                <Select value={config.valueColumn} onValueChange={(v) => update({ valueColumn: v })}>
                  <SelectTrigger id="u-value"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {table.columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={field}>
              <Label htmlFor="u-chart">Chart</Label>
              <Select value={config.chartType} onValueChange={(v) => update({ chartType: v })}>
                <SelectTrigger id="u-chart"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHARTS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {report && (
            <div className="mt-4">
              <p className="text-sm font-medium" style={{ color: CHARCOAL }}>
                {report.description}
              </p>
              <div className="mt-3">
                <ReportChart report={report} dimensionLabel={config.labelColumn} />
              </div>
            </div>
          )}

          <footer className="mt-4 space-y-1 border-t pt-3 text-xs"
                  style={{ borderColor: BORDER, color: MUTED }}>
            {/* The line that stops this being mistaken for a system
                report six months from now. */}
            <p><strong>Source: {table.sourceName}</strong> — uploaded file, not warehouse data.</p>
            <p>{table.rows.length.toLocaleString('en-ZA')} rows read.</p>
            {built?.trimmed && (
              <p>Showing the top {built.series.length} groups only — the rest were left out.</p>
            )}
            {table.truncated && (
              <p>Only the first rows of a very large file were read.</p>
            )}
            {config.aggregation !== 'count'
              && built
              && built.series.length > 0
              && built.usedRows < table.rows.length && (
              <p>
                {table.rows.length - built.usedRows} row
                {table.rows.length - built.usedRows === 1 ? '' : 's'} skipped — no number in
                “{config.valueColumn}”.
              </p>
            )}
          </footer>

          <div className="mt-3">
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              Use a different file
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
