import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ErrorBanner from '@/components/ui/error-banner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartTooltip from '@/features/reporting/ChartTooltip';
import { BAR_CURSOR } from '@/features/reporting/chartFormat';
import { useChartMotion } from '@/features/reporting/useChartMotion';
import {
  TYPES,
  LIST_TYPES,
  CHART_COLORS,
  axisProps,
  formatMoney,
  byType,
  movementDate,
  movementType,
  moneyTotal,
  dateOnly,
  dateRangeLabel,
  buildChartData,
  searchListRows,
} from './financeReportData';
import { exportCsv, exportExcel, exportReportPdf } from './financeReportExport';
import { SummaryCard, LegendItem, FinanceList } from './FinanceReportParts';

export default function FinanceWarehouseReportView({ loadReport, showReset = true }) {
  const animate = useChartMotion();
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
        description="Review stock received and issued for a period."
        actions={loading ? <Badge variant="secondary">Loading</Badge> : null}
      />

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
                      <XAxis dataKey="label" tickMargin={8} {...axisProps} />
                      <YAxis allowDecimals={false} {...axisProps} />
                      <Tooltip content={<ChartTooltip unit="records" labelFor={(l) => l} />} cursor={BAR_CURSOR} />
                      <Bar dataKey="donations" name="Donations" fill={CHART_COLORS.donations} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                      <Bar dataKey="po" name="Purchase Orders" fill={CHART_COLORS.po} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                      <Bar dataKey="dispatches" name="Dispatch" fill={CHART_COLORS.dispatches} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
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
