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
//
// A second shape exists alongside the four screens above: `mode`
// ('guided' | 'full', a worker's own choice, remembered per device)
// picks between them without forking any of the data fetching,
// validation or commit logic below — both shapes read and write the
// exact same `lines` state, so switching mid-task carries whatever's
// already been counted across rather than losing it. Guided is the
// default every worker starts from. The toggle sits at the top right
// (matching the booking.com-style reference it was built against) and
// is visible from the first screen on, since Form mode's shape is
// already different from Guided's before any order is even picked.
//
// Form mode is ONE scrolling dialog, not a second sequence of pages —
// supplier, who's receiving it, the order, the date, every line and
// the signature, top to bottom, centred over a dimmed/blurred backdrop
// (client/src/components/ui/dialog.jsx, the same Dialog LoginPage.jsx
// already uses elsewhere). `formOpen` controls only whether that
// dialog is visible; it is independent of `mode`, so dismissing it
// (backdrop tap, Escape, the X) never silently discards what was
// already picked — reopening resumes instead of restarting. What sits
// on the page behind it is just enough to show something is there to
// tap ("Start a new delivery" / "Continue this delivery").
//
// Quantities in Form mode start pre-filled with the expected amount
// rather than empty: most deliveries match the order exactly, and
// retyping every line for the ones that do is work nobody asked for.
// Guided's per-item counting screen still starts empty — an active
// count is the point of that mode. Switching TO Form mode backfills
// any line still uncounted; switching a line manually counted first
// is left alone either way (see handleModeChange, startCounting).
//
// A signature is captured here now, at receiving, right before the
// final submit in both modes — not at dispatch. That's a deliberate
// change from this flow's first version, which recorded acceptance
// with a fixed string because the driver signed elsewhere. The driver
// now signs the tablet at the bay, and the delivery note carries it.
//
// finish() closes the dialog (setFormOpen(false)) the moment a submit
// succeeds, in the same breath as setPhase('done') — closing the note
// PDF that pops up afterward must not drop a worker back into what
// looks like the same unsent form still sitting behind it.
//
// There is no "save and finish later" in Form mode. That button's on
// an early mockup, but nothing in this app persists a delivery that
// hasn't been submitted, so promising to save one would be a lie the
// first time someone's tab closed. "Check and finish" is the one
// action that actually does something.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, NumberField, SelectField, DateField, QuantityField,
  ChoiceList, Notice, KeyValues, ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import useCoachmark from '../../staff/hooks/useCoachmark';
import receivingAPI from '../../../services/receivingAPI';
import { newIdempotencyKey } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import SignaturePad from './SignaturePad';
import DeliveryNotePDF from './DeliveryNotePDF';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';

// Shared by both modes' final screen, right before the submit button.
// SignaturePad is the manager side's own component — canvasClassName/
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
  { value: 'guided', label: 'Guided', hint: 'Step by step' },
  { value: 'full',   label: 'Form',   hint: 'Everything at once' },
];
const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

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

