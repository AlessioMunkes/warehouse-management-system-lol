// ─────────────────────────────────────────────────────────────
// AdjustStockForm.jsx
//
// Manual stock correction (BR-02: every manual change needs a
// logged reason). Manager/admin only — the route layer enforces
// this server-side; hiding the form is a convenience, not the
// control.
//
// Direction + magnitude are captured separately rather than asking
// a warehouse manager to type a negative number. "Remove 12" is
// harder to get wrong on a tablet than "-12", and a mistyped minus
// writes the wrong sign straight into an append-only ledger.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import StepCard from "./StepCard";
import FormField from "./FormField";
import Button from "./Button";

const REASONS = [
  "Stock count correction",
  "Damaged / spoiled",
  "Expired",
  "Spillage",
  "Donation not captured at receiving",
  "Other (explain below)",
];

export default function AdjustStockForm({ products, onSave, isSaving = false }) {
  const [productId, setProductId] = useState("");
  const [direction, setDirection] = useState("add");
  const [amount, setAmount]       = useState("");
  const [reason, setReason]       = useState("");
  const [note, setNote]           = useState("");
  const [errors, setErrors]       = useState({});

  const selected = products.find((p) => String(p.id) === String(productId));

  const reset = () => {
    setProductId(""); setDirection("add"); setAmount("");
    setReason(""); setNote(""); setErrors({});
  };

  const validate = () => {
    const next = {};
    if (!productId) next.productId = "Choose a product.";

    const magnitude = Number(amount);
    if (amount === "" || !Number.isFinite(magnitude)) {
      next.amount = "Enter a quantity.";
    } else if (magnitude <= 0) {
      // The sign comes from the direction toggle, so the amount is
      // always a positive magnitude. Zero is rejected server-side too.
      next.amount = "Enter a quantity greater than zero.";
    }

    if (!reason) next.reason = "A reason is required for manual adjustments.";
    if (reason === "Other (explain below)" && !note.trim()) {
      next.note = "Describe the reason.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const magnitude = Number(amount);
    const quantityDelta = direction === "remove" ? -magnitude : magnitude;

    // The full reason string is what lands in the audit ledger, so the
    // free-text note is appended rather than stored separately.
    const fullReason = note.trim() ? `${reason} — ${note.trim()}` : reason;

    const ok = await onSave({
      productId: Number(productId),
      quantityDelta,
      unit: selected?.unit || undefined,
      reason: fullReason,
    });

    // Only clear on success, or a failed save loses everything the
    // manager just typed and they have to re-enter it from memory.
    if (ok) reset();
  };

  return (
    <StepCard
      title="Adjust stock"
      subtitle="Corrections are logged against your name and cannot be edited afterwards."
    >
      <FormField
        id="adjust-product"
        label="Product"
        as="select"
        value={productId}
        error={errors.productId}
        onChange={(e) => setProductId(e.target.value)}
      >
        <option value="">Select a product</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.sku}) — {p.onHand} {p.unit} on hand
          </option>
        ))}
      </FormField>

      <FormField
        id="adjust-direction"
        label="Direction"
        as="select"
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
      >
        <option value="add">Add to stock</option>
        <option value="remove">Remove from stock</option>
      </FormField>

      <FormField
        id="adjust-amount"
        label={`Quantity${selected?.unit ? ` (${selected.unit})` : ""}`}
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        placeholder="e.g. 12"
        value={amount}
        error={errors.amount}
        helperText={
          selected
            ? `New level will be ${
                direction === "remove"
                  ? selected.onHand - (Number(amount) || 0)
                  : selected.onHand + (Number(amount) || 0)
              } ${selected.unit}`
            : undefined
        }
        onChange={(e) => setAmount(e.target.value)}
      />

      <FormField
        id="adjust-reason"
        label="Reason"
        as="select"
        value={reason}
        error={errors.reason}
        onChange={(e) => setReason(e.target.value)}
      >
        <option value="">Select a reason</option>
        {REASONS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </FormField>

      <FormField
        id="adjust-note"
        label="Note"
        as="textarea"
        rows={2}
        placeholder="Any extra detail for the audit trail"
        value={note}
        error={errors.note}
        onChange={(e) => setNote(e.target.value)}
      />

      <Button variant="primaryFull" onClick={handleSubmit} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save adjustment"}
      </Button>
    </StepCard>
  );
}