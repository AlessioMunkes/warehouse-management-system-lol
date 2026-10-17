// ─────────────────────────────────────────────────────────────
// src/features/finance/financeReportData.js
//
// The finance report's data, shaped for the screen and its exports:
// movement types, money and dates as shown, the chart's buckets, the
// list's columns and search, and the highlights. No React.
// ─────────────────────────────────────────────────────────────
import { SERIES } from '@/features/reporting/chartFormat';

export const TYPES = {
  all: 'All Types',
  received: 'Purchase Orders',
  donated: 'Donations',
  dispatched: 'Dispatches',
};

export const LIST_TYPES = {
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
// The first three of the app's chart colours (--viz-1 to 3, styles/index.css),
// as every other chart uses them.
export const CHART_COLORS = {
  donations: SERIES[0],
  po: SERIES[1],
  dispatches: SERIES[2],
};
export const axisProps = { tick: { fill: 'var(--ink-soft)', fontSize: 11 }, axisLine: { stroke: 'var(--line)' }, tickLine: false };

export const PDF_COLORS = {
  ink: [30, 41, 59],
  muted: [100, 116, 139],
  border: [226, 232, 240],
  soft: [248, 250, 252],
  // --viz-1 to 3 in the light theme: paper has one theme.
  donations: [42, 120, 214],
  po: [235, 104, 52],
  dispatches: [27, 175, 122],
};

export const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
};

export const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 2,
  }).format(amount);
};

export const byType = (rows, type) =>
  rows.filter((row) => row.movement_type === type || row.movementType === type);

export const movementDate = (row) => row.movement_date ?? row.date ?? row.created_at;
export const movementType = (row) => row.movement_type ?? row.movementType;
export const referenceId = (row) => row.reference_id ?? row.referenceId ?? row.id ?? '-';
export const sourceDestination = (row) => row.source_destination ?? row.sourceDestination ?? '-';
export const productName = (row) => row.product ?? row.product_name ?? row.productName ?? '-';
export const monetaryValue = (row) =>
  row.monetary_value
  ?? row.monetaryValue
  ?? row.estimated_value_zar
  ?? row.estimatedValueZar;
export const quantity = (row) => {
  const value = Number(row.quantity);
  return Number.isFinite(value) ? Math.abs(value).toLocaleString('en-ZA') : row.quantity ?? '-';
};
export const unit = (row) => row.unit ?? '-';

export const moneyTotal = (rows) =>
  rows.reduce((total, row) => {
    const amount = Number(monetaryValue(row));
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);

export const dateOnly = (value) => String(value ?? '').slice(0, 10);

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

export const dateRangeLabel = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return 'All dates';
  if (dateFrom && dateTo) return `${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
  if (dateFrom) return `From ${formatDate(dateFrom)}`;
  return `Until ${formatDate(dateTo)}`;
};

export const buildChartData = (rows, dateFrom, dateTo) => {
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

export const listFileName = (type, extension) =>
  `finance-${LIST_TYPES[type].toLowerCase().replace(/\s+/g, '-')}-${fileStamp()}.${extension}`;

export const reportFileName = () => `finance-report-${fileStamp()}.pdf`;

export const listColumns = (type) => {
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

export const listRowData = (row, type) => ({
  date: formatDate(movementDate(row)),
  ref: referenceId(row),
  source: sourceDestination(row),
  product: productName(row),
  qty: quantity(row),
  unit: unit(row),
  value: type !== 'dispatched' ? formatMoney(monetaryValue(row)) : undefined,
});

export const searchListRows = (rows, type, search) => {
  const query = search.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => listSearchText(row, type).includes(query));
};

export const effectiveDateRangeLabel = (dateFrom, dateTo) => dateRangeLabel(dateFrom, dateTo);

export const buildHighlights = ({ purchaseOrders, donations, dispatches, poTotal, donationTotal }) => {
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

export const buildFinanceAttentionItems = (rows) =>
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

export const recentActivityRows = (rows, limit = 6) =>
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
