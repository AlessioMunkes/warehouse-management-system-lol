// ─────────────────────────────────────────────────────────────
// MovementHistory.jsx
//
// Drill-in for one product's stock_movements rows — the audit
// ledger behind the manifest number. Opens as a modal over the
// manifest, reusing the modal-* classes already used by
// PageHeader's logout confirm.
//
// This is read-only by design. stock_movements is append-only:
// a mistake is corrected by posting an opposing adjustment, which
// leaves both entries visible. Nothing here edits or deletes.
// ─────────────────────────────────────────────────────────────
import Badge from "./Badge";
import Button from "./Button";

// movement_type values written by stock.repository.js and its callers.
const TYPE_LABEL = {
  adjustment: "Manual adjustment",
  receipt:    "Goods received",
  pick:       "Picked for dispatch",
  decant:     "Decanting",
  wastage:    "Wastage",
};

const formatWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // en-ZA gives day/month/year, which is what the warehouse reads.
  return d.toLocaleString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export default function MovementHistory({ product, movements, isLoading, error, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* role/aria-modal so screen readers announce this as a dialog
          and label it with the product name, rather than reading it
          as a loose div stacked on top of the manifest. */}
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title" id="movement-history-title">{product.name}</h3>
        <p className="modal-body">
          {product.sku} · {product.onHand} {product.unit} on hand
        </p>

        {isLoading && <p className="pdf-table-empty">Loading history…</p>}

        {error && <div className="alert-error"><p>{error}</p></div>}

        {!isLoading && !error && movements.length === 0 && (
          <p className="pdf-table-empty">
            No movements recorded for this product yet.
          </p>
        )}

        {!isLoading && !error && movements.length > 0 && (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Change</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatWhen(m.createdAt)}</td>
                    <td>
                      <Badge variant={m.quantity < 0 ? "flagged" : "ok"}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {m.unit}
                      </Badge>
                    </td>
                    <td>{TYPE_LABEL[m.movementType] ?? m.movementType}</td>
                    <td>{m.reason || "—"}</td>
                    <td>{m.performedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}