import NoteSheet from '../receipts/NoteSheet';
import { noteNumber } from '../receipts/noteFormat';

// ─────────────────────────────────────────────────────────────
// client/src/features/decanting/DecantingSheetPDF.jsx
//
// The decanting equivalent of DeliveryNotePDF.jsx — same document
// shell (.pdfnote-* classes, the note sheet section of index.css), same html2canvas+jsPDF
// pipeline (usePdfDocument), adapted to what a decanting record
// actually has instead of a delivery: no supplier, no signature (this
// is an internal record with no external party to sign it), one or
// more product lines instead of purchase-order lines, and a bag
// breakdown instead of a weight column.
//
// Fed by whatever recordDecanting/getDecantingById returns — see
// server/src/repositories/decanting.repository.js's getDecantingById,
// which both already call, so the shape here matches that query's
// columns exactly rather than a route-specific one.
// ─────────────────────────────────────────────────────────────

const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

// "500g" and "2kg" sort largest-first, the same order DecantingFlow's
// own bag-list screen uses — a sheet that lists 500 g bags before 2 kg
// ones reads backwards to someone used to the screen it came from.
const bagKg = (label) => (label.endsWith('kg') ? parseFloat(label) : parseFloat(label) / 1000);
const bagLabelsOf = (bags) => Object.keys(bags || {}).sort((a, b) => bagKg(b) - bagKg(a));
const bagSummaryOf = (bags) =>
  bagLabelsOf(bags).map((label) => `${bags[label]} × ${label}`).join(', ') || '-';

// 5%, same threshold DecantingFlow's own count-back screen warns at —
// one number in one place would be worse than this repeating it, but
// two different thresholds for the same fact would be worse still.
const WASTAGE_WARN_RATIO = 0.05;

const DecantingSheetPDF = ({ record, onClose }) => {
  if (!record) return null;

  const lines = record.lines || [];
  const flaggedWastage = lines.some((line) =>
    Number(line.actual_bulk_kg) > 0 &&
    Number(line.wastage_kg || 0) > Number(line.actual_bulk_kg) * WASTAGE_WARN_RATIO
  );
  const marginExceeded = lines.some((line) => line.within_margin === false);

  const status = flaggedWastage
    ? { label: 'Wastage flagged', className: 'pdfnote-status-partial' }
    : marginExceeded
      ? { label: 'Margin exceeded', className: 'pdfnote-status-partial' }
      : { label: 'Within margin', className: 'pdfnote-status-complete' };

  const additionalInfo = flaggedWastage
    ? 'One or more lines lost more than usual to spillage or spoilage. A manager will review the wastage recorded below.'
    : marginExceeded
      ? 'One or more lines fell outside the usual bagging margin. A manager will review the split recorded below.'
      : 'Every line on this sheet packed within the usual bagging margin, with no unusual wastage recorded.';

  return (
    <NoteSheet
      title="Decanting Sheet"
      toolbarTitle={`DECANTING SHEET #${record.id} - Week of ${formatDate(record.week_of)}`}
      filename={`decanting-sheet-${record.id}`}
      onClose={onClose}
      meta={[
        { label: 'Sheet no.', value: noteNumber(record.id) },
        { label: 'Week of', value: formatDate(record.week_of) },
        { label: 'Recorded', value: formatDate(record.created_at) },
        { label: 'Recorded by', value: record.recorded_by_name || 'Warehouse Worker' },
        {
          label: 'Status',
          value: status.label,
          tone: status.className === 'pdfnote-status-complete' ? 'complete' : 'partial',
        },
      ]}
      info={additionalInfo}
    >
      <table className="pdfnote-table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="pdfnote-table-center">Weighed</th>
            <th className="pdfnote-table-center">Packed</th>
            <th>Bags</th>
            <th className="pdfnote-table-center">Wastage</th>
          </tr>
        </thead>
        <tbody>
          {lines.length ? (
            lines.map((line, i) => (
              <tr key={line.id ?? i}>
                <td className="pdfnote-table-product">{line.product_name || '-'}</td>
                <td className="pdfnote-table-center">
                  {line.actual_bulk_kg != null ? `${line.actual_bulk_kg} kg` : '-'}
                </td>
                <td className="pdfnote-table-center">
                  {line.packed_kg != null ? `${line.packed_kg} kg` : '-'}
                </td>
                <td className="pdfnote-table-sku">{bagSummaryOf(line.bags)}</td>
                <td className="pdfnote-table-center">
                  {Number(line.wastage_kg || 0) > 0 ? `${line.wastage_kg} kg` : '-'}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="pdfnote-table-empty">No lines on record</td>
            </tr>
          )}
        </tbody>
      </table>
    </NoteSheet>
  );
};

export default DecantingSheetPDF;
