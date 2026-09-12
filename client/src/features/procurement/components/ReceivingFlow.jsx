// ─────────────────────────────────────────────────────────────
// client/src/features/procurement/components/ReceivingFlow.jsx
//
// Booking a delivery in at the bay.
//
// SHAPE (changed)
// This used to be four sequential screens for Guided plus a second,
// near-duplicate render tree that put the same fields into one
// scrolling dialog for Form. It is now two screens on the page:
//
//   1  Which delivery   supplier, order, date
//   2  Count and put away   every line at once, then the signature
//
// Guided and Form are the same list now, not two trees. Guided
// focuses one row and offers Next; Form leaves every row collapsed
// and inline-editable. Either way the whole delivery is on screen, so
// a worker can see how much is left and jump straight to the line
// they are standing in front of.
//
// EXCEPTION-FIRST
// Lines arrive pre-filled with the ordered quantity and there is an
// "Everything as ordered" button. Most deliveries match the note;
// retyping nine numbers that were already right was the actual waste.
// Anything that differs still raises the same notice and still sends
// the same structural discrepancy reason.
//
// The idempotency key is generated ONCE per pass and regenerated only
// by restart(). A tablet at the bay loses signal often and finish()
// gets retried by the person tapping again — which used to create a
// second delivery note and put the stock up twice. A key generated
// inside finish() would be new on every tap and would protect nothing.
//
// There is no "save and finish later": nothing in this app persists a
// delivery that has not been submitted. What IS kept is a local draft
// of the numbers, so a tablet that sleeps does not lose the count —
// see hooks/useDraft.js. That refills the form; it never submits.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, SelectField, DateField,
  ChoiceList, Notice, KeyValues, ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import TaskPage from '../../staff/components/TaskPage';
import WorkList from '../../staff/components/WorkList';
import { readDraft, writeDraft, clearDraft } from '../../staff/hooks/useDraft';
import useCoachmark from '../../staff/hooks/useCoachmark';
import useConfirmed from '../../staff/hooks/useConfirmed';
import useUndo from '../../staff/hooks/useUndo';
import useListSearch from '../../staff/hooks/useListSearch';
import ListTools, { NoMatches } from '../../staff/components/ListTools';
import receivingAPI from '../../../services/receivingAPI';
import { newIdempotencyKey } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import SignaturePad from './SignaturePad';
import DeliveryNotePDF from './DeliveryNotePDF';

// Shared by both modes, right before the submit button. SignaturePad
// is the manager side's own component — canvasClassName /
// clearButtonClassName are what let it look native here instead of
// carrying the manager page's plain-link styling.
const SignatureField = ({ value, onChange }) => (
  <div className="stf-signature-field">
    <span className="stf-field-label">Driver&rsquo;s signature</span>
    <SignaturePad
      onChange={onChange}
      canvasClassName="stf-sign-canvas"
      clearButtonClassName="stf-signature-clear"
    />
    {!value ? (
      <p className="stf-field-hint">Ask the driver to sign above before you finish.</p>
    ) : null}
  </div>
);

const MODE_KEY = 'stf_receiving_view_mode';
const MODES = [
  { value: 'guided', label: 'Guided', hint: 'One line at a time' },
  { value: 'full',   label: 'Form',   hint: 'Every line at once' },
];
const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

const TOTAL_STEPS = 2;
const STEP_META = {
  which: { n: 1, label: 'Which delivery' },
  work:  { n: 2, label: 'Count and put away' },
  done:  { n: 2, label: 'Finished' },
};

// Where a line can go. Two options, because two is how many places the
// warehouse has (warehouse visit: cold room and dry store).
const LOCATIONS = [
  { value: 'dry_store', label: 'Dry store', meta: 'Shelves at the back' },
  { value: 'cold_room', label: 'Cold room', meta: 'For fresh food only' },
];

