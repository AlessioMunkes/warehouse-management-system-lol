// ─────────────────────────────────────────────────────────────
// AdjustStockModal.jsx
//
// Modal dialog allowing authorized personnel (managers/admins) to:
// 1. Post stock adjustments (+/-) with mandatory audit reasons.
// 2. Adjust product low-stock reorder thresholds on the fly.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Import custom CSS
import "../../../styles/staff.css"; // Adjust path to match your folder structure

const REASONS = [
  "Stock count correction",
  "Damaged / spoiled",
  "Expired",
  "Spillage",
  "Donation not captured at receiving",
  "Other (explain below)",
];

export default function AdjustStockModal({
  product,
  onSave,
  onUpdateThreshold,
  onClose,
  isSaving = false,
}) {
  const [direction, setDirection] = useState("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});

  const [newReorderAt, setNewReorderAt] = useState(
    String(product?.reorderAt ?? "")
  );
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [thresholdMsg, setThresholdMsg] = useState(null);

  if (!product) return null;

  // ── Validation ──────────────────────────────────────────────
  const validate = () => {
    const nextErrors = {};
    const magnitude = Number(amount);

    if (amount === "" || !Number.isFinite(magnitude)) {
      nextErrors.amount = "Enter a valid quantity.";
    } else if (magnitude <= 0) {
      nextErrors.amount = "Quantity must be greater than zero.";
    }

    if (!reason) {
      nextErrors.reason = "Select a reason for the adjustment.";
    }

    if (reason === "Other (explain below)" && !note.trim()) {
      nextErrors.note = "Please describe the reason in detail.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // ── Adjustment Submit Handler ───────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;

    const magnitude = Number(amount);
    const quantityDelta = direction === "remove" ? -magnitude : magnitude;
    const fullReason = note.trim() ? `${reason} — ${note.trim()}` : reason;

    const ok = await onSave({
      productId: product.id,
      quantityDelta,
      unit: product.unit,
      reason: fullReason,
    });

    if (ok) onClose();
  };

  // ── Threshold Update Handler ────────────────────────────────
  const handleSaveThreshold = async () => {
    const val = Number(newReorderAt);
    if (!Number.isFinite(val) || val < 0) {
      setThresholdMsg({ tone: "error", text: "Enter a valid number." });
      return;
    }

    setIsSavingThreshold(true);
    const ok = await onUpdateThreshold?.(product.id, val);
    setIsSavingThreshold(false);

    if (ok) {
      setThresholdMsg({ tone: "success", text: "Threshold updated." });
      setTimeout(() => setThresholdMsg(null), 2000);
    } else {
      setThresholdMsg({ tone: "error", text: "Could not update." });
    }
  };

  const projectedLevel =
    direction === "remove"
      ? (product.onHand || 0) - (Number(amount) || 0)
      : (product.onHand || 0) + (Number(amount) || 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="adjust-modal-container">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {product.name}</DialogTitle>
          <DialogDescription>
            SKU: {product.sku} · Currently {product.onHand} {product.unit} on
            hand. Manual adjustments are logged to the audit ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="adjust-modal-body">
          {/* Direction Select */}
          <div className="adjust-field-group">
            <Label htmlFor="direction">Direction</Label>
            <select
              id="direction"
              className="adjust-select-input"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="add">Add to stock (+)</option>
              <option value="remove">Remove from stock (-)</option>
            </select>
          </div>

          {/* Quantity Input */}
          <div className="adjust-field-group">
            <Label htmlFor="amount">
              Quantity ({product.unit || "units"})
            </Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 25"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="adjust-projected-text">
              New projected level:{" "}
              <span className="adjust-projected-value">
                {projectedLevel} {product.unit}
              </span>
            </p>
            {errors.amount && (
              <p className="adjust-error-message">{errors.amount}</p>
            )}
          </div>

          {/* Reason Selection */}
          <div className="adjust-field-group">
            <Label htmlFor="reason">Reason</Label>
            <select
              id="reason"
              className="adjust-select-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Select an adjustment reason</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.reason && (
              <p className="adjust-error-message">{errors.reason}</p>
            )}
          </div>

          {/* Additional Notes */}
          <div className="adjust-field-group">
            <Label htmlFor="note">Notes / Explanation</Label>
            <Textarea
              id="note"
              rows={2}
              placeholder="Optional detail for audit record..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {errors.note && (
              <p className="adjust-error-message">{errors.note}</p>
            )}
          </div>

          {/* Threshold Reorder Level Subsection */}
          <div className="adjust-threshold-section">
            <Label className="adjust-threshold-label">
              Reorder Warning Threshold
            </Label>
            <div className="adjust-threshold-controls">
              <Input
                type="number"
                min="0"
                className="adjust-threshold-input"
                value={newReorderAt}
                onChange={(e) => setNewReorderAt(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSavingThreshold}
                onClick={handleSaveThreshold}
              >
                {isSavingThreshold ? "Saving..." : "Update Threshold"}
              </Button>
            </div>
            {thresholdMsg && (
              <p
                className={
                  thresholdMsg.tone === "success"
                    ? "adjust-success-message"
                    : "adjust-error-message"
                }
              >
                {thresholdMsg.text}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="adjust-modal-footer">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            type="button"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving} type="button">
            {isSaving ? "Saving..." : "Save Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}