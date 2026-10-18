// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/ImpactCalculatorPDF.jsx
//
// The Impact report as a printable document, laid out by NoteSheet
// like the delivery note, the dispatch note and the operations report:
// the same title over a red rule, the warehouse on the left, the
// details box on the right, a line of additional information and light
// tables. Only the contents differ.
//
// Two tables: the four headline figures, then beneficiaries by type.
// Every figure is printed with its unit and, where the screen has
// one, the same caption or caveat, so the paper says what the screen
// says. The illustrated poster cards stay on the screen; on paper the
// numbers are the point, and a fixed-height poster page had to be
// sized by hand to stop html2canvas bleeding it into the next page.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import NoteSheet from '../receipts/NoteSheet';
import { formatDate } from '../receipts/noteFormat';
import { useAuth } from '../../context/AuthContext';

const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('en-ZA');

const ESTIMATE_NOTE =
  'Children are headcounted. Adults, Dignity Kitchen guests and households are estimates, '
  + 'worked out from the kilograms dispatched to each kitchen or community request.';

const ImpactCalculatorPDF = ({ pdfStats, beneficiaryTypeStats, dateRange, onClose }) => {
  const { user } = useAuth() ?? {};
  const [generated] = useState(() => new Date());
  if (!pdfStats) return null;

  const preparedBy = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const period = `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`;
  const types = beneficiaryTypeStats ?? [];

  return (
    <NoteSheet
      title="Impact Report"
      toolbarTitle={`IMPACT REPORT - ${period}`}
      filename={`impact-report-${dateRange.from}_${dateRange.to}`}
      onClose={onClose}
      meta={[
        { label: 'Period', value: period },
        { label: 'Generated', value: generated.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) },
        preparedBy ? { label: 'Prepared by', value: preparedBy } : null,
      ]}
      info={types.length ? ESTIMATE_NOTE : null}
    >
      <table className="pdfnote-table">
        <thead>
          <tr>
            <th>Impact</th>
            <th className="pdfnote-table-center">Figure</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {pdfStats.map((s) => (
            <tr key={s.label}>
              <td className="pdfnote-table-product">{s.label}</td>
              <td className="pdfnote-table-center">
                {s.available ? `${fmtNum(s.value)} ${s.unit}` : '-'}
              </td>
              <td>
                {s.available
                  ? [s.caption, s.caveat].filter(Boolean).join(' ') || '-'
                  : s.caveat || 'Not available for this period.'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {types.length ? (
        <>
          <p className="pdfnote-doc-section-heading">Beneficiaries by type</p>
          <table className="pdfnote-table">
            <thead>
              <tr>
                <th>Beneficiary type</th>
                <th className="pdfnote-table-center">Reached</th>
              </tr>
            </thead>
            <tbody>
              {types.map(({ metric, label, unit, stat }) => (
                <tr key={metric}>
                  <td className="pdfnote-table-product">{label}</td>
                  <td className="pdfnote-table-center">
                    {!stat || stat.notReady || stat.error ? '-' : `${fmtNum(stat.value)} ${unit}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </NoteSheet>
  );
};

export default ImpactCalculatorPDF;
