// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/DispatchNotePDF.jsx
//
// The dispatch note: proof that a pallet left for a centre, signed by
// the driver who took it. Shown the moment a collection is recorded at
// the gate (PalletCheck), from the worker's dispatch history, and from
// the manager's Receipts page. One component for all three.
//
// Laid out by NoteSheet, the layout every note shares. This file only
// says what a dispatch note contains.
//
// Fed by GET /api/dispatch/notes/:eventId. Its lines come from
// dispatch_event_lines, so a note reprinted months later still shows
// what was counted into the vehicle on the day.
// ─────────────────────────────────────────────────────────────
import NoteSheet, { NoteSignatures } from './NoteSheet';
import { formatDate, fmtQty, variance, noteNumber } from './noteFormat';

const COHORT = { tuesday: 'Tuesday', thursday: 'Thursday' };

const STATUS = {
  collected:      { label: 'Collected',        tone: 'complete' },
  late_collected: { label: 'Collected (late)', tone: 'partial' },
  not_collected:  { label: 'Not collected',    tone: 'partial' },
  awaiting:       { label: 'Awaiting collection' },
  cancelled:      { label: 'Cancelled' },
};

const infoFor = (note, variedCount) => {
  if (note.status === 'not_collected') {
    return 'Nobody collected this pallet on its day. Nothing was deducted from stock, and it can still be collected late.';
  }
  const parts = [];
  if (note.override_reason) {
    parts.push(`Released on a manager's authorisation${note.override_by_name ? ` (${note.override_by_name})` : ''}: ${note.override_reason}`);
  }
  if (note.status === 'late_collected') {
    parts.push('This pallet was written off at the cut-off before the driver arrived. It was collected afterwards and recorded as a late collection.');
  }
  if (variedCount > 0) {
    parts.push(`${variedCount} ${variedCount === 1 ? 'line differs' : 'lines differ'} from what packing recorded, marked * below. The loaded quantity is what left the building.`);
  }
  if (parts.length === 0) {
    parts.push('This pallet was collected on time and in full, matched against what packing recorded.');
  }
  return parts.join(' ');
};

const DispatchNotePDF = ({ note, onClose }) => {
  if (!note) return null;

  const lines = note.lines || [];
  const status = STATUS[note.status] || STATUS.collected;
  const wasCollected = note.status === 'collected' || note.status === 'late_collected';
  const variedCount = lines.filter(
    (l) => variance(l.loaded_quantity, l.packed_quantity) !== null
  ).length;

  return (
    <NoteSheet
      title="Dispatch Note"
      toolbarTitle={`DISPATCH NOTE #${note.id} - ${note.ecd_name || 'Unknown beneficiary'}`}
      filename={`dispatch-note-${note.id}`}
      onClose={onClose}
      party={{
        heading: 'To',
        name: note.ecd_name,
        lines: [
          note.contact_name ? `Contact: ${note.contact_name}` : null,
          note.child_count ? `${note.child_count} children served` : null,
        ],
      }}
      meta={[
        { label: 'Dispatch note no.', value: noteNumber(note.id) },
        wasCollected
          ? { label: 'Collected', value: formatDate(note.collected_at) }
          : { label: 'Booked for', value: formatDate(note.dispatch_date) },
        { label: 'Pallet ref', value: note.pallet_ref || '-' },
        { label: 'Cohort', value: COHORT[note.cohort] || '-' },
        { label: 'Status', value: status.label, tone: status.tone },
      ]}
      info={infoFor(note, variedCount)}
    >
      <table className="pdfnote-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>SKU</th>
            <th className="pdfnote-table-center">Packed</th>
            <th className="pdfnote-table-center">Loaded</th>
          </tr>
        </thead>
        <tbody>
          {lines.length ? (
            lines.map((line, i) => {
              const key = line.id ?? i;
              const varied = variance(line.loaded_quantity, line.packed_quantity) !== null;
              // A line packing flagged with none packed loads nothing,
              // but the centre still needs to read why it is not there.
              const notPacked = Number(line.packed_quantity) === 0;
              return [
                <tr key={key}>
                  <td className="pdfnote-table-product">{line.product_name || '-'}</td>
                  <td className="pdfnote-table-sku">{line.sku || '-'}</td>
                  <td className="pdfnote-table-center">{fmtQty(line.packed_quantity, line.unit)}</td>
                  <td className="pdfnote-table-center">
                    {fmtQty(line.loaded_quantity, line.unit)}{varied ? ' *' : ''}
                  </td>
                </tr>,
                (varied || notPacked) && line.variance_reason ? (
                  <tr key={`${key}-reason`} className="pdf-reason-row">
                    <td colSpan={4}>
                      <strong>{notPacked ? 'Not packed: ' : 'Reason: '}</strong>{line.variance_reason}
                    </td>
                  </tr>
                ) : null,
              ];
            })
          ) : (
            <tr>
              <td colSpan={4} className="pdfnote-table-empty">No items on record</td>
            </tr>
          )}
        </tbody>
      </table>

      {wasCollected ? (
        <NoteSignatures
          signed={{
            label: 'Driver’s signature',
            image: note.signature,
            name: [note.driver_name || 'Driver', note.vehicle_reg].filter(Boolean).join(' · '),
          }}
          by={{
            label: 'Dispatched by',
            name: `${note.dispatched_by_name || 'Warehouse Worker'} · ${formatDate(note.collected_at)}`,
          }}
        />
      ) : null}
    </NoteSheet>
  );
};

export default DispatchNotePDF;
