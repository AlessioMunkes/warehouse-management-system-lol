// src/components/ProductLineRow.jsx
import BagSizeToggle from './BagSizeToggle';

// Imported rather than redeclared: this file used to keep its own
// copy of the list, which then diverged from the page's.
//
// Case matters. This said './bagSizes' while the file on disk is
// BagSizes.jsx — fine on a case-insensitive Windows or macOS disk,
// unresolvable on a Linux CI runner, so `npm run build` failed in
// CI while working locally. Same trap as the lockfile issue.
import { STANDARD_SIZES } from './BagSizes';

const ProductLineRow = ({
  index,
  products,
  line,
  onChange,
  onRemove,
  canRemove,
}) => {
  const handleField = (field, value) => {
    onChange({ ...line, [field]: value });
  };

  const toggleOwnSize = (size) => {
    const current = line.customSizes || [];
    const next = current.includes(size)
      ? current.filter((s) => s !== size)
      : [...current, size];
    onChange({ ...line, customSizes: next });
  };

  return (
    <div className="product-line-row">
      <div className="product-line-row-header">
        <p className="product-line-row-label">Product {index + 1}</p>
        {canRemove && (
          <button
            type="button"
            className="product-line-remove"
            onClick={onRemove}
            aria-label={`Remove product ${index + 1}`}
          >
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="product-line-fields">
        <div className="form-group">
          <label className="form-label">Product</label>
          <select
            className="form-select"
            value={line.productId || ''}
            onChange={(e) => handleField('productId', e.target.value)}
          >
            <option value="" disabled>Choose a product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Required this week (kg)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            className="form-input"
            placeholder="e.g. 25"
            value={line.requiredKg || ''}
            onChange={(e) => handleField('requiredKg', e.target.value)}
          />
        </div>

        <div className="form-group">
          {/* No longer just an annotation: the weighed figure now caps
              the plan, so the team is never told to fill more bags
              than the sack can actually produce. Labelled to reflect
              that, since "Optional — for surplus/shortfall" understated
              why weighing matters. */}
          <label className="form-label">Weighed bulk bag (kg)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            className="form-input"
            placeholder="Weigh the sack"
            value={line.actualBulkKg || ''}
            onChange={(e) => handleField('actualBulkKg', e.target.value)}
          />
          <p className="form-helper-text">
            Weigh it — sacks often hold less than the label says. Leave blank
            only if it has not been weighed yet.
          </p>
        </div>
      </div>

      <label className="product-line-override-toggle">
        <input
          type="checkbox"
          checked={!!line.useOwnSizes}
          onChange={(e) => handleField('useOwnSizes', e.target.checked)}
        />
        Use different bag sizes for this product
      </label>

      {line.useOwnSizes && (
        <div className="bag-size-toggle-group">
          {STANDARD_SIZES.map((size) => (
            <BagSizeToggle
              key={size}
              label={size}
              selected={(line.customSizes || []).includes(size)}
              onToggle={() => toggleOwnSize(size)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductLineRow;