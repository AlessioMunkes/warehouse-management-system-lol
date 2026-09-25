import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PERIODS = {
  this_month: 'This Month',
  last_30_days: 'Last 30 Days',
  this_year: 'This Year',
  all: 'All Time',
};

const TYPES = {
  all: 'All Types',
  received: 'Purchase Orders',
  donated: 'Donations',
  dispatched: 'Dispatches',
};

const LIST_TYPES = {
  donated: 'Donations',
  received: 'Purchase Orders',
  dispatched: 'Dispatches',
};

const TYPE_KEYS = {
  received: 'po',
  donated: 'donations',
  dispatched: 'dispatches',
};

// Theme tokens, not hex, so the chart follows light and dark mode
// (NoHardcodedColours.test.js). Same blue / red / green meaning.
const CHART_COLORS = {
  donations: 'var(--info-ink)',
  po: 'var(--brand)',
  dispatches: 'var(--good-ink)',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const startOfThisMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const startOfThisYear = () => {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
};

const daysAgo = (days) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const rangeForFinancePeriod = (period) => {
  if (period === 'all') return {};
  if (period === 'this_year') return { from: startOfThisYear(), to: todayISO() };
  if (period === 'last_30_days') return { from: daysAgo(30), to: todayISO() };
  return { from: startOfThisMonth(), to: todayISO() };
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 2,
  }).format(amount);
};

const byType = (rows, type) =>
  rows.filter((row) => row.movement_type === type || row.movementType === type);

const movementDate = (row) => row.movement_date ?? row.date ?? row.created_at;
const movementType = (row) => row.movement_type ?? row.movementType;
const referenceId = (row) => row.reference_id ?? row.referenceId ?? row.id ?? '-';
const sourceDestination = (row) => row.source_destination ?? row.sourceDestination ?? '-';
const productName = (row) => row.product ?? row.product_name ?? row.productName ?? '-';
const monetaryValue = (row) =>
  row.monetary_value
  ?? row.monetaryValue
  ?? row.estimated_value_zar
  ?? row.estimatedValueZar;
const quantity = (row) => {
  const value = Number(row.quantity);
  return Number.isFinite(value) ? Math.abs(value).toLocaleString('en-ZA') : row.quantity ?? '-';
};
const unit = (row) => row.unit ?? '-';