// Fresh lines need a use-by date and are picked date-first; dry goods
// are picked oldest-first and have no date to record (BR-06). Reads
// products.is_perishable; the name heuristic stays only as a fallback
// for a database without that column, so a missing column degrades
// this to a guess rather than breaking the screen.
const FRESH_HINTS = [
  'spinach', 'butternut', 'cabbage', 'carrot', 'tomato', 'onion',
  'apple', 'banana', 'potato', 'lettuce', 'fresh', 'milk',
];
const isFreshProduct = (item) =>
  typeof item.is_perishable === 'boolean'
    ? item.is_perishable
    : FRESH_HINTS.some((hint) => (item.product_name || '').toLowerCase().includes(hint));

// NOT toISOString().slice(0, 10). That formats in UTC and Cape Town is
// UTC+2, so between midnight and 02:00 SAST it returns YESTERDAY and
// the note is dated to the wrong day.
const todayISO = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const longDate = (value) =>
  new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });

// What an order search matches on. Module level so its identity is
// stable and useListSearch's memo is not defeated by a new function
// on every render.
//
// Both date forms are in the haystack deliberately: a worker reading
// a driver's note types "16 august", and a worker reading this screen
// types "2026-08-16". "order" is in there so that "order 86" works as
// typed, rather than only the bare number.
const orderText = (order) => [
  'order',
  order.id,
  order.supplier_name,
  order.status,
  order.expected_delivery_date,
  order.expected_delivery_date ? longDate(order.expected_delivery_date) : '',
].filter(Boolean).join(' ');

