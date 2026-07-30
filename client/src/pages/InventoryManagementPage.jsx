import { useState } from "react";
import PageHeader from "../features/InventoryManagement/components/PageHeader";
import StockManifestTable from "../features/InventoryManagement/components/StockManifestTable";
import AdjustStockForm from "../features/InventoryManagement/components/AdjustStockForm";

export default function InventoryManagementPage({ products = [], onAdjust }) {
  const [items, setItems] = useState(products);

  function handleSave(productId, { change, unit, reason }) {
    setItems((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, onHand: p.onHand + change, unit: p.unit || unit } : p
      )
    );
    onAdjust?.(productId, { change, unit, reason });
  }

  return (
    <div className="page-light">
      <div className="decanting-content">
        <PageHeader title="Inventory" subtitle="Current stock levels and manual adjustments." />
        <StockManifestTable products={items} onViewHistory={(id) => console.log("view history", id)} />
        <AdjustStockForm products={items} onSave={handleSave} />
      </div>
    </div>
  );
}