const moneyTotal = (rows) =>
  rows.reduce((total, row) => {
    const amount = Number(monetaryValue(row));
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);

const dateOnly = (value) => String(value ?? '').slice(0, 10);

const monthLabel = (value) => {
  const date = new Date(`${dateOnly(value).slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateOnly(value) || 'Unknown';
  return new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric' }).format(date);
};

const chartLabel = (period, value) => (period === 'this_year' || period === 'all' ? monthLabel(value) : formatDate(value));

const emptyChartRow = (label) => ({
  label,
  donations: 0,
  po: 0,
  dispatches: 0,
});

const buildChartData = (rows, period) => {
  const groups = new Map();

  rows.forEach((row) => {
    const typeKey = TYPE_KEYS[movementType(row)];
    if (!typeKey) return;

    const rawDate = dateOnly(movementDate(row));
    const groupKey = period === 'this_year' || period === 'all' ? rawDate.slice(0, 7) : rawDate;
    const label = chartLabel(period, rawDate);

    if (!groups.has(groupKey)) groups.set(groupKey, emptyChartRow(label));
    groups.get(groupKey)[typeKey] += 1;
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);
};

const fileStamp = () => new Date().toISOString().slice(0, 10);

const listFileName = (type, extension) =>
  `finance-${LIST_TYPES[type].toLowerCase().replace(/\s+/g, '-')}-${fileStamp()}.${extension}`;

const reportFileName = () => `finance-report-${fileStamp()}.pdf`;

const hexToRgb = (hex) => {
  const value = String(hex).replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

const listColumns = (type) => {
  const sourceLabel = type === 'dispatched' ? 'ECD/destination' : type === 'received' ? 'supplier' : 'donor';
  const columns = [
    { key: 'date', label: 'date' },
    { key: 'ref', label: 'ref' },
    { key: 'source', label: sourceLabel },
    { key: 'product', label: 'product' },
    { key: 'qty', label: 'qty' },
    { key: 'unit', label: 'unit' },
  ];

  if (type !== 'dispatched') {
    columns.push({ key: 'value', label: type === 'received' ? 'value' : 'estimated value' });
  }

  return columns;
};

const listRowData = (row, type) => ({
  date: formatDate(movementDate(row)),
  ref: referenceId(row),
  source: sourceDestination(row),
  product: productName(row),
  qty: quantity(row),
  unit: unit(row),
  value: type !== 'dispatched' ? formatMoney(monetaryValue(row)) : undefined,
});

const searchListRows = (rows, type, search) => {
  const query = search.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => listSearchText(row, type).includes(query));
};

const exportCsv = (rows, type) => {
  const columns = listColumns(type);
  const csv = [
    columns.map((column) => column.label),
    ...rows.map((row) => {
      const data = listRowData(row, type);
      return columns.map((column) => data[column.key] ?? '');
    }),
  ].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = listFileName(type, 'csv');
  anchor.click();
  URL.revokeObjectURL(url);
};

const exportExcel = async (rows, type) => {
  const XLSX = await import('xlsx');
  const columns = listColumns(type);
  const data = rows.map((row) => {
    const values = listRowData(row, type);
    return Object.fromEntries(columns.map((column) => [column.label, values[column.key] ?? '']));
  });
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, LIST_TYPES[type]);
  XLSX.writeFile(workbook, listFileName(type, 'xlsx'));
};

const exportReportPdf = async ({ period, dateFrom, dateTo, type, chartData, purchaseOrders, donations, dispatches, poTotal, donationTotal }) => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const left = 12;
  const top = 14;
  const chartTop = 76;
  const chartHeight = 58;
  const axisWidth = 12;
  const chartWidth = pageWidth - left * 2 - axisWidth;
  const chartLeft = left + axisWidth;
  const maxValue = Math.max(1, ...chartData.flatMap((row) => [row.donations, row.po, row.dispatches]));

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('Warehouse Movement Report', left, top);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(70, 70, 70);
  pdf.text(`${PERIODS[period] ?? period} | ${dateFrom || 'Any'} to ${dateTo || 'Any'} | ${TYPES[type] ?? type}`, left, top + 8);

  const summaryY = top + 16;
  const cardWidth = (pageWidth - left * 2 - 8) / 3;
  [
    ['Purchase Orders', purchaseOrders.length, formatMoney(poTotal), CHART_COLORS.po],
    ['Donations', donations.length, formatMoney(donationTotal), CHART_COLORS.donations],
    ['Dispatch', dispatches.length, `${dispatches.length.toLocaleString('en-ZA')} moves`, CHART_COLORS.dispatches],
  ].forEach(([title, count, value, color], index) => {
    const x = left + index * (cardWidth + 4);
    pdf.setDrawColor(215, 215, 215);
    pdf.setFillColor(250, 250, 250);
    pdf.roundedRect(x, summaryY, cardWidth, 23, 2, 2, 'FD');
    pdf.setFillColor(...hexToRgb(color));
    pdf.rect(x, summaryY, 2.4, 23, 'F');
    pdf.setTextColor(40, 40, 40);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(title, x + 5, summaryY + 7);
    pdf.setFontSize(15);
    pdf.text(String(count), x + 5, summaryY + 17);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(String(value), x + cardWidth - 4, summaryY + 17, { align: 'right', maxWidth: cardWidth - 24 });
  });

  pdf.setTextColor(25, 25, 25);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Movement Trends', left, chartTop - 12);

  const legend = [
    ['Donations', CHART_COLORS.donations],
    ['Purchase Orders', CHART_COLORS.po],
    ['Dispatch', CHART_COLORS.dispatches],
  ];
  legend.forEach(([label, color], index) => {
    const x = left + index * 32;
    pdf.setFillColor(...hexToRgb(color));
    pdf.rect(x, chartTop - 7, 4, 4, 'F');
    pdf.setTextColor(45, 45, 45);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(label, x + 6, chartTop - 3.5);
  });

  pdf.setDrawColor(160, 160, 160);
  pdf.line(chartLeft, chartTop + chartHeight, chartLeft + chartWidth, chartTop + chartHeight);
  pdf.line(chartLeft, chartTop, chartLeft, chartTop + chartHeight);

  const gridSteps = 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(80, 80, 80);
  for (let step = 0; step <= gridSteps; step += 1) {
    const value = Math.round((maxValue / gridSteps) * step);
    const y = chartTop + chartHeight - (step / gridSteps) * chartHeight;
    pdf.setDrawColor(step === 0 ? 160 : 225, step === 0 ? 160 : 225, step === 0 ? 160 : 225);
    pdf.line(chartLeft, y, chartLeft + chartWidth, y);
    pdf.text(String(value), chartLeft - 3, y + 2, { align: 'right' });
  }

  if (chartData.length === 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(80, 80, 80);
    pdf.text('No movements match these filters.', chartLeft + 4, chartTop + 24);
  } else {
    const groupWidth = chartWidth / chartData.length;
    const barWidth = Math.min(8, groupWidth / 4.8);
    chartData.forEach((row, index) => {
      const groupX = chartLeft + index * groupWidth + groupWidth / 2 - barWidth * 1.7;
      [
        ['donations', CHART_COLORS.donations],
        ['po', CHART_COLORS.po],
        ['dispatches', CHART_COLORS.dispatches],
      ].forEach(([key, color], barIndex) => {
        const height = (row[key] / maxValue) * (chartHeight - 3);
        const x = groupX + barIndex * (barWidth + 1);
        const y = chartTop + chartHeight - height;
        pdf.setFillColor(...hexToRgb(color));
        pdf.rect(x, y, barWidth, height, 'F');
      });
      const label = String(row.label);
      const shouldShowLabel = chartData.length <= 8 || index % Math.ceil(chartData.length / 8) === 0;
      if (!shouldShowLabel) return;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.2);
      pdf.setTextColor(70, 70, 70);
      pdf.text(label, chartLeft + index * groupWidth + groupWidth / 2, chartTop + chartHeight + 5, {
        align: 'center',
        maxWidth: Math.max(16, groupWidth - 2),
      });
    });
  }

  pdf.save(reportFileName());
};

export default function FinanceWarehouseReportView({ loadReport, showReset = true }) {
  const [period, setPeriod] = useState('this_month');
  const [type, setType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [listType, setListType] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [report, setReport] = useState({ movements: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadReport({ ...rangeForFinancePeriod(period), limit: 200 })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [loadReport, period]);

  const movements = report.movements ?? [];
  const donationValueMovements = report.donationValues ?? [];
  const filteredMovements = useMemo(() => movements.filter((row) => {
    const rowDate = dateOnly(movementDate(row));
    const matchesType = type === 'all' || movementType(row) === type;
    const afterFrom = !dateFrom || rowDate >= dateFrom;
    const beforeTo = !dateTo || rowDate <= dateTo;
    return matchesType && afterFrom && beforeTo;
  }), [dateFrom, dateTo, movements, type]);
  const filteredDonationValues = useMemo(() => donationValueMovements.filter((row) => {
    const rowDate = dateOnly(movementDate(row));
    const matchesType = type === 'all' || type === 'donated';
    const afterFrom = !dateFrom || rowDate >= dateFrom;
    const beforeTo = !dateTo || rowDate <= dateTo;
    return matchesType && afterFrom && beforeTo;
  }), [dateFrom, dateTo, donationValueMovements, type]);

  const purchaseOrders = useMemo(() => byType(filteredMovements, 'received'), [filteredMovements]);
  const donations = useMemo(() => byType(filteredMovements, 'donated'), [filteredMovements]);
  const dispatches = useMemo(() => byType(filteredMovements, 'dispatched'), [filteredMovements]);
  const chartData = useMemo(() => buildChartData(filteredMovements, period), [filteredMovements, period]);
  const selectedListRows = useMemo(
    () => {
      if (!listType) return [];
      const rows = listType === 'donated' ? filteredDonationValues : byType(filteredMovements, listType);
      return searchListRows(rows, listType, listSearch);
    },
    [filteredDonationValues, filteredMovements, listSearch, listType],
  );

  const poTotal = useMemo(() => moneyTotal(purchaseOrders), [purchaseOrders]);
  const donationTotal = useMemo(() => {
    const serverTotal = Number(report.totals?.donations);
    const canUseServerTotal = (type === 'all' || type === 'donated') && !dateFrom && !dateTo && Number.isFinite(serverTotal);
    return canUseServerTotal ? serverTotal : moneyTotal(filteredDonationValues);
  }, [dateFrom, dateTo, filteredDonationValues, report.totals?.donations, type]);
  const hasChartData = chartData.some((row) => row.donations || row.po || row.dispatches);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-ink sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Warehouse Movement Report</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger aria-label="Period" className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERIODS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && <Badge variant="secondary">Loading</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => exportReportPdf({
            period,
            dateFrom,
            dateTo,
            type,
            chartData,
            purchaseOrders,
            donations,
            dispatches,
            poTotal,
            donationTotal,
          })}>
            Export PDF
          </Button>
          {showReset && (
            <Button type="button" variant="outline" onClick={() => {
              setPeriod('this_month');
              setType('all');
              setDateFrom('');
              setDateTo('');
              setListType('');
              setListSearch('');
              setListPickerOpen(false);
            }}>
              Reset filters
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div role="alert" className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="finance-date-from">From</Label>
          <Input id="finance-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="finance-date-to">To</Label>
          <Input id="finance-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label="Movement type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPES).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div>
        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="Purchase Orders"
            count={purchaseOrders.length}
            totalLabel="Known purchase order value"
            total={formatMoney(poTotal)}
          />
          <SummaryCard
            title="Donations"
            count={donations.length}
            totalLabel="Known donation value"
            total={formatMoney(donationTotal)}
          />
          <SummaryCard
            title="Dispatches"
            count={dispatches.length}
            totalLabel="Recorded movements"
            total={dispatches.length.toLocaleString('en-ZA')}
          />
        </section>

        <section className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Movement Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="h-80"
                role="img"
              aria-label={`Movement chart. Donations ${donations.length}. Purchase Orders ${purchaseOrders.length}. Dispatch ${dispatches.length}.`}
              >
                {hasChartData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickMargin={8} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="donations" name="Donations" fill={CHART_COLORS.donations} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="po" name="Purchase Orders" fill={CHART_COLORS.po} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="dispatches" name="Dispatch" fill={CHART_COLORS.dispatches} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No movements match these filters.
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm" aria-label="Chart legend">
                <LegendItem color={CHART_COLORS.donations} label="Donations" />
                <LegendItem color={CHART_COLORS.po} label="Purchase Orders" />
                <LegendItem color={CHART_COLORS.dispatches} label="Dispatch" />
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setListPickerOpen((value) => !value)}>
            View List
          </Button>
          {listType && (
            <Badge variant="secondary">{LIST_TYPES[listType]}</Badge>
          )}
        </div>

        {listPickerOpen && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Choose List</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(LIST_TYPES).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={listType === value ? 'default' : 'outline'}
                  onClick={() => {
                    setListType(value);
                    setListSearch('');
                    setListPickerOpen(false);
                  }}
                >
                  {label}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {listType && (
          <FinanceList
            rows={selectedListRows}
            type={listType}
            search={listSearch}
            onSearchChange={setListSearch}
            onExportCsv={() => exportCsv(selectedListRows, listType)}
            onExportExcel={() => exportExcel(selectedListRows, listType)}
          />
        )}
      </section>
    </main>
  );
}

function SummaryCard({ title, count, totalLabel, total }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-bold tracking-tight">{count.toLocaleString('en-ZA')}</div>
            <div className="mt-1 text-sm text-muted-foreground">Movements</div>
          </div>
          <Badge variant="secondary">{total}</Badge>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">{totalLabel}</div>
      </CardContent>
    </Card>
  );
}

function LegendItem({ color, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-3 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function FinanceList({ rows, type, search, onSearchChange, onExportCsv, onExportExcel }) {
  return (
    <Card className="mt-4">
      <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>{LIST_TYPES[type]}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onExportCsv}>
            Export CSV
          </Button>
          <Button type="button" variant="outline" onClick={onExportExcel}>
            Export Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-2">
          <Label htmlFor="finance-list-search">Search list</Label>
          <Input
            id="finance-list-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={`Search ${LIST_TYPES[type].toLowerCase()}`}
          />
        </div>
        <Table>
          <ListHeader type={type} />
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={type === 'dispatched' ? 6 : 7} className="text-muted-foreground">
                  No matching movements.
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <ListRow key={`${type}-${referenceId(row)}-${productName(row)}-${movementDate(row)}`} row={row} type={type} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ListHeader({ type }) {
  const sourceLabel = type === 'dispatched' ? 'ECD/destination' : type === 'received' ? 'supplier' : 'donor';
  return (
    <TableHeader>
      <TableRow>
        <TableHead>date</TableHead>
        <TableHead>ref</TableHead>
        <TableHead>{sourceLabel}</TableHead>
        <TableHead>product</TableHead>
        <TableHead>qty</TableHead>
        <TableHead>unit</TableHead>
        {type !== 'dispatched' && (
          <TableHead>{type === 'received' ? 'value' : 'estimated value'}</TableHead>
        )}
      </TableRow>
    </TableHeader>
  );
}

function ListRow({ row, type }) {
  return (
    <TableRow>
      <TableCell>{formatDate(movementDate(row))}</TableCell>
      <TableCell>{referenceId(row)}</TableCell>
      <TableCell>{sourceDestination(row)}</TableCell>
      <TableCell>{productName(row)}</TableCell>
      <TableCell>{quantity(row)}</TableCell>
      <TableCell>{unit(row)}</TableCell>
      {type !== 'dispatched' && (
        <TableCell>{formatMoney(monetaryValue(row))}</TableCell>
      )}
    </TableRow>
  );
}

function listSearchText(row, type) {
  return [
    formatDate(movementDate(row)),
    referenceId(row),
    sourceDestination(row),
    productName(row),
    quantity(row),
    unit(row),
    type !== 'dispatched' ? formatMoney(monetaryValue(row)) : '',
  ].join(' ').toLowerCase();
}
