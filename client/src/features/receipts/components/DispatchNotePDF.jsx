// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/components/DispatchNotePDF.jsx
//
// A recorded collection, as a printable note. The goods-out mirror
// of DeliveryNotePDF, per warehouse visit 4.3 — "the same pattern
// should be applied to dispatch".
//
// Reads a dispatch_events id, NOT a picking_slip_id. Two different id
// spaces meet in the dispatch module and mixing them fetches the
// wrong record or 404s.
//
// The lines come from dispatch_event_lines, which is a frozen record
// of what was counted into the vehicle on the day — not a live join
// onto picking_slip_items. A note reprinted six months later still
// shows the day's numbers even if the slip or the product master has
// changed since.
//
// SCOPE NOTE — this is NOT BR-24. BR-24 asks for a Proof of Dispatch
// generated at the close of each dispatch RUN, covering every
// beneficiary on that date and cohort in one document. This is the
// per-collection receipt. The run-level document is a separate
// endpoint (/api/dispatch/runs/:date) and is not built yet.
// ─────────────────────────────────────────────────────────────
import PdfShell from './PdfShell';
import {
  formatDate, formatDateTime, fmtQty, variance, qty,
  DISPATCH_STATUS_LABEL, BENEFICIARY_LABEL,
} from './noteFormat';

const COLLECTED = ['collected', 'late_collected'];

const DispatchNotePDF = ({ note, onClose }) => {
  if (!note) return null;

  const lines       = note.lines || [];
  const wasCollected = COLLECTED.includes(note.status);
  const wasLate      = note.status === 'late_collected';
  const notCollected = note.status === 'not_collected';

  const variedCount = lines.filter(
    (l) => variance(l.loaded_quantity, l.packed_quantity) !== null
  ).length;

  const totalPacked = lines.reduce((s, l) => s + (qty(l.packed_quantity) ?? 0), 0);
  const totalLoaded = lines.reduce((s, l) => s + (qty(l.loaded_quantity) ?? 0), 0);

  return (
    <PdfShell
      title={`DISPATCH NOTE #${note.id} — ${note.ecd_name || 'Unknown beneficiary'}`}
      filename={`dispatch-note-${note.id}`}
      onClose={onClose}
    >
      <div className="pdf-doc-header">
        <div>
          <h1 className="pdf-doc-title">DISPATCH NOTE</h1>
          <p className="pdf-doc-subtitle">Ladles of Love · Nourish Our Children</p>
          <p className="pdf-doc-subtitle">Proof of collection</p>
        </div>
        <div>
          <p className="pdf-doc-id-label">Record number</p>
          <p className="pdf-doc-id">#{String(note.id).padStart(4, '0')}</p>
          <p className="pdf-doc-id-label pdf-doc-id-label--spaced">
            {wasCollected
              ? `Collected: ${formatDateTime(note.collected_at)}`
              : `Flagged: ${formatDateTime(note.flagged_at)}`}
          </p>
        </div>
      </div>

      {/* ── Outcome ────────────────────────────────────────── */}
      <div className={`pdf-status-banner ${wasCollected && !wasLate ? 'pdf-status-banner--complete' : 'pdf-status-banner--warning'}`}>
        <p className={`pdf-status-title ${wasCollected && !wasLate ? 'pdf-status-title--complete' : 'pdf-status-title--pending'}`}>
          {DISPATCH_STATUS_LABEL[note.status] || note.status}
        </p>
        <p className="pdf-status-body">
          {notCollected && (
            <>
              Nobody collected this pallet. It was written off by the 16:00 sweep (BR-14).
              No stock was deducted — the goods stopped counting as committed and read as
              available again. It remains collectable as a late collection.
            </>
          )}
          {wasLate && (
            <>
              This pallet was written off at 16:00 and collected afterwards. The collection
              proceeded normally; nothing had been deducted, so nothing needed unwinding.
            </>
          )}
          {wasCollected && !wasLate && (
            <>Collected at the gate and counted into the vehicle. Stock was deducted against
              the loaded quantities below.</>
          )}
        </p>
      </div>

      {/* ── Override trail ─────────────────────────────────── */}
      {note.override_reason && (
        <div className="pdf-status-banner pdf-status-banner--warning">
          <p className="pdf-status-title pdf-status-title--pending">
            Released on a manager override
          </p>
          <p className="pdf-status-body">
            {note.override_reason}
            {note.override_by_name ? ` — authorised by ${note.override_by_name}` : ''}
          </p>
        </div>
      )}

      {/* ── Variance summary ───────────────────────────────── */}
      {variedCount > 0 && (
        <div className="pdf-status-banner pdf-status-banner--warning">
          <p className="pdf-status-title pdf-status-title--pending">
            {variedCount} line{variedCount === 1 ? '' : 's'} differed from the pallet
          </p>
          <p className="pdf-status-body">
            The loaded quantity is what left the building and what was deducted from stock.
            The packed quantity is what the packer recorded.
          </p>
        </div>
      )}

      <div className="pdf-meta-grid">
        <div>
          <p className="pdf-meta-label">Beneficiary</p>
          <p className="pdf-meta-value">{note.ecd_name || '—'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Type</p>
          <p className="pdf-meta-value">
            {BENEFICIARY_LABEL[note.beneficiary_kind] || 'ECD centre'}
          </p>
        </div>
        <div>
          <p className="pdf-meta-label">Children served</p>
          <p className="pdf-meta-value">{note.child_count ?? '—'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Dispatch date</p>
          <p className="pdf-meta-value">{formatDate(note.dispatch_date)}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Cohort</p>
          <p className="pdf-meta-value">{note.cohort === 'week2' ? 'Week 2' : 'Week 1'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Pallet</p>
          <p className="pdf-meta-value">{note.pallet_ref || '—'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Driver</p>
          <p className="pdf-meta-value">{note.driver_name || '—'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Vehicle</p>
          <p className="pdf-meta-value">{note.vehicle_reg || '—'}</p>
        </div>
        <div>
          <p className="pdf-meta-label">Released by</p>
          <p className="pdf-meta-value">{note.dispatched_by_name || '—'}</p>
        </div>
      </div>

      <p className="pdf-items-title">Items loaded</p>
      <table className="pdf-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th className="pdf-table-center">Packed</th>
            <th className="pdf-table-center">Loaded</th>
            <th className="pdf-table-center">Unit</th>
            <th className="pdf-table-center">Variance</th>
          </tr>
        </thead>
        <tbody>
          {lines.length ? (
            lines.map((line, i) => {
              const v = variance(line.loaded_quantity, line.packed_quantity);
              return [
                <tr key={line.id ?? i} className={v ? 'pdf-table-row--variance' : undefined}>
                  <td className="pdf-table-product">{line.product_name}</td>
                  <td className="pdf-table-sku">{line.sku || '—'}</td>
                  <td className="pdf-table-center">{fmtQty(line.packed_quantity)}</td>
                  <td className="pdf-table-center">{fmtQty(line.loaded_quantity)}</td>
                  <td className="pdf-table-center">{line.unit || '—'}</td>
                  <td className={`pdf-table-center ${v ? v.className : 'pdf-variance-none'}`}>
                    {v ? v.label : 'Matched'}
                  </td>
                </tr>,
                v && line.variance_reason ? (
                  <tr key={`${line.id ?? i}-reason`} className="pdf-reason-row">
                    <td colSpan={6}>
                      <span className="pdf-reason-label">Reason </span>
                      {line.variance_reason}
                    </td>
                  </tr>
                ) : null,
              ];
            })
          ) : (
            <tr>
              <td colSpan={6} className="pdf-table-empty">
                {notCollected
                  ? 'Nothing was loaded — this pallet was not collected.'
                  : 'No lines on record'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {lines.length > 0 && (
        <div className="pdf-totals-row">
          <div className="pdf-total-block">
            <p className="pdf-meta-label">Total packed</p>
            <p className="pdf-meta-value">{fmtQty(totalPacked)}</p>
          </div>
          <div className="pdf-total-block">
            <p className="pdf-meta-label">Total loaded</p>
            <p className="pdf-meta-value">{fmtQty(totalLoaded)}</p>
          </div>
        </div>
      )}

      <div className="pdf-signature-section">
        <div className="pdf-signature-block">
          <p className="pdf-signature-label">Driver signature</p>
          {note.signature ? (
            <img src={note.signature} alt="Driver signature" className="pdf-signature-img" />
          ) : (
            <div className="pdf-signature-line" />
          )}
          <p className="pdf-signature-name">
            {note.driver_name || 'Driver'} · {formatDate(note.dispatch_date)}
          </p>
        </div>
        <div className="pdf-signature-block">
          <p className="pdf-signature-label">Released by (warehouse)</p>
          <div className="pdf-signature-line" />
          <p className="pdf-signature-name">
            {note.dispatched_by_name || 'Dispatch staff'} · {formatDate(note.dispatch_date)}
          </p>
        </div>
      </div>

      <div className="pdf-footer-stamp">
        <p>Ladles of Love NGO · Warehouse Management System</p>
        <p className="pdf-footer-stamp--spaced">
          Generated {formatDateTime(new Date().toISOString())} · Record #{note.id}
        </p>
      </div>
    </PdfShell>
  );
};

export default DispatchNotePDF;