// NOT toISOString().slice(0, 10). That formats in UTC and Cape Town
// is UTC+2, so between midnight and 02:00 SAST it returns YESTERDAY
// and the note is dated to the wrong day. Local components give the
// date the person at the bay would write down.
const todayISO = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
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
  const { user } = useAuth();
  const [phase, setPhase] = useState('which');
  const [lineIndex, setLineIndex] = useState(0);
  const [mode, setMode] = useState(readStoredMode);
  // Form mode is one scrolling dialog rather than its own page — this
  // is purely "is it open right now", independent of `mode`, so
  // dismissing it (backdrop tap, Escape, the X) doesn't also flip the
  // toggle back to Guided. Whatever was already picked (supplier,
  // order, counted lines) is left alone when it closes; reopening
  // resumes rather than restarts.
  const [formOpen, setFormOpen] = useState(false);
  // Resolved once, after mount, rather than read inline during render —
  // .stf-shell is a real DOM ancestor by the time this component's own
  // effects run, so there's no reason to re-query it on every render.
  // Passed to the dialog as its portal target: see the Dialog block
  // below for why that matters.
  const [shellNode, setShellNode] = useState(null);
  useEffect(() => {
    const resolve = () => setShellNode(document.querySelector('.stf-shell'));
    resolve();
  }, []);
  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('receiving-view-toggle');

  const [suppliers, setSuppliers] = useState([]);
  // Narrower than `suppliers` — only those with an approved order.
  // Full form's supplier dropdown uses this one; Guided's ChoiceList
  // keeps using the full list, unchanged.
  const [openSuppliers, setOpenSuppliers] = useState([]);
  const [deliveryDate, setDeliveryDate] = useState(todayISO);
  const [signature, setSignature] = useState(null);
  // Which lines' pre-filled quantity a worker has chosen to edit, in
  // Full form. Purely a display concern — not part of `lines`, and
  // not sent to the server.
  const [editingQty, setEditingQty] = useState({});
  // The delivery just recorded, fetched in full (items, signature,
  // supplier name) so DeliveryNotePDF has what it needs. null hides
  // the pop-up; set once by finish() on success.
  const [pdfDelivery, setPdfDelivery] = useState(null);

  // What the last fetch returned, keyed implicitly by supplierId. The
  // list only means anything while a supplier is selected, so the
  // "no supplier, no orders" case is derived below rather than being
  // written back into state from the effect — clearing state
  // synchronously inside an effect body triggers a cascading render
  // (react-hooks/set-state-in-effect).
  const [fetchedOrders, setFetchedOrders] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderId, setOrderId] = useState('');

  const orders = supplierId ? fetchedOrders : [];

  // One entry per order line: what was expected, what was counted,
  // where it went, and the use-by date if it is fresh.
  const [lines, setLines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ONE key for this pass through the flow, regenerated only by
  // restart(). A tablet at the loading bay loses signal often, and
  // finish() below is retried by the person tapping again — which
  // used to create a second delivery note and put the stock up twice.
  // Reusing the key makes the server recognise the retry and hand
  // back the original note. A key generated inside finish() would be
  // new on every tap and would protect nothing.
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);

  const step = STEP_META[phase];

  // ── Suppliers, once ─────────────────────────────────────────
  // Both lists are fetched together up front rather than lazily on
  // first switch to Full form — mode is remembered per device and
  // can already be 'full' on load, so the filtered list needs to be
  // ready before the first screen renders, not fetched reactively
  // after the fact.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, openList] = await Promise.all([
          receivingAPI.getSuppliers(),
          receivingAPI.getSuppliersWithOpenOrders(),
        ]);
        if (!cancelled) { setSuppliers(list); setOpenSuppliers(openList); }
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
    if (!supplierId) return undefined;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const list = await receivingAPI.getPurchaseOrders(supplierId);
        if (!cancelled) setFetchedOrders(list);
      } catch (err) {
        // A supplier with no approved order is a normal state that
        // has an explanation, not a failure. The empty case below
        // says what to do about it.
        if (!cancelled) { setFetchedOrders([]); setError(err.message); }
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
  const receivedByName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'You';
  const hasLines = lines.length > 0;
  const showToggle = phase !== 'done';

  const handleModeChange = (next) => {
    setMode(next);
    if (next === 'full') {
      // Any line still at its untouched default picks up the expected
      // quantity the moment Full form becomes the active shape — a
      // line someone already counted in Guided is never touched here.
      setLines((all) => all.map((line) => (
        line.counted === '' ? { ...line, counted: String(line.expected) } : line
      )));
      // Tapping "Form" opens the dialog directly rather than landing
      // on a page that then needs its own "open the form" tap — the
      // tap on the toggle already said what the worker wants to do.
      setFormOpen(true);
    }
    try { localStorage.setItem(MODE_KEY, next); } catch { /* nothing we can do */ }
    dismissCoachmark();
  };

  // The hint disappears the moment someone uses the toggle (above) or
  // after a few seconds regardless — a first-run nudge, not a fixture.
  useEffect(() => {
    if (!showCoachmark || !showToggle) return undefined;
    const timer = setTimeout(dismissCoachmark, 5000);
    return () => clearTimeout(timer);
  }, [showCoachmark, showToggle, dismissCoachmark]);

  // ── Step 1 to 2 ─────────────────────────────────────────────
  // Takes the order id explicitly rather than reading `orderId` off
  // closure state: Form mode calls this straight from the order
  // dropdown's onChange, in the same tick as setOrderId(value) — the
  // state update hasn't landed yet at that point, so a stale read
  // would fetch items for whatever order was previously selected.
  const startCounting = async (poId) => {
    setSaving(true);
    setError(null);
    try {
      const items = await receivingAPI.getPurchaseOrderItems(poId);
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
          // Full form pre-fills; Guided starts every line empty
          // because the point of that mode is an active count.
          counted:    mode === 'full' ? String(item.expected_quantity ?? '') : '',
          location:   fresh ? 'cold_room' : 'dry_store',
          useBy:      '',
        };
      }));
      setLineIndex(0);
      // Guided moves into its per-item sequence; Form mode has no
      // sequence to move into — the lines just appear further down
      // the same dialog, and `phase` staying at 'which' keeps the
      // crumb accurate for as long as that dialog is open.
      if (mode !== 'full') setPhase('count');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Guided only ever edits "the current line"; Full form edits
  // whichever line the worker's finger is on, all of them visible at
  // once — so patching by an explicit index is the one both need.
  const patchLineAt = (index, patch) =>
    setLines((all) => all.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const patchLine = (patch) => patchLineAt(lineIndex, patch);

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
      // No driver NAME is recorded here — there is no drivers table
      // and this flow has no field for one. delivery_notes.driver_name
      // is the real column to write to if that's ever added. The
      // driver's actual signature is captured above and does go to
      // delivery_notes.signature via signatureData below.
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
            // than typed out by staff (that is the whole point of this
            // flow) — the service still requires a reason string for
            // any line that varies from the order, so this is it.
            discrepancyReason:
              variance === 0 ? '' : variance < 0 ? 'Short count at receiving' : 'Over count at receiving',
          };
        }),
      });
      setPhase('done');
      // Closing the dialog here is what actually ends Form mode's
      // pass through this flow. Without it, `lines` stays populated
      // (nothing here clears it — restart() does that, on its own
      // button) and the mega-form would still be mounted behind the
      // PDF pop-up, so closing the PDF dropped a worker right back
      // into what looked like the same unsent form.
      setFormOpen(false);
      // recordDelivery's response already carries the full joined
      // record (supplier name, items, po_status) — the server fetches
      // that itself now instead of handing back the bare row and
      // making this screen ask for it again over a second round trip.
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
    setLineIndex(0);
    setDeliveryDate(todayISO());
    setSignature(null);
    setEditingQty({});
    setPdfDelivery(null);
    setFormOpen(false);
    // A new delivery is a new attempt. Keeping the old key would make
    // the server treat the next genuine delivery as a replay of the
    // last one and silently record nothing.
    setAttemptKey(newIdempotencyKey());
  };

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  return (
    <>
      {showToggle ? (
        <div className="stf-toggle-anchor">
          <ViewToggle options={MODES} value={mode} onChange={handleModeChange} />
          <Coachmark show={showCoachmark} onDismiss={dismissCoachmark}>
            Tap here to switch view
          </Coachmark>
        </div>
      ) : null}

      {/* The rail counts steps through a sequence — Form mode has no
          sequence, it is one scrolling dialog, so there is nothing
          for it to show. */}
      {mode === 'full' ? null : <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} />}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which delivery (Guided) ────────────────────── */}
      {phase === 'which' && mode !== 'full' && (
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

      {/* ── Form mode: an entry screen, plus one scrolling dialog ──
          Everything — supplier, order, date, every line, the
          signature — lives in the dialog below, in that order, as one
          form you scroll down to fill. This screen is just what's
          visible behind it: enough to show something is there to tap,
          without pretending Form mode has its own sequence of pages. */}
      {phase !== 'done' && mode === 'full' && (
        <StepScreen
          title="Fill in one form"
          actions={
            <Actions>
              <Button onClick={() => setFormOpen(true)}>
                {hasLines ? 'Continue this delivery' : 'Start a new delivery'}
              </Button>
            </Actions>
          }
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          container={shellNode ?? undefined}
          className="max-w-[560px] w-[calc(100%-2rem)] max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden"
        >
          <DialogHeader className="stf-dialog-head">
            <DialogTitle>
              {supplierId ? `${supplierName}${orderId ? ` · Order ${orderId}` : ''}` : 'Which delivery is this?'}
            </DialogTitle>
            <DialogDescription>
              Pick the supplier and order, then fill in what is on the floor.
            </DialogDescription>
          </DialogHeader>

          <div className="stf-dialog-scroll">
            <div className="stf-dialog-fields">
              <SelectField
                id="stf-full-supplier"
                label="Who it came from"
                placeholder="Choose a supplier"
                options={openSuppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={supplierId}
                onChange={(value) => { setSupplierId(value); setOrderId(''); setLines([]); }}
                hint={openSuppliers.length === 0 ? 'No supplier has an approved order right now.' : undefined}
              />

              <div className="stf-field">
                <span className="stf-field-label">Received by</span>
                <div className="stf-static-value">{receivedByName}</div>
              </div>

              {supplierId ? (
                <SelectField
                  id="stf-full-order"
                  label="Which order"
                  placeholder="Choose an order"
                  options={orders.map((o) => ({
                    value: o.id,
                    label: o.expected_delivery_date
                      ? `Order ${o.id} · Due ${longDate(o.expected_delivery_date)}`
                      : `Order ${o.id}`,
                  }))}
                  value={orderId}
                  onChange={(value) => { setOrderId(value); startCounting(value); }}
                  disabled={orders.length === 0}
                  hint={orders.length === 0 ? `There is no open order for ${supplierName} today.` : undefined}
                />
              ) : null}

              {orderId ? (
                <DateField
                  id="stf-full-date"
                  label="Delivery date"
                  value={deliveryDate}
                  onChange={setDeliveryDate}
                />
              ) : null}

              {saving && !hasLines ? (
                <p className="stf-field-hint">Loading the order&rsquo;s items…</p>
              ) : null}

              {hasLines ? (
                <>
                  <div className="stf-formrows">
                    {lines.map((line, i) => {
                      const counted = line.counted;
                      const variance = counted === '' ? 0 : Number(counted) - line.expected;
                      const short = counted !== '' && variance < 0;
                      const over = counted !== '' && variance > 0;
                      return (
                        <div
                          key={line.purchaseOrderItemId}
                          className={`stf-formrow${short || over ? ' is-warn' : ''}`}
                        >
                          <div className="stf-formrow-head">
                            <span className="stf-formrow-title">{line.name}</span>
                            <span className="stf-formrow-meta">
                              Code: {line.sku} · Expected: {line.expected}
                              {line.expectedKg ? ` (${line.expectedKg} kg)` : ''}
                            </span>
                          </div>

                          <QuantityField
                            id={`stf-counted-${line.purchaseOrderItemId}`}
                            label="How many are here?"
                            value={line.counted}
                            editing={!!editingQty[line.purchaseOrderItemId]}
                            flagged={counted !== '' && Number(counted) !== line.expected}
                            onEdit={() => setEditingQty((all) => ({ ...all, [line.purchaseOrderItemId]: true }))}
                            onChange={(value) => patchLineAt(i, { counted: value })}
                          />

                          <ChoiceList
                            legend={`Where the ${line.name} is going`}
                            options={LOCATIONS}
                            value={line.location}
                            onChange={(value) => patchLineAt(i, { location: value })}
                          />

                          {line.fresh ? (
                            <div className="stf-field">
                              <label className="stf-field-label" htmlFor={`stf-useby-${line.purchaseOrderItemId}`}>
                                What is the date on the box?
                              </label>
                              <input
                                id={`stf-useby-${line.purchaseOrderItemId}`}
                                className="stf-input is-text"
                                type="date"
                                value={line.useBy}
                                onChange={(e) => patchLineAt(i, { useBy: e.target.value })}
                              />
                            </div>
                          ) : null}

                          {short ? (
                            <Notice tone="warn">
                              {line.expected - Number(counted)} fewer than expected. Saving still
                              tells your manager and keeps this delivery open.
                            </Notice>
                          ) : null}
                          {over ? (
                            <Notice tone="warn">
                              That is more than expected — count again, and if it is right your
                              manager will check it against the order.
                            </Notice>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {shortLines.length > 0 ? (
                    <Notice tone="warn">
                      {shortLines.length} {shortLines.length === 1 ? 'line is' : 'lines are'}
                      short. Saving still records the delivery, and your manager gets the
                      difference to follow up.
                    </Notice>
                  ) : null}

                  <SignatureField value={signature} onChange={setSignature} />
                </>
              ) : null}
            </div>
          </div>

          {hasLines ? (
            <div className="stf-dialog-footer">
              <Actions>
                <Button disabled={saving || !signature} onClick={finish}>
                  {saving ? 'Saving' : 'Check and finish'}
                </Button>
              </Actions>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── 2 · Count one item ─────────────────────────────── */}
      {mode !== 'full' && phase === 'count' && currentLine && (
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
      {mode !== 'full' && phase === 'place' && currentLine && (
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
      {mode !== 'full' && phase === 'check' && (
        <StepScreen
          title="Does this look right?"
          sub="Tap any line to change it."
          actions={
            <Actions>
              <Button disabled={saving || !signature} onClick={finish}>
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

          <SignatureField value={signature} onChange={setSignature} />
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

      {/* The note pops up the moment it can be fetched back in full;
          closing it just clears the state above — the delivery itself
          is already saved, and stays reachable from the deliveries
          dashboard either way. */}
      {pdfDelivery ? (
        <DeliveryNotePDF delivery={pdfDelivery} onClose={() => setPdfDelivery(null)} />
      ) : null}
    </>
  );
}