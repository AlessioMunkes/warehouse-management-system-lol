import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ProductMatchCombobox } from "./ProductMatchComboBox";
import ProductScanBar from "../scan/ProductScanBar";

const blankItem = () => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "",
  weight: "",
  expiryDate: "",
  productId: null,
  productLabel: "",
  unknownProduct: false,
});

const fieldInvalid = (error) => Boolean(error);

function DonationItemRow({ item, onChange, onRemove, canRemove, error = {}, isFood }) {
  const productName = item.productLabel || item.description || "";
  return (
    <div className="stf-row stf-row--check">
      <div className="stf-row-main">
        {isFood ? (
          <div className="stf-field">
            <span className="stf-field-label">Product Search</span>
            <ProductMatchCombobox
              value={item.productId}
              label={item.productLabel}
              onSelect={(productId, productLabel) =>
                onChange({
                  ...item,
                  productId,
                  productLabel,
                  description: productLabel || item.description,
                  unknownProduct: false,
                })
              }
            />
            {error.product && <span className="stf-field-hint" style={{ color: "var(--stf-attention)" }}>{error.product}</span>}
            {!item.productId && (
              <button
                type="button"
                className="stf-btn stf-btn-secondary"
                onClick={() => onChange({ ...item, productId: null, productLabel: "", unknownProduct: true })}
              >
                Mark as Unknown Product
              </button>
            )}
            {item.unknownProduct && !item.productId && (
              <input
                className={`stf-input is-text ${fieldInvalid(error.description) ? "is-flagged" : ""}`}
                value={item.description}
                onChange={(e) => onChange({ ...item, description: e.target.value })}
                placeholder="Unknown product description"
                aria-label="Unknown product description"
                aria-invalid={fieldInvalid(error.description)}
              />
            )}
            {error.description && <span className="stf-field-hint" style={{ color: "var(--stf-attention)" }}>{error.description}</span>}
          </div>
        ) : (
          <div className="stf-field">
            <span className="stf-field-label">Product</span>
            <input
              className={`stf-input is-text ${fieldInvalid(error.description) ? "is-flagged" : ""}`}
              value={productName}
              onChange={(e) => onChange({ ...item, description: e.target.value, productLabel: "", productId: null })}
              placeholder="e.g. Blankets"
              aria-label="Product"
              aria-invalid={fieldInvalid(error.description)}
            />
            <span className="stf-field-hint">Routed to the appropriate destination.</span>
            {error.description && <span className="stf-field-hint" style={{ color: "var(--stf-attention)" }}>{error.description}</span>}
          </div>
        )}

        <div className="stf-field">
          <span className="stf-field-label">Quantity</span>
          <input
            className={`stf-input ${fieldInvalid(error.quantity) ? "is-flagged" : ""}`}
            type="number"
            min="0"
            value={item.quantity}
            onChange={(e) => onChange({ ...item, quantity: e.target.value })}
            aria-label="Quantity"
            aria-invalid={fieldInvalid(error.quantity)}
          />
          {error.quantity && <span className="stf-field-hint" style={{ color: "var(--stf-attention)" }}>{error.quantity}</span>}
        </div>

        <div className="stf-field">
          <span className="stf-field-label">Unit</span>
          <select
            className={`stf-select ${fieldInvalid(error.unit) ? "is-flagged" : ""}`}
            value={item.unit}
            onChange={(e) => onChange({ ...item, unit: e.target.value })}
            aria-label="Unit"
            aria-invalid={fieldInvalid(error.unit)}
          >
            <option value="">Select unit</option>
            {['kg', 'g', 'l', 'ml', 'each', 'bag', 'box', 'crate', 'punnet'].map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          {error.unit && <span className="stf-field-hint" style={{ color: "var(--stf-attention)" }}>{error.unit}</span>}
        </div>

      </div>

      {canRemove && (
        <button type="button" className="stf-btn stf-btn-secondary" onClick={onRemove} aria-label="Remove this item">
          Remove item
        </button>
      )}
    </div>
  );
}

export const DonationItemsList = forwardRef(function DonationItemsList(
  { items, onChange, itemErrors = {}, isFood },
  ref
) {
  const containerRef = useRef(null);
  const updateItem = (id, updated) => onChange(items.map((it) => (it.id === id ? updated : it)));
  const addItem = () => onChange([...items, blankItem()]);
  const removeItem = (id) => onChange(items.filter((it) => it.id !== id));

  // Scanning a barcode does what searching the product and typing its
  // quantity would: the same product again adds to its row, a new one
  // fills the empty row or adds a row. The latest list is kept in a ref
  // so two scans answered in the same moment both count.
  const latestItems = useRef(items);
  useEffect(() => { latestItems.current = items; }, [items]);

  // A GS1 case label's use-by date fills a row's expiry when it is empty.
  const scanIntoItems = (match, label) => {
    const all = latestItems.current;
    const name = match.productName;
    const existing = all.find((it) => it.productId != null && String(it.productId) === String(match.productId));
    const empty = all.find((it) => it.productId == null && !it.description && !it.unknownProduct && it.quantity === "");
    const target = existing ?? empty ?? null;
    const quantity = Math.round((Number(existing?.quantity || 0) + match.unitsPerScan) * 1000) / 1000;
    const filled = {
      ...(target ?? blankItem()),
      productId: match.productId,
      productLabel: name,
      description: name,
      unknownProduct: false,
      quantity: String(quantity),
      unit: target?.unit || match.defaultUnit || "",
      expiryDate: target?.expiryDate || label?.useBy || "",
    };
    const next = target
      ? all.map((it) => (it.id === target.id ? filled : it))
      : [...all, filled];
    latestItems.current = next;
    onChange(next);
    const dated = label?.useBy && !target?.expiryDate;
    return `${name}: ${quantity}${filled.unit ? ` ${filled.unit}` : ""}.${dated ? ` Use-by ${label.useBy} from the label.` : ""}`;
  };

  useImperativeHandle(ref, () => ({
    validate: () => {
      containerRef.current?.querySelector('[aria-invalid="true"]')?.focus?.();
      return !containerRef.current?.querySelector('[aria-invalid="true"]');
    },
  }));

  return (
    <div className="stf-step-body" ref={containerRef}>
      <div className="stf-field-label">Donation items</div>
      {/* Food is what has a product to match, so it is what can be scanned. */}
      {isFood ? <ProductScanBar onMatch={scanIntoItems} screen="donation" /> : null}
      <div className="stf-list">
        {items.map((item) => (
          <DonationItemRow
            key={item.id}
            item={item}
            isFood={isFood}
            onChange={(updated) => updateItem(item.id, updated)}
            onRemove={() => removeItem(item.id)}
            canRemove={items.length > 1}
            error={itemErrors[item.id]}
          />
        ))}
      </div>
      <button type="button" className="stf-btn stf-btn-secondary" onClick={addItem}>
        Add Item
      </button>
    </div>
  );
});
