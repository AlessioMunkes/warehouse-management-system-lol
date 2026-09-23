// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ImpactCalculatorPDF.jsx
//
// A shareable snapshot of the Impact Calculator, styled like the
// existing delivery/dispatch note PDFs (same PdfShell, same
// pdf-doc-* classes in styles/receipts.css) — a branded, one-page
// document rather than a screenshot, per the "full nice view, not
// just stats" ask.
// ─────────────────────────────────────────────────────────────
import PdfShell from '../../receipts/components/PdfShell';
import { formatDate, formatDateTime } from '../../receipts/components/noteFormat';

const ImpactCalculatorPDF = ({ stats, dateRange, onClose }) => {
  if (!stats) return null;

  return (
    <PdfShell
      title="IMPACT CALCULATOR"
      filename={`impact-calculator-${dateRange.from}_${dateRange.to}`}
      onClose={onClose}
    >
      <div className="pdf-doc-header">
        <div>
          <h1 className="pdf-doc-title">IMPACT CALCULATOR</h1>
          <p className="pdf-doc-subtitle">Ladles of Love · Nourish Our Children</p>
          <p className="pdf-doc-subtitle">Warehouse Management System</p>
        </div>
        <div>
          <p className="pdf-doc-id-label">Period</p>
          <p className="pdf-doc-id">
            {formatDate(dateRange.from)} – {formatDate(dateRange.to)}
          </p>
          <p className="pdf-doc-id-label pdf-doc-id-label--spaced">
            Generated: {formatDateTime(new Date().toISOString())}
          </p>
        </div>
      </div>

      <div className="pdf-meta-grid">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="pdf-meta-label">{s.label}</p>
            <p className="pdf-meta-value">
              {s.available ? `${Number(s.value).toLocaleString('en-ZA')} ${s.unit}` : 'Not available yet'}
            </p>
          </div>
        ))}
      </div>

      <table className="pdf-table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Metric</th>
            <th className="pdf-table-center">Value</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.label}>
              <td className="pdf-table-product">{s.label}</td>
              <td className="pdf-table-center">
                {s.available ? `${Number(s.value).toLocaleString('en-ZA')} ${s.unit}` : '—'}
              </td>
              <td className="pdf-table-sku">{s.caveat}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PdfShell>
  );
};

export default ImpactCalculatorPDF;
