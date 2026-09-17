// ─────────────────────────────────────────────────────────────
// client/src/features/decanting/components/DecantingPlanner.jsx
//
// The week planner: many products at once, plan-wide bag sizes with
// per-row overrides, a preview, then one irreversible save. This is
// the body of the old pages/DecantingPage.jsx, moved into a component
// so the page above it can choose between this and the sack flow.
//
// What changed in the move, and nothing else:
//   - the chrome (PageHeader, TaskGrid) and the products fetch moved
//     up to the page, because both modes need them
//   - products arrives as a prop
//   - the two-step "preview then commit" rule, the payload builder,
//     the write-once post-save state and every comment explaining
//     them are untouched
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import StepCard      from './StepCard';
import WeekPicker    from './WeekPicker';
import BagSizeToggle from './BagSizeToggle';
import ProductLineRow from './ProductLineRow';
import StatCard      from './StatCard';
import StatusBadge   from './StatusBadge';
import Callout       from './Callout';
import Button        from './Button';
import { STANDARD_SIZES, sizesToKg } from './BagSizes';
import { calculateDecantingPlan, recordDecanting } from '../../../services/decantingAPI';

// Factory for a blank product line — keeps the "add another product"
// button simple and avoids accidentally sharing state between rows.
const emptyLine = () => ({
  productId: '',
  requiredKg: '',
  actualBulkKg: '',   // optional — backend only calculates surplus/
                      // shortfall if this is filled in
  useOwnSizes: false, // per-row override of the default bag sizes
  customSizes: [],
  wastageKg: '',      // only used at save time, not during preview
});