export default function ReceivingFlow({ onCrumbChange }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('which');
  const [mode, setMode] = useState(readStoredMode);
  const [focusId, setFocusId] = useState(null);
  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('receiving-view-toggle');

  const {
    ids: confirmedIds, toggle: toggleConfirmed,
    confirmAll: confirmAllLines, reset: resetConfirmed,
  } = useConfirmed();
  const acceptUndo = useUndo();

  const [suppliers, setSuppliers] = useState([]);
  // Narrower than `suppliers` — only those with an approved order.
  const [openSuppliers, setOpenSuppliers] = useState([]);
  const [deliveryDate, setDeliveryDate] = useState(todayISO);
  const [signature, setSignature] = useState(null);
  const [pdfDelivery, setPdfDelivery] = useState(null);
  // True when the submit went to the device queue instead of the
  // server. The done screen has to say so.
  const [queued, setQueued] = useState(false);

  // Every open order in the building, fetched once at mount.
  //
  // This replaced a per-supplier fetch that ran on every supplier tap.
  // Two things fall out of holding the whole list instead: the screen
  // can be searched by order number before anyone has chosen a
  // supplier, and picking an order can set the supplier rather than
  // the other way round.
  const [openOrders, setOpenOrders] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderId, setOrderId] = useState('');

  // The supplier picker is a filter over that list now, not the thing
  // that fetches it.
  const orders = supplierId
    ? openOrders.filter((o) => String(o.supplier_id) === String(supplierId))
    : openOrders;

  const orderSearch = useListSearch(openOrders, orderText);

  // A search by order number has to find the order whoever it came
  // from, so a live query overrides the supplier filter rather than
  // intersecting with it — otherwise typing the number off the note
  // while the wrong supplier is selected returns nothing, which reads
  // as "that order does not exist".
  const visibleOrders = orderSearch.searching ? orderSearch.filtered : orders;

  // Picking an order is also picking its supplier. The submit payload
  // carries both and the server rejects a mismatch between them
  // (delivery.repository.js checks purchase_orders.supplier_id against
  // the body's supplierId), so a worker who found the order by number
  // would otherwise submit with no supplier at all.
  const selectOrder = (value) => {
    setOrderId(value);
    const found = openOrders.find((o) => String(o.id) === String(value));
    if (found?.supplier_id) setSupplierId(found.supplier_id);
  };


  // One entry per order line: what was expected, what was counted,
  // where it went, and the use-by date if it is fresh.
  const [lines, setLines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);

  const step = STEP_META[phase];
  const draftKey = orderId ? `receiving-${orderId}` : null;

  // ── Suppliers, once ─────────────────────────────────────────
  // Both lists up front rather than lazily on first switch to Form:
  // mode is remembered per device and can already be 'full' on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, openList, orderList] = await Promise.all([
          receivingAPI.getSuppliers(),
          receivingAPI.getSuppliersWithOpenOrders(),
          // No supplier argument: every open order, all suppliers. One
          // call at mount instead of one per supplier tap.
          receivingAPI.getPurchaseOrders(),
        ]);
        if (!cancelled) {
          setSuppliers(list);
          setOpenSuppliers(openList);
          setOpenOrders(orderList);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);


  useEffect(() => { onCrumbChange?.(step.label); }, [step.label, onCrumbChange]);

  const supplierName = useMemo(
    () => suppliers.find((s) => String(s.id) === String(supplierId))?.name ?? 'this supplier',
    [suppliers, supplierId]
  );
  const shortLines = lines.filter((l) => l.counted !== '' && Number(l.counted) < l.expected);
  const receivedByName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'You';
  const hasLines = lines.length > 0;

  // Keep the count on the device. This refills the form after a sleep
  // or a reload; it never submits anything.
  useEffect(() => {
    if (phase !== 'work' || !draftKey || !hasLines) return;
    const counted = {};
    for (const line of lines) {
      counted[line.purchaseOrderItemId] = {
        counted: line.counted, location: line.location, useBy: line.useBy,
      };
    }
    writeDraft(draftKey, { counted, deliveryDate });
  }, [phase, draftKey, lines, deliveryDate, hasLines]);

  const handleModeChange = (next) => {
    setMode(next);
    setFocusId(next === 'guided' ? (lines[0]?.purchaseOrderItemId ?? null) : null);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* nothing we can do */ }
    dismissCoachmark();
  };

  // A first-run nudge, not a fixture.
  useEffect(() => {
    if (!showCoachmark || phase === 'done') return undefined;
    const timer = setTimeout(dismissCoachmark, 5000);
    return () => clearTimeout(timer);
  }, [showCoachmark, phase, dismissCoachmark]);

  // ── Step 1 to 2 ─────────────────────────────────────────────
  // Takes the order id explicitly rather than reading `orderId` off
  // closure state: Form mode calls this straight from the dropdown's
  // onChange, in the same tick as setOrderId(value), so a stale read
  // would fetch items for the previously selected order.
  const startCounting = async (poId) => {
    setSaving(true);
    setError(null);
    // A different order is a different job; nothing on it is ticked.
    resetConfirmed();
    try {
      const items = await receivingAPI.getPurchaseOrderItems(poId);
      const draft = readDraft(`receiving-${poId}`);

      const built = items.map((item) => {
        const fresh = isFreshProduct(item);
        const saved = draft?.counted?.[item.purchase_order_item_id];
        return {
          purchaseOrderItemId: item.purchase_order_item_id,
          productId:  item.product_id,
          name:       item.product_name,
          sku:        item.sku,
          expected:   Number(item.expected_quantity ?? 0),
          expectedKg: item.expected_weight_kg === null ? null : Number(item.expected_weight_kg),
          fresh,
          // Exception-first: start at what the order says, in both
          // modes. Guided used to start every line empty to force an
          // active count; in practice that meant retyping the number
          // already printed on the note, and the notice on a varied
          // line is what actually catches a miscount.
          counted:  saved?.counted ?? String(item.expected_quantity ?? ''),
          location: saved?.location ?? (fresh ? 'cold_room' : 'dry_store'),
          useBy:    saved?.useBy ?? '',
        };
      });

      setLines(built);
      if (draft?.deliveryDate) setDeliveryDate(draft.deliveryDate);
      setPhase('work');
      setFocusId(mode === 'guided' ? (built[0]?.purchaseOrderItemId ?? null) : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const patchLine = (itemId, patch) =>
    setLines((all) => all.map((line) => (
      line.purchaseOrderItemId === itemId ? { ...line, ...patch } : line
    )));

  // Fills what is blank AND ticks every line — see the same note in
  // PalletCheck.jsx. "Everything as ordered" is the confirmation.
  const acceptAllAsOrdered = () => {
    // See the same snapshot in PalletCheck.jsx.
    const previousLines = lines;
    const previousConfirmed = confirmedIds;
    const filled = lines.filter((l) => l.counted === '').length;

    setLines((all) => all.map((line) => (
      line.counted === '' ? { ...line, counted: String(line.expected) } : line
    )));
    confirmAllLines(lines.map((l) => l.purchaseOrderItemId));

    acceptUndo.propose(
      `Took ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} as ordered`
        + (filled > 0 ? `, filling ${filled}` : ''),
      () => { setLines(previousLines); confirmAllLines(previousConfirmed); },
    );
  };

  // What is stopping the commit, said out loud rather than left for
  // someone to work out from a greyed button.
  const missingUseBy = lines.filter((l) => l.fresh && !l.useBy);
  const unconfirmed = lines.length - lines.filter(
    (l) => confirmedIds.some((id) => String(id) === String(l.purchaseOrderItemId))
  ).length;

  const blockers = [];
  if (lines.some((l) => l.counted === '')) blockers.push('a count on every line');
  // The tick, required. "Everything as ordered" ticks the lot, so the
  // delivery that went exactly to plan is still one press.
  if (unconfirmed > 0) {
    blockers.push(`a tick on ${unconfirmed} more ${unconfirmed === 1 ? 'line' : 'lines'}`);
  }
  if (missingUseBy.length) {
    blockers.push(`a use-by date on ${missingUseBy.length} fresh ${missingUseBy.length === 1 ? 'line' : 'lines'}`);
  }
  if (!signature) blockers.push("the driver's signature");
  const blockedNote = blockers.length ? `Still needed: ${blockers.join(', ')}.` : null;

  // ── Commit ──────────────────────────────────────────────────
  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      // No driver NAME is recorded here — there is no drivers table and
      // this flow has no field for one. delivery_notes.driver_name is
      // the real column if that is ever added. The driver's signature
      // is captured and does go to delivery_notes.signature.
      const result = await receivingAPI.recordDelivery({
        supplierId,
        deliveryDate,
        purchaseOrderId: orderId,
        signatureData: signature,
        poCompleted: lines.every((l) => Number(l.counted) >= l.expected),
        idempotencyKey: attemptKey,
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
            // than typed out by staff — the service still requires a
            // reason for any line that varies, so this is it.
            discrepancyReason:
              variance === 0 ? '' : variance < 0 ? 'Short count at receiving' : 'Over count at receiving',
          };
        }),
      });
      setPhase('done');
      clearDraft(draftKey);

      // Queued, not recorded. There is no delivery note to show
      // because the server has not seen it yet — offering a PDF of a
      // thing that has not happened is worse than offering nothing.
      if (result?.queued) {
        setQueued(true);
        return;
      }

      setQueued(false);
      // recordDelivery's response already carries the full joined
      // record (supplier name, items, po_status).
      setPdfDelivery(result);
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
    setFocusId(null);
    setDeliveryDate(todayISO());
    setSignature(null);
    setPdfDelivery(null);
    // A new delivery is a new attempt. Keeping the old key would make
    // the server treat the next genuine delivery as a replay of the
    // last one and silently record nothing.
    setAttemptKey(newIdempotencyKey());
  };

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  return (
    <>
      {phase !== 'done' ? (
        <div className="stf-toggle-anchor">
          <ViewToggle options={MODES} value={mode} onChange={handleModeChange} />
          <Coachmark show={showCoachmark} onDismiss={dismissCoachmark}>
            Tap here to switch view
          </Coachmark>
        </div>
      ) : null}

      {phase !== 'done' ? <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} /> : null}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which delivery ─────────────────────────────── */}
      {phase === 'which' && (
        <StepScreen
          title="Which delivery is this?"
          sub="The driver has a note with a number on it."
          actions={
            <Actions>
              <Button disabled={!orderId || saving} onClick={() => startCounting(orderId)}>
                {saving ? 'Loading the list' : 'Start counting'}
              </Button>
            </Actions>
          }
        >
          {/* Guided keeps tap targets; Form uses the dropdown, which is
              the right control once the list runs to dozens. Both write
              the same supplierId. */}
          {mode === 'guided' ? (
            <ChoiceList
              legend="Who it came from"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onChange={(value) => { setSupplierId(value); setOrderId(''); }}
            />
          ) : (
            <SelectField
              id="stf-full-supplier"
              label="Who it came from"
              placeholder="Choose a supplier"
              options={openSuppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onChange={(value) => { setSupplierId(value); setOrderId(''); setLines([]); }}
              hint={openSuppliers.length === 0 ? 'No supplier has an approved order right now.' : undefined}
            />
          )}

          <div className="stf-field">
            <span className="stf-field-label">Received by</span>
            <div className="stf-static-value">{receivedByName}</div>
          </div>

          {/* The one search on this screen, and it is over the orders
              rather than the suppliers: a driver's note has a number
              on it, and the supplier list is four rows long. */}
          <ListTools
            id="stf-order-search"
            query={orderSearch.query}
            onQuery={orderSearch.setQuery}
            placeholder="Search by order number, supplier or date"
          />

          {visibleOrders.length > 0 ? (
            <ChoiceList
              legend="Which order"
              options={visibleOrders.map((o) => ({
                value: o.id,
                label: `Order ${o.id}`,
                // The supplier is in the meta now that this list can
                // span suppliers — "Order 86" alone is not enough to
                // pick the right one.
                meta: [
                  o.supplier_name,
                  o.expected_delivery_date
                    ? `Due ${longDate(o.expected_delivery_date)}`
                    : 'No due date given',
                ].filter(Boolean).join(' · '),
              }))}
              value={orderId}
              onChange={selectOrder}
              onActivate={startCounting}
            />
          ) : orderSearch.searching ? (
            <NoMatches
              query={orderSearch.query}
              onClear={() => orderSearch.setQuery('')}
              noun="orders"
            />
          ) : supplierId ? (
            <Notice>
              There is no open order for {supplierName} today. Ask your manager to check the order
              before you sign anything in.
            </Notice>
          ) : (
            <Notice>
              There are no open orders to receive against right now. Ask your manager to approve
              the order before you sign anything in.
            </Notice>
          )}
        </StepScreen>
      )}

      {/* ── 2 · Count and put away ─────────────────────────── */}
      {phase === 'work' && (
        <TaskPage
          title={`${supplierName}${orderId ? ` · Order ${orderId}` : ''}`}
          sub="Check what is on the floor against the note, then sign it in."
          note={blockedNote}
          actions={
            <Actions>
              <Button disabled={saving || blockers.length > 0} onClick={finish}>
                {saving ? 'Saving' : 'Finish this delivery'}
              </Button>
              <Button variant="secondary" onClick={restart}>Start over</Button>
            </Actions>
          }
          side={
            <div className="stf-summary">
              <p className="stf-summary-title">Sign it in</p>
              <DateField
                id="stf-full-date"
                label="Delivery date"
                value={deliveryDate}
                onChange={setDeliveryDate}
              />
              {shortLines.length > 0 ? (
                <Notice tone="warn">
                  {shortLines.length} {shortLines.length === 1 ? 'line is' : 'lines are'} short.
                  Saving still records the delivery, and your manager gets the difference to
                  follow up.
                </Notice>
              ) : null}
              <SignatureField value={signature} onChange={setSignature} />
            </div>
          }
        >
          {hasLines ? (
            <WorkList
              lines={lines.map((line) => ({
                id:       line.purchaseOrderItemId,
                title:    line.name,
                sku:      line.sku,
                expected: line.expected,
                value:    line.counted,
              }))}
              expectedLabel="ordered"
              guided={mode === 'guided'}
              focusId={mode === 'guided' ? focusId : null}
              onFocus={(id) => setFocusId(mode === 'guided' ? id : null)}
              onChange={(id, value) => patchLine(id, { counted: value })}
              onAcceptAll={acceptAllAsOrdered}
              acceptAllLabel="Everything as ordered"
              confirmed={confirmedIds}
              onConfirm={toggleConfirmed}
              undo={acceptUndo.offer
                ? { label: acceptUndo.offer.label, onUndo: acceptUndo.undo }
                : null}
              renderDetail={(row) => {
                const line = lines.find((l) => l.purchaseOrderItemId === row.id);
                if (!line) return null;
                const counted = line.counted;
                const short = counted !== '' && Number(counted) < line.expected;
                const over  = counted !== '' && Number(counted) > line.expected;
                return (
                  <>
                    <KeyValues
                      pairs={[
                        ['Code', line.sku],
                        ['Ordered', `${line.expected}${line.expectedKg ? ` (${line.expectedKg} kg)` : ''}`],
                        ['Type', line.fresh ? 'Fresh, needs a use-by date' : 'Dry'],
                      ]}
                    />

                    <ChoiceList
                      legend={`Where the ${line.name} is going`}
                      options={LOCATIONS}
                      value={line.location}
                      onChange={(value) => patchLine(line.purchaseOrderItemId, { location: value })}
                    />

                    {/* Fresh only. Dry goods get no date field rather
                        than a disabled one: an empty box staff are told
                        to skip is a box someone eventually fills in
                        wrongly. */}
                    {line.fresh ? (
                      <div className="stf-field">
                        <label
                          className="stf-field-label"
                          htmlFor={`stf-useby-${line.purchaseOrderItemId}`}
                        >
                          What is the date on the box?
                        </label>
                        <input
                          id={`stf-useby-${line.purchaseOrderItemId}`}
                          className="stf-input is-text"
                          type="date"
                          value={line.useBy}
                          onChange={(e) => patchLine(line.purchaseOrderItemId, { useBy: e.target.value })}
                        />
                        <p className="stf-field-hint">
                          Fresh food is packed by date, so this is what decides which box goes out
                          first.
                        </p>
                      </div>
                    ) : null}

                    {short ? (
                      <Notice tone="warn">
                        {line.expected - Number(counted)} fewer than the note says. Your manager
                        will be told, and this delivery stays open until it is sorted out.
                      </Notice>
                    ) : null}
                    {over ? (
                      <Notice tone="warn">
                        That is more than the note says. Count again, and if it is right your
                        manager will check it against the order.
                      </Notice>
                    ) : null}
                  </>
                );
              }}
            />
          ) : (
            <Notice>This order has no lines to receive.</Notice>
          )}
        </TaskPage>
      )}

      {/* ── Done ───────────────────────────────────────────── */}
      {phase === 'done' && (
        <StepScreen
          title={queued ? 'Saved on this phone' : 'Delivery received'}
          sub={queued
            ? 'There was no signal, so this is waiting on your phone. It sends itself as soon as you are back in range — the bar at the top says when it has gone. Do not count it again.'
            : 'The stock is on the system. You can put the next one in, or move on to packing.'}
          actions={
            <Actions>
              <Button onClick={restart}>Receive another delivery</Button>
            </Actions>
          }
        />
      )}

      {/* The note pops up the moment it can be fetched back in full;
          closing it just clears the state above — the delivery itself
          is already saved. */}
      {pdfDelivery ? (
        <DeliveryNotePDF delivery={pdfDelivery} onClose={() => setPdfDelivery(null)} />
      ) : null}
    </>
  );
}
