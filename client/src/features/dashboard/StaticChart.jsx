// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/StaticChart.jsx
//
// A dashboard chart from figures the board already has (product
// health from the summary, accounts by role from the user list),
// drawn by the same Recharts chart and palette as the report panels,
// so every chart on the board looks like one family.
// ─────────────────────────────────────────────────────────────
import OperationalChart from '../reporting/OperationalChart';
import '../../styles/operationalReport.css';

export default function StaticChart({ series, unit, hint, description, colorFor }) {
  const report = {
    description,
    chartType: 'bar',
    series: series.map((r) => ({ label: r.label, value: Number(r.value ?? 0) })),
    meta: { unit },
    spec: { dimension: 'category' },
  };
  return <OperationalChart report={report} hint={hint} colorFor={colorFor} compact />;
}
