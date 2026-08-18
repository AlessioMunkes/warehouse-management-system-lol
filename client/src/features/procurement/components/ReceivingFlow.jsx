// ─────────────────────────────────────────────────────────────
// client/src/features/procurement/components/ReceivingFlow.jsx
//
// Receiving, as four sequential screens (ACC-05):
//
//   1  Which delivery is this?      supplier, then purchase order
//   2  Count this item              one line, one number
//   3  Where are you putting it?    put-away, plus a date if fresh
//   4  Does this look right?        read-back, then commit
//
// Steps 2 and 3 repeat per line, which is why the phase is a name and
// not a number: the rail shows 2 of 4 for every item, because from
// the floor it IS still step 2. The fifteenth carton is not the
// fifteenth step of anything.
//
// Short counts do not block progress. That is deliberate, and comes
// from the sponsor's own problem: bulk deliveries routinely arrive
// lighter than labelled, and a system that refuses to move on until
// the numbers agree is a system that gets abandoned for a clipboard.
// The difference is recorded and the manager is told; the delivery
// still gets received.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, NumberField, ChoiceList, Notice, KeyValues,
} from '../../staff/components/StepPrimitives';
import receivingAPI from '../../../services/receivingAPI';

const TOTAL_STEPS = 4;

// Where a line can go. Two options, because two is how many places
// the warehouse has (warehouse visit, cold room and dry store).
const LOCATIONS = [
  { value: 'dry_store', label: 'Dry store', meta: 'Shelves at the back' },
  { value: 'cold_room', label: 'Cold room', meta: 'For fresh food only' },
];

// Fresh lines need a use-by date and are picked date-first; dry goods
// are picked oldest-first and have no date to record (BR-06). Reads
// products.is_perishable now that it exists (migrations/00X_receiving_
// dispatch.sql); the name heuristic stays only as a fallback for a
// database that hasn't had that migration applied yet, so a missing
// column degrades this to a guess rather than breaking the screen.
const FRESH_HINTS = [
  'spinach', 'butternut', 'cabbage', 'carrot', 'tomato', 'onion',
  'apple', 'banana', 'potato', 'lettuce', 'fresh', 'milk',
];
const isFreshProduct = (item) =>
  typeof item.is_perishable === 'boolean'
    ? item.is_perishable
    : FRESH_HINTS.some((hint) => (item.product_name || '').toLowerCase().includes(hint));

const todayISO = () => new Date().toISOString().slice(0, 10);
const longDate = (value) =>
  new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });

const STEP_META = {
  which: { n: 1, label: 'Which delivery' },
  count: { n: 2, label: 'Counting' },
  place: { n: 3, label: 'Where it goes' },
  check: { n: 4, label: 'Check and finish' },
  done:  { n: 4, label: 'Finished' },
};

