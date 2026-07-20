// src/components/ProductLineRow.jsx
import React from 'react';
import BagSizeToggle from './BagSizeToggle';

const STANDARD_SIZES = ['5kg', '2.5kg', '1kg', '500g', '250g'];

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
          <label className="form-label">Bulk weight available (kg)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            className="form-input"
            placeholder="Optional"
            value={line.actualBulkKg || ''}
            onChange={(e) => handleField('actualBulkKg', e.target.value)}
          />
          <p className="form-helper-text">Optional — for surplus/shortfall</p>
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