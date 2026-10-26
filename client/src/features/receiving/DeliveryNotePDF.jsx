// ─────────────────────────────────────────────────────────────
// client/src/features/receiving/DeliveryNotePDF.jsx
//
// The delivery note: what a supplier brought, counted against what was
// ordered, signed by the driver. Shown the moment a delivery is
// recorded (ReceivingFlow), from the worker's past deliveries, and from
// the manager's Receipts page. One component for all three.
//
// Laid out by NoteSheet, the layout every note shares. This file only
// says what a delivery note contains.
//
// The note is what the driver signs, so it states what actually
// arrived and not only what was ordered: a short delivery must not be
// signable as complete. A line that differs is marked and carries its
// reason underneath.
//
// items_from_purchase_order: a note with no lines of its own shows the
// ORDER's lines instead, and says so. Quantities that are not a record
// of what arrived must never pass for one.
// ─────────────────────────────────────────────────────────────
import NoteSheet, { NoteSignatures } from '../receipts/NoteSheet';
import { formatDate, formatDateTime, fmtQty, variance, noteNumber, deliveryStatusLabel } from '../receipts/noteFormat';

const DeliveryNotePDF = ({ delivery, onClose }) => {
  if (!delivery) return null;

  const items     = delivery.items || [];
  const fromPO    = Boolean(delivery.items_from_purchase_order);
  const isFlagged = delivery.status === 'flagged';
  const order     = delivery.po_number
    || (delivery.po_id || delivery.purchase_order_id ? `#${delivery.po_id || delivery.purchase_order_id}` : '-');

  const variedCount = fromPO ? 0 : items.filter(
    (i) => variance(i.received_quantity, i.expected_quantity) !== null
  ).length;
  // What a person reads, the same on every screen (deliveryStatusLabel):
  // a line in short makes the delivery partial.
  const shortCount = fromPO ? 0 : items.filter((i) => Number(i.received_quantity) < Number(i.expected_quantity)).length;

  const info = fromPO
    ? `This note has no lines of its own, so the quantities below are what was ORDERED on ${order}. They are not a record of what arrived.`
    : variedCount > 0
      ? `${variedCount} ${variedCount === 1 ? 'line' : 'lines'} did not match the order, marked * below. What was received is what went into stock.`
      : 'Everything on this delivery matched the order.';

  const columns = fromPO ? 3 : 4;

  return (
    <NoteSheet
      title="Delivery Note"
      toolbarTitle={`DELIVERY NOTE #${delivery.id} - ${delivery.supplier_name || 'Unknown supplier'}`}
      filename={`delivery-note-${delivery.id}`}
      onClose={onClose}
      party={{
        heading: 'From',
        name: delivery.supplier_name,
        lines: [delivery.supplier_address, delivery.supplier_phone],
      }}
      meta={[
        { label: 'Delivery note no.', value: noteNumber(delivery.id) },
        { label: 'Delivered', value: delivery.delivered_at ? formatDateTime(delivery.delivered_at) : formatDate(delivery.delivery_date) },
        { label: 'Purchase order', value: order },
        { label: 'Received by', value: delivery.received_by_name || '-' },
        {
          label: 'Status',
          value: deliveryStatusLabel({ shortCount }),
          tone: shortCount > 0 || isFlagged || variedCount > 0 ? 'partial' : 'complete',
        },
      ]}
      info={info}
    >
      <table className="pdfnote-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>SKU</th>
            <th className="pdfnote-table-center">Ordered</th>
            {!fromPO ? <th className="pdfnote-table-center">Received</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length ? (
            items.map((item, i) => {
              const key = item.delivery_note_item_id ?? item.purchase_order_item_id ?? i;
              const varied = !fromPO && variance(item.received_quantity, item.expected_quantity) !== null;
              return [
                <tr key={key}>
                  <td className="pdfnote-table-product">{item.product_name || '-'}</td>
                  <td className="pdfnote-table-sku">{item.sku || '-'}</td>
                  <td className="pdfnote-table-center">{fmtQty(item.expected_quantity, item.unit)}</td>
                  {!fromPO ? (
                    <td className="pdfnote-table-center">
                      {fmtQty(item.received_quantity, item.unit)}{varied ? ' *' : ''}
                    </td>
                  ) : null}
                </tr>,
                varied && item.discrepancy_reason ? (
                  <tr key={`${key}-reason`} className="pdf-reason-row">
                    <td colSpan={columns}>
                      <strong>Reason: </strong>{item.discrepancy_reason}
                      {item.discrepancy_resolved ? ' (resolved)' : ''}
                    </td>
                  </tr>
                ) : null,
              ];
            })
          ) : (
            <tr>
              <td colSpan={columns} className="pdfnote-table-empty">No items on record</td>
            </tr>
          )}
        </tbody>
      </table>

      <NoteSignatures
        signed={{
          label: 'Driver’s signature',
          image: delivery.signature,
          name: delivery.driver_name || null,
        }}
        by={{
          label: 'Received by',
          name: `${delivery.received_by_name || 'Warehouse Worker'} · ${delivery.delivered_at ? formatDateTime(delivery.delivered_at) : formatDate(delivery.delivery_date)}`,
        }}
      />
    </NoteSheet>
  );
};

export default DeliveryNotePDF;