export default function ReceivingFlow({ onCrumbChange }) {
  const [phase, setPhase] = useState('which');
  const [lineIndex, setLineIndex] = useState(0);

  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderId, setOrderId] = useState('');

  // One entry per order line: what was expected, what was counted,
  // where it went, and the use-by date if it is fresh.
  const [lines, setLines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const step = STEP_META[phase];

  // ── Suppliers, once ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await receivingAPI.getSuppliers();
        if (!cancelled) setSuppliers(list);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Supplier chosen, load its approved orders ───────────────
  useEffect(() => {
    if (!supplierId) { setOrders([]); return undefined; }
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const list = await receivingAPI.getPurchaseOrders(supplierId);
        if (!cancelled) setOrders(list);
      } catch (err) {
        // A supplier with no approved order is a normal state that
        // has an explanation, not a failure. The empty case below
        // says what to do about it.
        if (!cancelled) { setOrders([]); setError(err.message); }
      }
    })();
    return () => { cancelled = true; };
  }, [supplierId]);

  useEffect(() => { onCrumbChange?.(step.label); }, [step.label, onCrumbChange]);

  const currentLine = lines[lineIndex];
  const supplierName = useMemo(
    () => suppliers.find((s) => String(s.id) === String(supplierId))?.name ?? 'this supplier',
    [suppliers, supplierId]
  );
  const shortLines = lines.filter((l) => l.counted !== '' && Number(l.counted) < l.expected);

  // ── Step 1 to 2 ─────────────────────────────────────────────
  const startCounting = async () => {
    setSaving(true);
    setError(null);
    try {
      const items = await receivingAPI.getPurchaseOrderItems(orderId);
      setLines(items.map((item) => {
        const fresh = isFreshProduct(item);
        return {
          purchaseOrderItemId: item.purchase_order_item_id,
          productId:  item.product_id,
          name:       item.product_name,
          sku:        item.sku,
          expected:   Number(item.expected_quantity ?? 0),
          expectedKg: item.expected_weight_kg === null ? null : Number(item.expected_weight_kg),
          fresh,
          counted:    '',
          location:   fresh ? 'cold_room' : 'dry_store',
          useBy:      '',
        };
      }));
      setLineIndex(0);
      setPhase('count');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const patchLine = (patch) =>
    setLines((all) => all.map((line, i) => (i === lineIndex ? { ...line, ...patch } : line)));

  const goToNextLine = () => {
    if (lineIndex + 1 < lines.length) {
      setLineIndex(lineIndex + 1);
      setPhase('count');
    } else {
      setPhase('check');
    }
  };

  // ── Commit ──────────────────────────────────────────────────
  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      // No driver is recorded here — there is no drivers table and
      // this flow has no field for one. delivery_notes.driver_name is
      // the real column to write to if that's ever added.
      await receivingAPI.recordDelivery({
        supplierId,
        deliveryDate: todayISO(),
        purchaseOrderId: orderId,
        // The endpoint validates that a signature is present. These
        // wireframes do not ask for one at intake (the driver signs at
        // dispatch, not receiving), so the receipt records that it was
        // accepted in the app instead.
        signatureData: 'received-in-app',
        poCompleted: lines.every((l) => Number(l.counted) >= l.expected),
        lineItems: lines.map((line) => {
          const receivedQuantity = Number(line.counted || 0);
          const variance = receivedQuantity - line.expected;
          return {
            purchaseOrderItemId: line.purchaseOrderItemId,
            receivedQuantity,
            overAction: 'accept', // no reject-the-extra UI on this screen yet
            location: line.location,
            expiryDate: line.fresh ? (line.useBy || null) : null,
            // Short and over counts are recorded structurally rather
            // than typed out by staff (that is the whole point of this
            // flow) — the service still requires a reason string for
            // any line that varies from the order, so this is it.
            discrepancyReason:
              variance === 0 ? '' : variance < 0 ? 'Short count at receiving' : 'Over count at receiving',
          };
        }),
      });
      setPhase('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setPhase('which');
    setLines([]);
    setOrderId('');
    setLineIndex(0);
  };

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  return (
    <>
      <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} />

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which delivery ─────────────────────────────── */}
      {phase === 'which' && (
        <StepScreen
          title="Which delivery is this?"
          sub="The driver has a note with a number on it."
          actions={
            <Actions>
              <Button disabled={!orderId || saving} onClick={startCounting}>
                {saving ? 'Loading the list' : 'Start counting'}
              </Button>
            </Actions>
          }
        >
          <ChoiceList
            legend="Who it came from"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={supplierId}
            onChange={(value) => { setSupplierId(value); setOrderId(''); }}
          />

          {supplierId && orders.length === 0 ? (
            <Notice>
              There is no open order for {supplierName} today. Ask your manager to check the order
              before you sign anything in.
            </Notice>
          ) : null}

          {orders.length > 0 ? (
            <ChoiceList
              legend="Which order"
              options={orders.map((o) => ({
                value: o.id,
                label: `Order ${o.id}`,
                meta: o.expected_delivery_date
                  ? `Due ${longDate(o.expected_delivery_date)}`
                  : 'No due date given',
              }))}
              value={orderId}
              onChange={setOrderId}
            />
          ) : null}
        </StepScreen>
      )}

      {/* ── 2 · Count one item ─────────────────────────────── */}
      {phase === 'count' && currentLine && (
        <StepScreen
          title={currentLine.name}
          sub={`The note says ${currentLine.expected}. Count what is actually there.`}
          actions={
            <Actions>
              <Button disabled={currentLine.counted === ''} onClick={() => setPhase('place')}>
                Next
              </Button>
              {lineIndex > 0 ? (
                <Button
                  variant="secondary"
                  onClick={() => { setLineIndex(lineIndex - 1); setPhase('place'); }}
                >
                  Back to the last item
                </Button>
              ) : null}
            </Actions>
          }
        >
          <NumberField
            id="stf-counted"
            label="How many are here?"
            value={currentLine.counted}
            flagged={currentLine.counted !== '' && Number(currentLine.counted) !== currentLine.expected}
            onChange={(value) => patchLine({ counted: value })}
          />

          <KeyValues
            pairs={[
              ['Code', currentLine.sku],
              ['Type', currentLine.fresh ? 'Fresh, needs a use-by date' : 'Dry'],
              ['Item', `${lineIndex + 1} of ${lines.length}`],
            ]}
          />

          {/* The difference is explained beside the number that caused
              it, in the same breath, and it does not stop the next
              item. */}
          {currentLine.counted !== '' && Number(currentLine.counted) < currentLine.expected ? (
            <Notice tone="warn">
              {currentLine.expected - Number(currentLine.counted)} fewer than the note says. Your
              manager will be told, and this delivery stays open until it is sorted out.
            </Notice>
          ) : null}

          {currentLine.counted !== '' && Number(currentLine.counted) > currentLine.expected ? (
            <Notice tone="warn">
              That is more than the note says. Count again, and if it is right your manager will
              check it against the order.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      {/* ── 3 · Where it goes ──────────────────────────────── */}
      {phase === 'place' && currentLine && (
        <StepScreen
          title={`Where are you putting the ${currentLine.name.toLowerCase()}?`}
          sub="Pick the place you are carrying it to."
          actions={
            <Actions>
              <Button disabled={currentLine.fresh && !currentLine.useBy} onClick={goToNextLine}>
                {lineIndex + 1 < lines.length ? 'Next item' : 'Check the delivery'}
              </Button>
              <Button variant="secondary" onClick={() => setPhase('count')}>
                Back to the count
              </Button>
            </Actions>
          }
        >
          <ChoiceList
            legend="Put-away location"
            options={LOCATIONS}
            value={currentLine.location}
            onChange={(value) => patchLine({ location: value })}
          />

          {/* Fresh only. Dry goods get no date field rather than a
              disabled one: an empty box staff are told to skip is a
              box someone eventually fills in wrongly. */}
          {currentLine.fresh ? (
            <div className="stf-field">
              <label className="stf-field-label" htmlFor="stf-useby">
                What is the date on the box?
              </label>
              <input
                id="stf-useby"
                className="stf-input is-text"
                type="date"
                value={currentLine.useBy}
                onChange={(e) => patchLine({ useBy: e.target.value })}
              />
              <p className="stf-field-hint">
                Fresh food is packed by date, so this is what decides which box goes out first.
              </p>
            </div>
          ) : null}
        </StepScreen>
      )}

      {/* ── 4 · Read-back ──────────────────────────────────── */}
      {phase === 'check' && (
        <StepScreen
          title="Does this look right?"
          sub="Tap any line to change it."
          actions={
            <Actions>
              <Button disabled={saving} onClick={finish}>
                {saving ? 'Saving' : 'Finish this delivery'}
              </Button>
            </Actions>
          }
        >
          <div className="stf-list">
            {lines.map((line, i) => {
              const short = Number(line.counted || 0) < line.expected;
              return (
                <button
                  key={line.purchaseOrderItemId}
                  type="button"
                  className={`stf-row${short ? ' is-warn' : ''}`}
                  onClick={() => { setLineIndex(i); setPhase('count'); }}
                >
                  {short ? <span className="stf-notice-mark" aria-hidden="true">!</span> : null}
                  <span className="stf-row-main">
                    <span className="stf-row-title">{line.name}</span>
                    <span className="stf-row-meta">
                      {line.counted || 0} counted
                      {short ? `, ${line.expected - Number(line.counted || 0)} short` : ''}
                      {' · '}
                      {LOCATIONS.find((l) => l.value === line.location)?.label}
                      {line.useBy ? ` · use by ${longDate(line.useBy)}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {shortLines.length > 0 ? (
            <Notice tone="warn">
              {shortLines.length} {shortLines.length === 1 ? 'line is' : 'lines are'} short. Saving
              still records the delivery, and your manager gets the difference to follow up.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      {/* ── Done ───────────────────────────────────────────── */}
      {phase === 'done' && (
        <StepScreen
          title="Delivery received"
          sub="The stock is on the system. You can put the next one in, or move on to packing."
          actions={
            <Actions>
              <Button onClick={restart}>Receive another delivery</Button>
            </Actions>
          }
        />
      )}
    </>
  );
}
