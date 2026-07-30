import { useState } from "react";
import StepCard from "./StepCard";
import FormField from "./FormField";
import Button from "./Button";
import InfoNotice from "./InfoNotice";

export default function AdjustStockForm({ products, onSave }) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantityChange, setQuantityChange] = useState("");
  const [unit, setUnit] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [savedNotice, setSavedNotice] = useState(false);

  function resetForm() {
    setSelectedProductId("");
    setQuantityChange("");
    setUnit("");
    setReason("");
    setErrors({});
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSavedNotice(false);

    const nextErrors = {};
    const product = products.find((p) => p.id === selectedProductId);

    if (!selectedProductId) nextErrors.product = "Choose a product.";

    const parsedChange = Number(quantityChange);
    if (quantityChange.trim() === "" || Number.isNaN(parsedChange)) {
      nextErrors.quantityChange = "Enter a number, positive or negative.";
    }

    const isFirstEverRecord = product && product.unit == null;
    if (isFirstEverRecord && !unit.trim()) {
      nextErrors.unit = "Unit is required for a product's first-ever stock record.";
    }

    if (!reason.trim()) nextErrors.reason = "Say why the count is changing.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSave(selectedProductId, {
      change: parsedChange,
      unit: unit.trim() || product?.unit,
      reason: reason.trim(),
    });

    resetForm();
    setSavedNotice(true);
  }

  return (
    <StepCard title="Adjust stock" subtitle="Corrections are recorded in the product's movement history.">
      {savedNotice && (
        <div style={{ marginBottom: "16px" }}>
          <InfoNotice tone="info">Adjustment saved.</InfoNotice>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="adjust-product"
          as="select"
          label="Product"
          value={selectedProductId}
          error={errors.product}
          onChange={(e) => {
            setSelectedProductId(e.target.value);
            setErrors((prev) => ({ ...prev, product: undefined }));
          }}
        >
          <option value="">Choose a product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </FormField>

        <FormField
          id="adjust-quantity"
          type="number"
          label="Quantity change"
          value={quantityChange}
          error={errors.quantityChange}
          helperText="Enter a positive number to add stock, or a negative number to remove it."
          onChange={(e) => {
            setQuantityChange(e.target.value);
            setErrors((prev) => ({ ...prev, quantityChange: undefined }));
          }}
        />

        <FormField
          id="adjust-unit"
          type="text"
          label="Unit (optional)"
          value={unit}
          error={errors.unit}
          helperText="Leave blank to use this product's existing unit. Required only if this is the product's first-ever stock record."
          onChange={(e) => {
            setUnit(e.target.value);
            setErrors((prev) => ({ ...prev, unit: undefined }));
          }}
        />

        <FormField
          id="adjust-reason"
          as="textarea"
          label="Reason"
          value={reason}
          error={errors.reason}
          helperText="Required — say why the count is changing."
          onChange={(e) => {
            setReason(e.target.value);
            setErrors((prev) => ({ ...prev, reason: undefined }));
          }}
        />

        <Button type="button" variant="primaryFull" onClick={handleSubmit}>
          Save adjustment
        </Button>
      </form>
    </StepCard>
  );
}