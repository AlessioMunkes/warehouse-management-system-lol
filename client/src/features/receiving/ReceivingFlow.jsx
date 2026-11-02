// ─────────────────────────────────────────────────────────────
// client/src/features/receiving/ReceivingFlow.jsx
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
// SCANNING
// The barcode bar above the list is a second way to count, beside
// typing. A scan finds the order line for that product, opens it, and
// counts up from zero by the barcode's units per scan: the first scan
// of a line replaces the pre-filled ordered figure, because someone
// scanning is counting what is actually there. A product that is not
// on the order says so and changes nothing.
//
// There is no "save and finish later": nothing in this app persists a
// delivery that has not been submitted. What IS kept is a local draft
// of the numbers, so a tablet that sleeps does not lose the count —
// see lib/useDraft.js. That refills the form; it never submits.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { takeUrlParam } from '../staff/resumeParam';
import {
  StepScreen,
  Actions,
  Button,
  SelectField,
  Notice,
  ViewToggle,
  Coachmark,
} from '../staff/StepPrimitives';
import TaskPage from '../staff/TaskPage';
import WorkList from '../staff/WorkList';
import { readDraft, writeDraft, clearDraft } from '../staff/useDraft';
import useCoachmark from '../staff/useCoachmark';
import useConfirmed from '../staff/useConfirmed';
import useUndo from '../staff/useUndo';
import useListSearch from '../staff/useListSearch';
import ListTools, { NoMatches } from '../staff/ListTools';
import receivingAPI from '../../services/receivingAPI';
import { newIdempotencyKey } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import DeliveryNotePDF from './DeliveryNotePDF';
import ProductScanBar from '../scan/ProductScanBar';
import SuccessDialog from '../staff/SuccessDialog';
import { OFFLINE_TITLE, offlineLine } from '../staff/successText';
import { SignInPanel, LineDetail } from './ReceivingParts';
import {
  MODE_KEY,
  MODES,
  readStoredMode,
  TOTAL_STEPS,
  STEP_META,
  isFreshProduct,
  orderText,
  orderCode,
} from './receivingText';

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

  // Raised but not approved yet: named on step 1, never selectable.
  const [waitingOrders, setWaitingOrders] = useState([]);
  // The clock the sign-in panel shows. The moment itself is taken when
  // the delivery is finished (deliveredAt in finish below).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(tick);
  }, []);
  const [signature, setSignature] = useState(null);
  const [pdfDelivery, setPdfDelivery] = useState(null);
  // The note for the delivery just recorded, offered on the confirmation.
  const [doneNote, setDoneNote] = useState(null);
  // True when the submit went to the device queue instead of the
  // server. The done screen has to say so.
  const [queued, setQueued] = useState(false);
  // What the server said was short, when the delivery left the order
  // part received. Shown as the follow-up flag on the done screen.
  const [followUp, setFollowUp] = useState(null);

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

  // The suppliers with an order to receive, read off the orders
  // themselves so the two lists can never disagree. Guided and Form
  // used to build this differently (every supplier in one, only those
  // with an open order in the other, from a separate cached request);
  // there is one list now and both views show it.
  const openSuppliers = useMemo(() => {
    const byId = new Map();
    for (const o of openOrders) {
      if (o.supplier_id && !byId.has(String(o.supplier_id))) {
        byId.set(String(o.supplier_id), { id: o.supplier_id, name: o.supplier_name });
      }
    }
    return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [openOrders]);

  const orderSearch = useListSearch(openOrders, orderText);
  const orderSearchProps = {
    id: 'stf-order-search',
    query: orderSearch.query,
    onQuery: orderSearch.setQuery,
    placeholder: 'Order number, supplier or date',
    buttonLabel: 'Search orders',
  };

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
  // Which order `lines` belongs to, set in the same update as the
  // lines themselves, never from orderId: in Form mode orderId changes
  // a tick before the new order's lines arrive, and keying the draft
  // off it would save the previous order's counts under the new name.
  const [linesKey, setLinesKey] = useState(null);

  // ── The orders ──────────────────────────────────────────────
  // No supplier argument: every open order, all suppliers. One call
  // instead of one per supplier tap.
  const loadOrders = useCallback(async () => {
    setOpenOrders(await receivingAPI.getPurchaseOrders());
    // The waiting list is a note, not the job. If it fails the screen
    // still works, it just cannot say why an order is missing.
    try {
      setWaitingOrders(await receivingAPI.getOrdersAwaitingApproval());
    } catch { /* leave what was there */ }
  }, []);

  // ── At mount ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadOrders();
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadOrders]);

  // An order approved while this screen sat open was never in the list
  // fetched at mount. Coming back to the tab asks again, so "my manager
  // just approved it" is true here without a reload.
  useEffect(() => {
    if (phase !== 'which') return undefined;
    const refresh = () => {
      if (document.visibilityState === 'visible') loadOrders().catch(() => {});
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [phase, loadOrders]);

  // step/total omitted on the done screen — no progress bar makes sense
  // once the task is finished (StepRail used to be hidden the same way,
  // gated on phase !== 'done').
  useEffect(() => {
    onCrumbChange?.({
      label: step.label,
      step: phase === 'done' ? null : step.n,
      total: phase === 'done' ? null : TOTAL_STEPS,
    });
  }, [step.label, step.n, phase, onCrumbChange]);

  const supplierName = useMemo(
    () => openSuppliers.find((s) => String(s.id) === String(supplierId))?.name ?? 'this supplier',
    [openSuppliers, supplierId]
  );
  const shortLines = lines.filter((l) => l.counted !== '' && Number(l.counted) < l.expected);
  // What came in, for the numbers on the confirmation.
  const receivedUnits = lines.reduce((sum, l) => sum + Number(l.counted || 0), 0);
  const receivedByName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'You';
  const hasLines = lines.length > 0;

  // Keep the count on the device. This refills the form after a sleep
  // or a reload; it never submits anything.
  useEffect(() => {
    if (phase !== 'work' || !linesKey || !hasLines) return;
    const counted = {};
    for (const line of lines) {
      counted[line.purchaseOrderItemId] = {
        counted: line.counted, location: line.location, useBy: line.useBy,
      };
    }
    writeDraft(linesKey, { counted });
  }, [phase, linesKey, lines, hasLines]);

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
    scanned.current.clear();
    try {
      const items = await receivingAPI.getPurchaseOrderItems(poId);
      // Numbers only. The order's own lines always come from the
      // server; a draft just fills in what was already counted.
      const draft = readDraft(`receiving-${poId}`);

      const built = items.map((item) => {
        const fresh = isFreshProduct(item);
        const saved = draft?.counted?.[item.purchase_order_item_id];
        return {
          purchaseOrderItemId: item.purchase_order_item_id,
          productId:  item.product_id,
          name:       item.product_name,
          sku:        item.sku,
          // What is still owed on the line. The same as what was ordered
          // until part of it has been received.
          expected:   Number(item.expected_quantity ?? 0),
          alreadyReceived: Number(item.received_to_date ?? 0),
          ordered:    Number(item.ordered_quantity ?? item.expected_quantity ?? 0),
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
      setLinesKey(`receiving-${poId}`);
      setPhase('work');
      // Form opens on the first fresh line still missing its date, since
      // that is the one thing its collapsed rows cannot show.
      const needsDate = built.find((l) => l.fresh && !l.useBy);
      setFocusId(mode === 'guided'
        ? (built[0]?.purchaseOrderItemId ?? null)
        : (needsDate?.purchaseOrderItemId ?? null));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ?resume=<orderId> (from "Carry on" on the dashboard): once the open
  // orders have loaded, open that order with its saved counts. If the
  // order has since been received or closed it is no longer open, so the
  // worker just starts from the order list as usual.
  const [resumeId] = useState(() => takeUrlParam('resume'));
  const resumed = useRef(false);
  useEffect(() => {
    if (!resumeId || loading || resumed.current) return;
    resumed.current = true;
    if (!openOrders.some((o) => String(o.id) === String(resumeId))) return;
    Promise.resolve().then(() => {
      selectOrder(resumeId);
      startCounting(resumeId);
    });
    // selectOrder/startCounting are plain functions recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId, loading, openOrders]);

  const patchLine = (itemId, patch) =>
    setLines((all) => all.map((line) => (
      line.purchaseOrderItemId === itemId ? { ...line, ...patch } : line
    )));

  // What each line has been scanned up to, by line id. A ref rather
  // than state so two scans answered in the same moment both count:
  // each adds to the last, not to the figure the screen last drew.
  const scanned = useRef(new Map());

  // A supplier's GS1 case label also carries its use-by date. It fills
  // a fresh line's date when that is still empty; a date someone typed
  // is theirs and is left alone.
  const countScan = (match, label) => {
    const line = lines.find((l) => String(l.productId) === String(match.productId));
    if (!line) return { tone: 'warn', text: `${match.productName} is not on this order.` };
    const id = line.purchaseOrderItemId;
    const next = Math.round(((scanned.current.get(id) ?? 0) + match.unitsPerScan) * 1000) / 1000;
    scanned.current.set(id, next);
    const takeDate = Boolean(label?.useBy && line.fresh && !line.useBy);
    patchLine(id, takeDate ? { counted: String(next), useBy: label.useBy } : { counted: String(next) });
    setFocusId(id);
    return `${line.name}: ${next} counted of ${line.expected}.${takeDate ? ` Use-by ${label.useBy} from the label.` : ''}`;
  };

  // A typed correction on a scanned line is where the next scan adds from.
  const typeCount = (id, value) => {
    if (scanned.current.has(id)) scanned.current.set(id, Number(value) || 0);
    patchLine(id, { counted: value });
  };

  // The order's own products, for linking a barcode nobody knows yet.
  const scanChoices = useMemo(() => {
    const byProduct = new Map();
    for (const l of lines) {
      if (!byProduct.has(l.productId)) byProduct.set(l.productId, { productId: l.productId, label: l.name, meta: l.sku });
    }
    return [...byProduct.values()];
  }, [lines]);

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
  // Named when there are few enough to name: the date lives in the
  // line's own panel, so "which line" is the whole question.
  if (missingUseBy.length) {
    blockers.push(missingUseBy.length <= 2
      ? `a use-by date on ${missingUseBy.map((l) => l.name).join(' and ')}`
      : `a use-by date on ${missingUseBy.length} fresh lines`);
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
        // The moment it was signed in, on this phone's clock. Queued with
        // no signal, it still carries this moment, not when it is sent.
        deliveredAt: new Date().toISOString(),
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
            expiryDate: line.useBy || null,
            // Short and over counts are recorded structurally rather
            // than typed out by staff — the service still requires a
            // reason for any line that varies, so this is it.
            discrepancyReason:
              variance === 0 ? '' : variance < 0 ? 'Short count at receiving' : 'Over count at receiving',
          };
        }),
      });
      // Sent, or safely in the outbox — either way the draft's job is done.
      clearDraft(linesKey ?? draftKey);
      setPhase('done');

      // Queued, not recorded. There is no delivery note to show
      // because the server has not seen it yet — offering a PDF of a
      // thing that has not happened is worse than offering nothing.
      if (result?.queued) {
        setQueued(true);
        return;
      }
      setFollowUp(result?.follow_up?.required ? (result.follow_up.reason || 'Delivered short.') : null);

      setQueued(false);
      // recordDelivery's response already carries the full joined
      // record (supplier name, items, po_status). Kept for the "View
      // delivery note" button on the confirmation, not opened over it.
      setDoneNote(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    scanned.current.clear();
    setPhase('which');
    setLines([]);
    setOrderId('');
    setFocusId(null);
    setSignature(null);
    setPdfDelivery(null);
    setDoneNote(null);
    setFollowUp(null);
    // A new delivery is a new attempt. Keeping the old key would make
    // the server treat the next genuine delivery as a replay of the
    // last one and silently record nothing.
    setAttemptKey(newIdempotencyKey());
  };

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  // Built once and handed to whichever card is showing (StepScreen for
  // 'which', TaskPage for 'work') as its own toggle prop — "the mode
  // toggle is a property of the form, not of the app, so it moves onto
  // the card's own top edge where it has an obvious owner." Not
  // rendered at all on the done screen, same as before.
  const toggleControl = phase !== 'done' ? (
    <>
      <ViewToggle options={MODES} value={mode} onChange={handleModeChange} />
      <Coachmark show={showCoachmark} onDismiss={dismissCoachmark}>
        Tap here to switch view
      </Coachmark>
    </>
  ) : null;

  return (
    <>
      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which delivery ─────────────────────────────── */}
      {phase === 'which' && (
        <StepScreen
          title="Which delivery is this?"
          sub="Find the order on the driver's note."
          toggle={toggleControl}
          actions={
            <Actions>
              <Button disabled={!orderId || saving} onClick={() => startCounting(orderId)}>
                {saving ? 'Loading the list' : 'Start counting'}
              </Button>
            </Actions>
          }
        >
          {/* ONE step for both views. Guided and Form differ in how the
              lines are counted on the next screen, not in which
              delivery can be chosen: the same suppliers, the same
              orders and the same search. */}
          <SelectField
            id="stf-supplier"
            label="Who it came from"
            placeholder="Any supplier"
            options={openSuppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={supplierId}
            onChange={(value) => { setSupplierId(value); setOrderId(''); setLines([]); }}
            hint={openSuppliers.length === 0 ? 'No supplier has an approved order right now.' : undefined}
          />

          <div className="stf-field">
            <span className="stf-field-label">Received by</span>
            <div className="stf-static-value">{receivedByName}</div>
          </div>

          {/* Every open order, narrowed to the supplier when one is
              chosen. A search looks across all of them, because a
              driver's note has an order number on it and nothing else,
              and picking an order sets its supplier. */}
          {visibleOrders.length > 0 ? (
            <SelectField
              id="stf-order"
              label="Which order"
              placeholder="Choose an order"
              options={visibleOrders.map((o) => ({
                value: o.id,
                label: [orderCode(o), o.supplier_name].filter(Boolean).join(' · '),
              }))}
              value={orderId}
              onChange={selectOrder}
              // The one search on this screen, and it is over the orders:
              // a driver's note has a number on it. Behind an icon by
              // the label, so it is not a row of the form until wanted.
              search={orderSearchProps}
            />
          ) : orderSearch.searching ? (
            <>
              <ListTools {...orderSearchProps} />
              <NoMatches
              query={orderSearch.query}
              onClear={() => orderSearch.setQuery('')}
              noun="orders"
            />
            </>
          ) : (
            <Notice>
              There are no open orders to receive against right now. Ask your manager to approve
              the order before you sign anything in.
            </Notice>
          )}

          {/* An order nobody has approved is not in the lists above.
              Saying so here is what stops "it is not showing up". */}
          {waitingOrders.length > 0 ? (
            <Notice>
              Waiting for a manager to approve:{' '}
              {waitingOrders.slice(0, 5)
                .map((o) => [orderCode(o), o.supplier_name].filter(Boolean).join(' · '))
                .join(', ')}
              {waitingOrders.length > 5 ? ` and ${waitingOrders.length - 5} more` : ''}.
              {' '}They show here once approved.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      {/* ── 2 · Count and put away ─────────────────────────── */}
      {/* The work stays on screen behind the confirmation. */}
      {(phase === 'work' || phase === 'done') && (
        <TaskPage
          title={`${supplierName}${orderId ? ` · ${orderCode(openOrders.find((o) => String(o.id) === String(orderId)) ?? { id: orderId })}` : ''}`}
          sub="Count each line, then sign it in."
          toggle={toggleControl}
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
            <SignInPanel
              now={now}
              orderId={orderId}
              shortCount={shortLines.length}
              signature={signature}
              onSignature={setSignature}
            />
          }
        >
          {hasLines && phase === 'work' ? (
            <ProductScanBar
              onMatch={countScan} linkChoices={scanChoices} disabled={saving}
              screen="receiving" referenceId={orderId ? Number(orderId) : null}
            />
          ) : null}
          {hasLines ? (
            <WorkList
              lines={lines.map((line) => ({
                id:       line.purchaseOrderItemId,
                title:    line.name,
                sku:      line.sku,
                expected: line.expected,
                value:    line.counted,
              }))}
              expectedLabel={lines.some((l) => l.alreadyReceived > 0) ? 'still to come' : 'ordered'}
              guided={mode === 'guided'}
              // Form too: where it goes and the use-by date are in the
              // panel under the line, and a row that never opened had
              // no way to take a date the finish button asks for.
              focusId={focusId}
              onFocus={setFocusId}
              // Form shows every line's storage place and use-by date
              // without a tap: "every line at once" has to mean all of
              // each line, or the date the finish button asks for has
              // nowhere visible to go.
              expandAll={mode !== 'guided'}
              onChange={typeCount}
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
                return <LineDetail line={line} onPatch={patchLine} />;
              }}
            />
          ) : (
            <Notice>This order has no lines to receive.</Notice>
          )}
        </TaskPage>
      )}

      {/* ── Done: the one confirmation every flow uses ─────── */}
      <SuccessDialog
        open={phase === 'done'}
        tone={queued ? 'offline' : 'success'}
        title={queued ? OFFLINE_TITLE : 'Delivery received'}
        picture="ti-truck-delivery"
        facts={[
          { value: lines.length, label: lines.length === 1 ? 'line counted' : 'lines counted' },
          { value: receivedUnits, label: 'units in' },
          shortLines.length > 0
            ? { value: shortLines.length, label: shortLines.length === 1 ? 'line short' : 'lines short', warn: true }
            : null,
        ]}
        onClose={restart}
        action={doneNote && !queued ? { label: 'View delivery note', onClick: () => setPdfDelivery(doneNote) } : null}
      >
        <p className="stf-step-sub">
          {queued ? offlineLine('Do not count it again.') : 'Stock updated.'}
        </p>
        {/* The order is part received, and the manager sees the same
            label on it. The rest comes in on this same order. */}
        {followUp && !queued ? (
          <Notice tone="warn">
            <p style={{ margin: 0, fontWeight: 600 }}>Balance outstanding</p>
            <p style={{ margin: '4px 0 0' }}>{followUp}</p>
            <p style={{ margin: '4px 0 0' }}>The order stays open. When the rest arrives, receive it against the same order. Your manager has been told.</p>
          </Notice>
        ) : null}
      </SuccessDialog>

      {/* Opened from the confirmation. Closing it goes back there; the
          delivery itself is already saved. */}
      {pdfDelivery ? (
        <DeliveryNotePDF delivery={pdfDelivery} onClose={() => setPdfDelivery(null)} />
      ) : null}
    </>
  );
}
