// ─────────────────────────────────────────────────────────────
// StockManifestTable.jsx
//
// Every active product and its current level.
//
// The responsive desktop-table / mobile-card split used to live in
// AdjustStockForm.jsx, which was a copy of this component that had
// been improved in the wrong file. The improvement is kept here;
// AdjustStockForm is now an actual form.
//
// Status badges come from is_shortfall / is_low_stock, which the
// repository computes in SQL, so every screen that reads the
// manifest agrees on what "low" means. Don't recompute them here.
// ─────────────────────────────────────────────────────────────
import StepCard from "./StepCard";
import Badge from "./Badge";
import Button from "./Button";

function statusBadges(product) {
  const badges = [];
  if (product.isShortfall) badges.push(<Badge key="shortfall" variant="flagged">Shortfall</Badge>);
  if (product.isLowStock)  badges.push(<Badge key="low" variant="pending">Low stock</Badge>);
  if (badges.length === 0) badges.push(<Badge key="ok" variant="ok">In stock</Badge>);
  return <div className="badge-group">{badges}</div>;
}

export default function StockManifestTable({ products, onViewHistory, isLoading = false }) {
  if (isLoading) {
    return (
      <StepCard title="Stock manifest" subtitle="Every active product and its current level.">
        <p className="pdf-table-empty">Loading stock levels…</p>
      </StepCard>
    );
  }

  return (
    <StepCard title="Stock manifest" subtitle="Every active product and its current level.">
      {products.length === 0 ? (
        <p className="pdf-table-empty">No active products found.</p>
      ) : (
        <>
          {/* Desktop / wide-screen table */}
          <div className="data-table-wrapper stock-table-desktop">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>On hand</th>
                  <th>Reorder at</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="is-emphasis">{product.name}</td>
                    <td className="pdf-table-sku">{product.sku}</td>
                    <td>{product.onHand} {product.unit}</td>
                    <td>{product.reorderAt} {product.unit}</td>
                    <td>{statusBadges(product)}</td>
                    <td>
                      <Button variant="link" type="button" onClick={() => onViewHistory?.(product)}>
                        View history
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="stock-table-mobile">
            {products.map((product) => (
    <div className="card-row" key={product.id}>
      <div className="stock-card-meta" style={{ flex: 1 }}>
        <div className="stock-card-title-row">
          <span className="stock-card-name">{product.name}</span>
          <span className="stock-card-sku">{product.sku}</span>
        </div>
        <div className="stock-card-figures">
          <span>On hand: {product.onHand} {product.unit}</span>
          <span>Reorder at: {product.reorderAt} {product.unit}</span>
        </div>
        {statusBadges(product)}
      </div>
      <Button variant="link" type="button" onClick={() => onViewHistory?.(product)}>
        View history
      </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </StepCard>
  );
}