import StepCard from "./StepCard";
import Badge from "./Badge";
import Button from "./Button";

function statusBadges(product) {
  const badges = [];
  if (product.onHand < 0) badges.push(<Badge key="shortfall" variant="flagged">Shortfall</Badge>);
  if (product.onHand <= product.reorderAt) badges.push(<Badge key="low" variant="pending">Low stock</Badge>);
  if (badges.length === 0) badges.push(<Badge key="ok" variant="ok">In stock</Badge>);
  return <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{badges}</div>;
}

export default function StockManifestTable({ products, onViewHistory }) {
  return (
    <StepCard title="Stock manifest" subtitle="Every active product and its current level.">
      <div className="data-table-wrapper">
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
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="pdf-table-empty">
                  No products yet. Adjustments you save will appear here.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id}>
                  <td style={{ fontWeight: 600 }}>{product.name}</td>
                  <td className="pdf-table-sku">{product.sku}</td>
                  <td>{product.onHand} {product.unit}</td>
                  <td>{product.reorderAt} {product.unit}</td>
                  <td>{statusBadges(product)}</td>
                  <td>
                    <Button variant="link" type="button" onClick={() => onViewHistory?.(product.id)}>
                      View history
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </StepCard>
  );
}