export default function DecantingPlanner({ products }) {
  const navigate = useNavigate();

  const [weekOf, setWeekOf] = useState('');
  const [notes, setNotes] = useState('');

  // All sizes start selected — matches the backend's own default
  // behaviour when selectedSizes isn't provided at all.
  const [defaultSizes, setDefaultSizes] = useState(STANDARD_SIZES);
  const [lines, setLines] = useState([emptyLine()]);

  const [plan, setPlan] = useState(null);          // result of /calculate
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const toggleDefaultSize = (size) => {
    setDefaultSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const updateLine = (index, updatedLine) => {
    setLines((prev) => prev.map((line, i) => (i === index ? updatedLine : line)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  // Build the "items" array the backend expects, from raw form state.
  // Only lines with both a product and a required weight are included
  // — half-filled rows are silently ignored rather than causing a
  // validation error, since the user might still be mid-typing.
  const buildItemsPayload = () =>
    lines
      .filter((line) => line.productId && line.requiredKg)
      .map((line) => {
        const product = products.find((p) => String(p.id) === String(line.productId));
        return {
          productId: line.productId,
          productName: product?.name,
          requiredKg: Number(line.requiredKg),
          // Only send actualBulkKg if it was actually entered — matches
          // the backend's own optional check. The weighed bulk
          // CONSTRAINS the plan rather than just annotating it: if the
          // sack is short, the backend plans what can actually be
          // filled and reports the gap.
          actualBulkKg: line.actualBulkKg ? Number(line.actualBulkKg) : undefined,
          // Per-line override only sent if the checkbox is on —
          // otherwise the backend falls back to the plan-wide default
          // (resolveSizes). Converted to kg: the API takes numbers and
          // these are display labels. Sending "2kg" made the server
          // read NaN.
          selectedSizes: line.useOwnSizes ? sizesToKg(line.customSizes) : undefined,
          wastageKg: line.wastageKg ? Number(line.wastageKg) : undefined,
        };
      });

  // Calls /calculate — a pure preview, nothing is persisted here.
  const handleCalculate = async () => {
    setError('');
    const items = buildItemsPayload();

    if (items.length === 0) {
      setError('Add at least one product with a required weight before calculating.');
      return;
    }

    setIsCalculating(true);
    try {
      const result = await calculateDecantingPlan({
        selectedSizes: sizesToKg(defaultSizes),
        items,
      });
      setPlan(result);
    } catch (err) {
      // Backend throws plain Error messages ("Bag size cannot exceed
      // 5 kg.") — surface them directly rather than a generic
      // fallback, since they are already readable.
      setError(err.message || 'Could not calculate the plan. Please try again.');
    } finally {
      setIsCalculating(false);
    }
  };

  // Calls POST /api/decanting — the actual, irreversible save.
  const handleSave = async () => {
    setError('');

    if (!weekOf) {
      setError('Please select which dispatch week this is for.');
      return;
    }
    if (!plan) {
      // Force a calculate pass before allowing save — keeps the
      // two-step "preview then commit" flow honest, rather than
      // letting someone save numbers they never previewed.
      setError('Calculate the plan before saving.');
      return;
    }

    setIsSaving(true);
    try {
      // userId is NOT sent from the frontend — the backend pulls it
      // from the authenticated JWT (req.user.id in the controller).
      await recordDecanting({
        weekOf,
        notes,
        selectedSizes: sizesToKg(defaultSizes),
        items: buildItemsPayload(),
      });
      setSavedSuccess(true);
    } catch (err) {
      setError(err.message || 'Could not save the decanting record. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const linesOverMargin = plan?.summary?.linesOverMargin ?? 0;
  const hasCalculableRows = plan && plan.plans && plan.plans.length > 0;

  // ── Post-save state ─────────────────────────────────────────
  // Once saved, the form is replaced entirely rather than left
  // editable — reinforces that the record is final, matching the
  // backend's write-once design.
  if (savedSuccess) {
    return (
      <StepCard number="✓" title="Decanting record saved">
        <p className="form-helper-text" style={{ marginBottom: 16 }}>
          This record is now final and cannot be edited or deleted.
        </p>
        <Button variant="primary" onClick={() => navigate('/noc')}>
          Back to Nourish Our Children
        </Button>
      </StepCard>
    );
  }

  return (
    <>
      <div className="page-title-row">
        <h1 className="programme-select-heading">Decanting</h1>
        <p className="programme-select-subtitle">
          Plan the week's bulk split and log what actually got packed.
        </p>
      </div>

      {/* Single shared error banner for both calculate and save
          failures — keeps error handling in one place. */}
      {error && (
        <div className="alert-error">
          <p>{error}</p>
        </div>
      )}

      {/* ── Step 1: which dispatch week this run is for ──────── */}
      <StepCard number={1} title="Set up the week">
        <div className="form-grid-2">
          <WeekPicker
            label="Week of"
            required
            value={weekOf}
            onChange={setWeekOf}
            helperText="Which dispatch week is this decanting for?"
          />
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. new supplier for oats"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="form-helper-text">Anything unusual about this week's run</p>
          </div>
        </div>
      </StepCard>

      {/* ── Step 2: plan-wide bag size defaults ─────────────── */}
      <StepCard number={2} title="Choose default bag sizes">
        <p className="form-helper-text" style={{ marginBottom: 16 }}>
          Applies to every product below. You can override this on any individual row.
        </p>
        <div className="bag-size-toggle-group">
          {STANDARD_SIZES.map((size) => (
            <BagSizeToggle
              key={size}
              label={size}
              selected={defaultSizes.includes(size)}
              onToggle={() => toggleDefaultSize(size)}
            />
          ))}
        </div>
      </StepCard>

      {/* ── Step 3: one row per product ─────────────────────── */}
      <StepCard number={3} title="Add product lines">
        {lines.map((line, index) => (
          <ProductLineRow
            key={index}
            index={index}
            products={products}
            line={line}
            onChange={(updated) => updateLine(index, updated)}
            onRemove={() => removeLine(index)}
            canRemove={lines.length > 1}
          />
        ))}

        <Button variant="secondary" icon="plus" onClick={addLine}>
          Add another product
        </Button>
      </StepCard>

      {/* ── Calculate action — explicitly a preview ─────────── */}
      <div className="decanting-action-row">
        <Callout>
          Calculating is just a preview. Nothing is saved until you press{' '}
          <strong>Save decanting record</strong>.
        </Callout>
        <Button
          variant="primary"
          icon="calculator"
          onClick={handleCalculate}
          disabled={isCalculating}
        >
          {isCalculating ? 'Calculating…' : 'Calculate plan'}
        </Button>
      </div>

      {/* ── Plan preview — read-only display of the backend's
           calculated response, never recalculated client-side ── */}
      <StepCard number={null} title="Plan preview">
        <div className="plan-preview-header">
          {hasCalculableRows && (
            linesOverMargin === 0 ? (
              <StatusBadge status="success">All within margin</StatusBadge>
            ) : (
              <StatusBadge status="warning">
                {linesOverMargin} line{linesOverMargin > 1 ? 's' : ''} over margin
              </StatusBadge>
            )
          )}
        </div>

        <div className="stat-card-grid">
          <StatCard label="Total required" value={`${plan?.summary?.totalRequiredKg ?? 0}kg`} />
          <StatCard label="Total packed" value={`${plan?.summary?.totalPackedKg ?? 0}kg`} />
          <StatCard label="Total bags" value={plan?.summary?.totalBags ?? 0} />
          {/* Surplus/shortfall show an em dash rather than 0 when no
              lines have entered bulk weight yet, so an empty plan
              doesn't look like a confirmed "no shortfall". */}
          <StatCard label="Surplus" value={hasCalculableRows ? `${plan.summary.totalSurplusKg}kg` : '—'} />
          <StatCard label="Shortfall" value={hasCalculableRows ? `${plan.summary.totalShortfallKg}kg` : '—'} />
        </div>

        {!hasCalculableRows && (
          <p className="form-helper-text">
            No calculable rows yet. Add a product and a required weight, then calculate.
          </p>
        )}

        {hasCalculableRows && (
          <div className="plan-preview-lines">
            {plan.plans.map((line, i) => (
              <div key={i} className="plan-preview-line">
                <p className="plan-preview-line-title">
                  {line.productName || `Product ${i + 1}`}
                </p>
                <p className="form-helper-text">
                  {/* Only show bag sizes actually used (count > 0) */}
                  {Object.entries(line.bags)
                    .filter(([, count]) => count > 0)
                    .map(([size, count]) => `${count} × ${size}`)
                    .join(', ')}
                  {' — '}
                  {line.totalBags} bag{line.totalBags !== 1 ? 's' : ''}, packed {line.packedKg}kg
                </p>
                {line.withinMargin ? (
                  <StatusBadge status="success">Within margin</StatusBadge>
                ) : (
                  <StatusBadge status="warning">Over margin</StatusBadge>
                )}
                {/* Only render if actualBulkKg was entered for this
                    line — matches the backend only setting these
                    fields conditionally. */}
                {line.surplusKg > 0 && (
                  <span className="form-helper-text"> · {line.surplusKg}kg surplus</span>
                )}
                {line.shortfallKg > 0 && (
                  <span className="form-helper-text"> · {line.shortfallKg}kg shortfall</span>
                )}
              </div>
            ))}
          </div>
        )}
      </StepCard>

      {/* ── Step 4: wastage + final save ────────────────────── */}
      <StepCard number={4} title="Record wastage and save">
        <p className="form-helper-text" style={{ marginBottom: 16 }}>
          Add any weight lost during decanting (optional), then save the record.
        </p>

        {/* Wastage inputs only make sense once a plan exists — no
            point asking about wastage for a plan nobody has
            calculated yet. */}
        {hasCalculableRows &&
          lines
            .filter((line) => line.productId && line.requiredKg)
            .map((line, index) => {
              const product = products.find((p) => String(p.id) === String(line.productId));
              return (
                <div className="form-group" key={index}>
                  <label className="form-label">
                    Wastage for {product?.name || `product ${index + 1}`} (kg)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    className="form-input"
                    placeholder="Optional"
                    value={line.wastageKg}
                    onChange={(e) => updateLine(index, { ...line, wastageKg: e.target.value })}
                  />
                </div>
              );
            })}

        <div className="decanting-save-row">
          <p className="form-helper-text">
            Once saved, this record is final — it cannot be edited or deleted.
          </p>
          <Button
            variant="primary"
            icon="device-floppy"
            onClick={handleSave}
            disabled={isSaving || !hasCalculableRows}
          >
            {isSaving ? 'Saving…' : 'Save decanting record'}
          </Button>
        </div>
      </StepCard>
    </>
  );
}
