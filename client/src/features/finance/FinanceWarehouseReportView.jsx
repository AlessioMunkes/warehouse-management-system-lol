import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ErrorBanner from '@/components/ui/error-banner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ListCard from '@/components/ui/list-card';
import PageHeader, { PageShell } from '@/components/ui/page-header';
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
import TablePager from '@/components/ui/table-pager';
import usePaged, { TABLE_PAGE_SIZE } from '@/features/staff/hooks/usePaged';

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

const PDF_COLORS = {
  ink: [30, 41, 59],
  muted: [100, 116, 139],
  border: [226, 232, 240],
  soft: [248, 250, 252],
  donations: [37, 99, 235],
  po: [220, 38, 38],
  dispatches: [22, 163, 74],
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

const chartLabel = (groupByMonth, value) => (groupByMonth ? monthLabel(value) : formatDate(value));

const emptyChartRow = (label) => ({
  label,
  donations: 0,
  po: 0,
  dispatches: 0,
});

const daysBetweenDates = (from, to) => {
  if (!from || !to) return 0;
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return 0;
  return Math.abs((toDate.getTime() - fromDate.getTime()) / 86400000);
};

const shouldGroupChartByMonth = (dateFrom, dateTo) => !dateFrom || !dateTo || daysBetweenDates(dateFrom, dateTo) > 93;

const dateRangeLabel = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return 'All dates';
  if (dateFrom && dateTo) return `${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
  if (dateFrom) return `From ${formatDate(dateFrom)}`;
  return `Until ${formatDate(dateTo)}`;
};

const buildChartData = (rows, dateFrom, dateTo) => {
  const groups = new Map();
  const groupByMonth = shouldGroupChartByMonth(dateFrom, dateTo);

  rows.forEach((row) => {
    const typeKey = TYPE_KEYS[movementType(row)];
    if (!typeKey) return;

    const rawDate = dateOnly(movementDate(row));
    const groupKey = groupByMonth ? rawDate.slice(0, 7) : rawDate;
    const label = chartLabel(groupByMonth, rawDate);

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

const effectiveDateRangeLabel = (dateFrom, dateTo) => dateRangeLabel(dateFrom, dateTo);

const loadLogoDataUrl = async () => {
  try {
    const response = await fetch('/images/pdf_logo.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const buildHighlights = ({ purchaseOrders, donations, dispatches, poTotal, donationTotal }) => {
  const highlights = [];

  if (donations.length > 0 && donationTotal > 0) {
    highlights.push(`Donations contributed ${formatMoney(donationTotal)} in estimated value.`);
  }
  if (purchaseOrders.length > 0 && poTotal > 0 && poTotal >= donationTotal) {
    highlights.push('Purchase orders represented the largest known inbound value.');
  }
  if (dispatches.length > 0) {
    highlights.push(`${dispatches.length.toLocaleString('en-ZA')} dispatch movements were completed during the period.`);
  }

  return highlights;
};

const buildFinanceAttentionItems = (rows) =>
  rows.flatMap((row) => {
    const text = [
      row.finance_attention,
      row.financeAttention,
      row.warning,
      row.warning_message,
      row.section18a_handoff_error,
      row.section18aHandoffError,
      row.finance_email_status === 'failed' ? row.finance_email_error || 'Purchase order finance email failed.' : '',
    ].filter(Boolean).join(' ');

    return text ? [`${referenceId(row)}: ${text}`] : [];
  }).slice(0, 4);

const recentActivityRows = (rows, limit = 6) =>
  [...rows]
    .sort((a, b) => dateOnly(movementDate(b)).localeCompare(dateOnly(movementDate(a))))
    .slice(0, limit)
    .map((row) => ({
      type: {
        received: 'Purchase Order',
        donated: 'Donation',
        dispatched: 'Dispatch',
      }[movementType(row)] ?? movementType(row) ?? '-',
      reference: referenceId(row),
      date: formatDate(movementDate(row)),
      details: [sourceDestination(row), productName(row), `${quantity(row)} ${unit(row)}`].filter((value) => value && value !== '-').join(' | '),
    }));

const addWrappedText = (pdf, text, x, y, maxWidth, lineHeight = 5) => {
  const lines = pdf.splitTextToSize ? pdf.splitTextToSize(text, maxWidth) : [text];
  pdf.text(lines.length === 1 ? lines[0] : lines, x, y);
  return y + lines.length * lineHeight;
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

const exportReportPdf = async ({ dateFrom, dateTo, type, chartData, purchaseOrders, donations, dispatches, poTotal, donationTotal, filteredMovements }) => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 12;
  const right = pageWidth - left;
  const logoDataUrl = await loadLogoDataUrl();
  const reportRows = filteredMovements ?? [...purchaseOrders, ...donations, ...dispatches];
  const rangeLabel = effectiveDateRangeLabel(dateFrom, dateTo);
  const generatedAt = new Date();
  let y = 14;
  const maxValue = Math.max(1, ...chartData.flatMap((row) => [row.donations, row.po, row.dispatches]));

  const addFooter = () => {
    const pageNumber = pdf.internal.getNumberOfPages ? pdf.internal.getNumberOfPages() : 1;
    pdf.setDrawColor(...PDF_COLORS.border);
    pdf.line(left, pageHeight - 15, right, pageHeight - 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...PDF_COLORS.muted);
    pdf.text('Generated by the Ladles of Love Warehouse Management System', left, pageHeight - 9);
    pdf.text(`Page ${pageNumber}`, right, pageHeight - 9, { align: 'right' });
  };

  const sectionTitle = (title) => {
    y += 8;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...PDF_COLORS.ink);
    pdf.text(title, left, y);
    pdf.setDrawColor(...PDF_COLORS.border);
    pdf.line(left, y + 3, right, y + 3);
    y += 10;
  };

  if (logoDataUrl && pdf.addImage) {
    pdf.addImage(logoDataUrl, 'PNG', left, y - 2, 30, 16);
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(...PDF_COLORS.ink);
  pdf.text('Warehouse Finance Report', left + 38, y + 4);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...PDF_COLORS.muted);
  pdf.text(`Reporting period: ${rangeLabel} | ${TYPES[type] ?? type}`, left + 38, y + 11);
  pdf.text('Prepared for Finance', left + 38, y + 17);
  y += 26;
  y = addWrappedText(
    pdf,
    'This report summarises inbound and outbound warehouse activity for the selected reporting period.',
    left,
    y,
    pageWidth - left * 2,
    5,
  );

  sectionTitle('1. Executive Summary');
  const summaryY = y;
  const cardGap = 3;
  const cardWidth = (pageWidth - left * 2 - cardGap * 4) / 5;
  [
    ['Purchase Orders', purchaseOrders.length.toLocaleString('en-ZA'), PDF_COLORS.po],
    ['Donations', donations.length.toLocaleString('en-ZA'), PDF_COLORS.donations],
    ['Dispatches', dispatches.length.toLocaleString('en-ZA'), PDF_COLORS.dispatches],
    ['PO value', formatMoney(poTotal), PDF_COLORS.po],
    ['Donation est. value', formatMoney(donationTotal), PDF_COLORS.donations],
  ].forEach(([title, value, color], index) => {
    const x = left + index * (cardWidth + cardGap);
    pdf.setDrawColor(...PDF_COLORS.border);
    pdf.setFillColor(...PDF_COLORS.soft);
    pdf.roundedRect(x, summaryY, cardWidth, 24, 1.5, 1.5, 'FD');
    pdf.setFillColor(...color);
    pdf.rect(x, summaryY, cardWidth, 1.5, 'F');
    pdf.setTextColor(...PDF_COLORS.muted);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(title, x + 3, summaryY + 8, { maxWidth: cardWidth - 6 });
    pdf.setTextColor(...PDF_COLORS.ink);
    pdf.setFontSize(12);
    pdf.text(String(value), x + 3, summaryY + 18, { maxWidth: cardWidth - 6 });
  });
  y += 28;

  sectionTitle('2. Movement Overview');
  const chartTop = y + 4;
  const chartHeight = 54;
  const axisWidth = 14;
  const chartWidth = pageWidth - left * 2 - axisWidth;
  const chartLeft = left + axisWidth;

  const legend = [
    ['Donations', PDF_COLORS.donations],
    ['Purchase Orders', PDF_COLORS.po],
    ['Dispatches', PDF_COLORS.dispatches],
  ];
  legend.forEach(([label, color], index) => {
    const x = left + index * 38;
    pdf.setFillColor(...color);
    pdf.rect(x, chartTop - 5, 4, 4, 'F');
    pdf.setTextColor(...PDF_COLORS.muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(label, x + 6, chartTop - 1.5);
  });

  pdf.setTextColor(...PDF_COLORS.muted);
  pdf.setFontSize(8);
  pdf.text('Movements', left, chartTop + 24, { angle: 90 });
  pdf.text('Reporting date / period', chartLeft + chartWidth / 2, chartTop + chartHeight + 15, { align: 'center' });

  pdf.setDrawColor(148, 163, 184);
  pdf.line(chartLeft, chartTop + chartHeight, chartLeft + chartWidth, chartTop + chartHeight);
  pdf.line(chartLeft, chartTop, chartLeft, chartTop + chartHeight);

  const gridSteps = 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(80, 80, 80);
  for (let step = 0; step <= gridSteps; step += 1) {
    const value = Math.round((maxValue / gridSteps) * step);
    const y = chartTop + chartHeight - (step / gridSteps) * chartHeight;
    pdf.setDrawColor(step === 0 ? 148 : 226, step === 0 ? 163 : 232, step === 0 ? 184 : 240);
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
        ['donations', PDF_COLORS.donations],
        ['po', PDF_COLORS.po],
        ['dispatches', PDF_COLORS.dispatches],
      ].forEach(([key, color], barIndex) => {
        const height = (row[key] / maxValue) * (chartHeight - 3);
        const x = groupX + barIndex * (barWidth + 1);
        const y = chartTop + chartHeight - height;
        pdf.setFillColor(...color);
        pdf.rect(x, y, barWidth, height, 'F');
        if (row[key] > 0 && chartData.length <= 8) {
          pdf.setFontSize(6.8);
          pdf.setTextColor(...PDF_COLORS.ink);
          pdf.text(String(row[key]), x + barWidth / 2, y - 1, { align: 'center' });
        }
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
  y = chartTop + chartHeight + 20;

  sectionTitle('3. Key Highlights');
  const highlights = buildHighlights({ purchaseOrders, donations, dispatches, poTotal, donationTotal });
  if (highlights.length === 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...PDF_COLORS.muted);
    pdf.text('No finance highlights are available for the selected filters.', left, y);
    y += 6;
  } else {
    highlights.forEach((highlight) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...PDF_COLORS.ink);
      pdf.text('-', left, y);
      y = addWrappedText(pdf, highlight, left + 5, y, pageWidth - left * 2 - 5, 5);
    });
  }

  const attentionItems = buildFinanceAttentionItems(reportRows);
  if (attentionItems.length > 0) {
    sectionTitle('4. Finance Attention');
    attentionItems.forEach((item) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...PDF_COLORS.ink);
      pdf.text('-', left, y);
      y = addWrappedText(pdf, item, left + 5, y, pageWidth - left * 2 - 5, 5);
    });
  }

  sectionTitle(attentionItems.length > 0 ? '5. Recent Activity' : '4. Recent Activity');
  const activityRows = recentActivityRows(reportRows, 4);
  const columns = [
    ['Type', 30],
    ['Reference', 24],
    ['Date', 30],
    ['Details', pageWidth - left * 2 - 84],
  ];
  let x = left;
  pdf.setFillColor(...PDF_COLORS.soft);
  pdf.setDrawColor(...PDF_COLORS.border);
  pdf.rect(left, y - 5, pageWidth - left * 2, 8, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...PDF_COLORS.ink);
  columns.forEach(([label, width]) => {
    pdf.text(label, x + 2, y);
    x += width;
  });
  y += 7;
  pdf.setFont('helvetica', 'normal');
  activityRows.forEach((row) => {
    x = left;
    [row.type, row.reference, row.date, row.details || '-'].forEach((value, index) => {
      pdf.text(String(value), x + 2, y, { maxWidth: columns[index][1] - 4 });
      x += columns[index][1];
    });
    pdf.setDrawColor(...PDF_COLORS.border);
    pdf.line(left, y + 3, right, y + 3);
    y += 8;
  });
  if (activityRows.length === 0) {
    pdf.setTextColor(...PDF_COLORS.muted);
    pdf.text('No recent activity matches these filters.', left + 2, y);
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...PDF_COLORS.muted);
  pdf.text(`Generated: ${generatedAt.toLocaleString('en-ZA')}`, left, pageHeight - 20);
  addFooter();
  pdf.save(reportFileName());
};

export default function FinanceWarehouseReportView({ loadReport, showReset = true }) {
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

    loadReport({ limit: 200 })
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
  }, [loadReport]);

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
  const chartData = useMemo(() => buildChartData(filteredMovements, dateFrom, dateTo), [dateFrom, dateTo, filteredMovements]);
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
  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const reportingPeriodLabel = dateRangeLabel(dateFrom, dateTo);

  return (
    <PageShell>
      <PageHeader
        title="Warehouse Movement Report"
        description="Review stock received into and issued from the warehouse for the selected reporting period."
        actions={loading ? <Badge variant="secondary">Loading</Badge> : null}
      />
      <p className="mt-2 text-sm font-medium text-muted-foreground">For the Finance team</p>

      <ErrorBanner message={error} className="mt-5" />

      <Card className="mt-6">
        <CardContent>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Filter report</h2>
            <p className="text-sm text-muted-foreground">Reporting period: {reportingPeriodLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showReset && (
              <Button type="button" variant="outline" onClick={() => {
                setType('all');
                setDateFrom('');
                setDateTo('');
                setListType('');
                setListSearch('');
                setListPickerOpen(false);
              }}>
                Clear filters
              </Button>
            )}
            <Button type="button" variant="outline" disabled={dateRangeInvalid} onClick={() => exportReportPdf({
              dateFrom,
              dateTo,
              type,
              chartData,
              purchaseOrders,
              donations,
              dispatches,
              poTotal,
              donationTotal,
              filteredMovements,
            })}>
              Export PDF
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="finance-date-from">From</Label>
            <Input id="finance-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance-date-to">To</Label>
            <Input id="finance-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="space-y-2">
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
        </div>
        {dateRangeInvalid && (
          <div role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            From date must be on or before To date.
          </div>
        )}
        </CardContent>
      </Card>

      <div>
        <section className="mt-6 space-y-4">
          <div>
            <h2 className="text-xl font-medium tracking-tight">Report Summary</h2>
            <p className="text-sm text-muted-foreground">Reporting period: {reportingPeriodLabel}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
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
          </div>
        </section>

        <section className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Movement Trends</CardTitle>
              <p className="text-sm text-muted-foreground">Warehouse activity for the selected reporting period.</p>
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
    </PageShell>
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
            <div className="text-3xl font-medium tracking-tight tabular-nums">{count.toLocaleString('en-ZA')}</div>
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
  // Movements, fifteen to a page.
  const rowPage = usePaged(rows, TABLE_PAGE_SIZE, `${type}|${search}|${rows.length}`);
  return (
    <ListCard
      className="mt-4"
      header={(
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{LIST_TYPES[type]}</CardTitle>
          <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onExportCsv}>
            Export CSV
          </Button>
          <Button type="button" variant="outline" onClick={onExportExcel}>
            Export Excel
          </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4 p-4 sm:p-5">
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
            ) : rowPage.slice.map((row) => (
              <ListRow key={`${type}-${referenceId(row)}-${productName(row)}-${movementDate(row)}`} row={row} type={type} />
            ))}
          </TableBody>
        </Table>
        <TablePager {...rowPage} noun="movements" />
      </div>
    </ListCard>
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
        <TableHead className="text-center">qty</TableHead>
        <TableHead>unit</TableHead>
        {type !== 'dispatched' && (
          <TableHead className="text-center">{type === 'received' ? 'value' : 'estimated value'}</TableHead>
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
      <TableCell className="text-center">{quantity(row)}</TableCell>
      <TableCell>{unit(row)}</TableCell>
      {type !== 'dispatched' && (
        <TableCell className="text-center">{formatMoney(monetaryValue(row))}</TableCell>
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

