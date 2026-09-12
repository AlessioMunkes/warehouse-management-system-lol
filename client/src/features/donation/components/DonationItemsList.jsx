
// ─────────────────────────────────────────────────────────────
// features/donation/components/DonationItemsList.jsx
// UPDATED: Added forwardRef/useImperativeHandle to expose a 
// validateAndFocus() method to parent components. When called,
// it marks fields touched and auto-focuses/scrolls to the first error.
// ─────────────────────────────────────────────────────────────
import { useState, useRef, useImperativeHandle, forwardRef } from "react";
import { ProductMatchCombobox } from "./ProductMatchComboBox";

const UNITS = ["kg", "g", "l", "ml", "each", "bag", "box", "crate", "punnet"];

// ── Description ──────────────────────────────────────────────
const descriptionMessage = (v) => {
  if (!v?.trim()) return { valid: false, message: "A description is required." };
  return { valid: true, message: "Looks good." };
};

// ── Quantity ──────────────────────────────────────────────────
const quantityMessage = (v) => {
  if (v === "" || v === undefined || v === null) return { valid: false, message: "A quantity is required." };
  if (Number.isNaN(Number(v))) return { valid: false, message: "Enter a number, not text." };
  if (Number(v) <= 0) return { valid: false, message: "Quantity must be greater than zero." };
  return { valid: true, message: "Looks good." };
};

const DonationItemRow = forwardRef(function DonationItemRow(
  { item, onChange, onRemove, canRemove, error = {} },
  ref
) {
  const [touched, setTouched] = useState({});

  const descInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const unitInputRef = useRef(null);

  const markTouched = (field) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  const descState = descriptionMessage(item.description);
  const qtyState = quantityMessage(item.quantity);
  const descriptionError = error?.description;
  const quantityError = error?.quantity;
  const unitError = error?.unit;
  const showDescriptionError = Boolean(touched.description || descriptionError);
  const showQuantityError = Boolean(touched.quantity || quantityError);
  const showUnitError = Boolean(touched.unit || unitError);

  // Expose validation check & focus mechanism to parent component
  useImperativeHandle(ref, () => ({
    validateAndFocus: () => {
      // Mark fields as touched so validation errors show up visually.
      setTouched({ description: true, quantity: true, unit: true });

      if (!descState.valid) {
        descInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        descInputRef.current?.focus();
        return false;
      }

      if (!qtyState.valid) {
        qtyInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        qtyInputRef.current?.focus();
        return false;
      }

      if (!item.unit) {
        unitInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        unitInputRef.current?.focus();
        return false;
      }

      return true;
    },
  }));

  return (
    <div className="stf-row stf-row--check">
      <div className="stf-row-main">
        <div className="stf-field">
          <span className="stf-field-label">Description</span>
          <input
            ref={descInputRef}
            className={`stf-input is-text ${
              !showDescriptionError ? "" : !descriptionError && descState.valid ? "is-valid" : "is-flagged"
            }`}
            value={item.description}
            onChange={(e) => {
              markTouched("description");
              onChange({ ...item, description: e.target.value });
            }}
            onBlur={() => markTouched("description")}
            placeholder="e.g. Rice"
          />
          {showDescriptionError && (
            <span
              className={`stf-field-hint ${!descriptionError && descState.valid ? "is-valid-msg" : ""}`}
              style={!descriptionError && descState.valid ? undefined : { color: "var(--stf-attention)" }}
            >
              {descriptionError || descState.message}
            </span>
          )}
        </div>

        <div className="stf-field">
          <span className="stf-field-label">Quantity</span>
          <input
            ref={qtyInputRef}
            className={`stf-input ${
              !showQuantityError ? "" : !quantityError && qtyState.valid ? "is-valid" : "is-flagged"
            }`}
            type="number"
            min="0"
            value={item.quantity}
            onChange={(e) => {
              markTouched("quantity");
              onChange({ ...item, quantity: e.target.value });
            }}
            onBlur={() => markTouched("quantity")}
            placeholder="0"
          />
          {showQuantityError && (
            <span
              className={`stf-field-hint ${!quantityError && qtyState.valid ? "is-valid-msg" : ""}`}
              style={!quantityError && qtyState.valid ? undefined : { color: "var(--stf-attention)" }}
            >
              {quantityError || qtyState.message}
            </span>
          )}
        </div>

        <div className="stf-field">
          <span className="stf-field-label">Unit</span>
          <select
            ref={unitInputRef}
            className="stf-select"
            value={item.unit}
            onChange={(e) => {
              markTouched("unit");
              onChange({ ...item, unit: e.target.value });
            }}
            onBlur={() => markTouched("unit")}
            aria-invalid={Boolean(unitError)}
          >
            <option value="" disabled>Select unit</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          {showUnitError && (
            <span className="stf-field-hint" style={{ color: "var(--stf-attention)" }}>
              {unitError || "A unit is required."}
            </span>
          )}
        </div>

        <div className="stf-field">
          <span className="stf-field-label">Match to stock item (optional)</span>
          <ProductMatchCombobox
            value={item.productId}
            label={item.productLabel}
            onSelect={(productId, productLabel) =>
              onChange({ ...item, productId, productLabel })
            }
          />
        </div>
      </div>

      {canRemove && (
        <button
          type="button"
          className="stf-btn stf-btn-secondary"
          onClick={onRemove}
          aria-label="Remove this item"
        >
          Remove item
        </button>
      )}
    </div>
  );
});

export const DonationItemsList = forwardRef(function DonationItemsList(
  { items, onChange, itemErrors = {} },
  ref
) {
  const rowRefs = useRef([]);

  const updateItem = (id, updated) =>
    onChange(items.map((it) => (it.id === id ? updated : it)));

  const addItem = () =>
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: "",
        unit: "",
        productId: null,
        productLabel: "",
        requestedCategory: "",
      },
    ]);

  const removeItem = (id) => onChange(items.filter((it) => it.id !== id));

  // Expose container validation to parent multi-step form
  useImperativeHandle(ref, () => ({
    validate: () => {
      for (let i = 0; i < items.length; i++) {
        const rowRef = rowRefs.current[i];
        if (rowRef && !rowRef.validateAndFocus()) {
          return false; // Stop at first invalid field found
        }
      }
      return true; // All valid
    },
  }));

  return (
    <div className="stf-step-body">
      <div className="stf-field-label">Items</div>

      <div className="stf-list">
        {items.map((item, index) => (
          <DonationItemRow
            key={item.id}
            ref={(el) => (rowRefs.current[index] = el)}
            item={item}
            onChange={(updated) => updateItem(item.id, updated)}
            onRemove={() => removeItem(item.id)}
            canRemove={items.length > 1}
            error={itemErrors[item.id]}
          />
        ))}
      </div>

      <button type="button" className="stf-btn stf-btn-secondary" onClick={addItem}>
        + Add another item
      </button>
    </div>
  );
});
