// ─────────────────────────────────────────────────────────────
// client/src/features/decanting/DecantingFlow.jsx
//
// WHAT CHANGED, AND WHY
// This was the last of the three staff flows still built as "four
// guided screens, OR a scrolling pop-up dialog". Receiving and
// dispatch were converted in script 20; decanting was missed, which
// is why Form mode here was still a dialog that opened over the page
// and had to be scrolled inside a 560px box on a 1300px screen.
//
// It is now the same shape as the other two:
//
//   which  pick the sack
//   work   one page: weigh it, read the bag plan, count back what you
//          actually got, record what was spilled
//   done
//
// GUIDED AND FORM ARE ONE CODE PATH
// The old file rendered the fields twice — once as four StepScreens
// and once inside the dialog — with the same handlers wired to both.
// Two trees that must be kept in step is how a field gets fixed in
// one view and not the other. Here there is one set of panels:
//
//   Guided  opens one panel at a time and shows the other two as a
//           summary line, so there is always a next thing to do and
//           always a way to see what you already did.
//   Form    opens all three at once.
//
// Nothing is hidden in either mode and nothing is duplicated. That is
// also what makes the two modes visibly different, which the previous
// version was not — switching the toggle on dispatch changed nothing
// you could see.
//
// WHAT IS UNCHANGED ON PURPOSE
//   - The split still comes from POST /api/decanting/calculate.
//     decanting.service.js solves it with a closest-total search
//     capped at the weighed bulk; re-deriving that here would put two
//     answers in the building.
//   - The 0.5% margin is still stated in plain words (ACC-09) and the
//     bulk-limited case is still a supply problem stated as one.
//   - The save payload is byte-for-byte what it was: weekOf,
//     selectedSizes, and one item of { productId, requiredKg,
//     actualBulkKg, wastageKg }.
//   - Saving is still final. decanting.service.js has no update path,
//     by design: wastage cannot be un-recorded.
//   - The sheet PDF still pops up on success, fed by what
//     recordDecanting already returns.
//
// ONE THING WORTH KNOWING
// The count-back numbers are NOT sent to the server, and were not in
// the previous version either — POST /api/decanting only takes the
// weighed bulk and the wastage, and derives the bags from the plan.
// So "what you actually got" is, today, a check the worker does for
// themselves rather than a recorded fact. Left as it was rather than
// changed quietly here: making it a recorded fact is a server change
// (a produced/actual column on the decanting line) and a decision
// about what a variance between planned and produced bags should
// mean, which is not this script's call to make.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  StepScreen, Actions, Button, NumberField, SelectField, Notice,
  KeyValues, ViewToggle, Coachmark,
} from '../staff/StepPrimitives';
import useCoachmark from '../staff/useCoachmark';
import useConfirmed from '../staff/useConfirmed';
import useListSearch from '../staff/useListSearch';
import TaskPage from '../staff/TaskPage';
import WorkList from '../staff/WorkList';
import ListTools, { NoMatches } from '../staff/ListTools';
import { calculateDecantingPlan, recordDecanting } from '../../services/decantingAPI';
// The same list the planner and ProductLineRow offer. Importing it
// rather than restating it is the point: a fourth bag size added here
// appears in both, or in neither.
import { STANDARD_SIZES, sizesToKg, sizeLabelToKg } from './BagSizes';
import BagSizeToggle from './BagSizeToggle';
import DecantingSheetPDF from './DecantingSheetPDF';
import { openBagLabelPdf } from './bagLabelPdf';
import { linkBarcode } from '../../services/productBarcodeAPI';
import { ownBagCode } from '../scan/productCode';
import SuccessDialog from '../staff/SuccessDialog';
import { OFFLINE_TITLE, offlineLine } from '../staff/successText';
import { Panel, PlanResult } from './DecantingParts';
import {
  mondayOfThisWeek, longDate, parseKgInput, planLabels, stockMessage,
} from './decantingText';

// Name and SKU: two sacks of maize meal are told apart by the code on
// the bag as often as by the name on it. Module level for a stable
// identity — see the same note in ReceivingFlow.jsx.
const productText = (product) => [product?.name, product?.sku].filter(Boolean).join(' ');

// How many of the product's own unit one bag is: sizes are in kg, and
// a product counted in g or ml takes a thousand of them per kg.
const unitsPerBag = (sizeKg, unit) => (unit === 'g' || unit === 'ml' ? sizeKg * 1000 : sizeKg);

// Today in Cape Town, as 'YYYY-MM-DD'.
const todaySast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());

const MODE_KEY = 'stf_decanting_view_mode';
const MODES = [
  { value: 'guided', label: 'Guided', hint: 'One part at a time' },
  { value: 'full',   label: 'Form',   hint: 'Everything at once' },
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
  which: { n: 1, label: 'What you are working with' },
  work:  { n: 2, label: 'Weigh, bag and count back' },
  done:  { n: 2, label: 'Saved' },
};

const ALL_SUPPORTED_SIZES_KG = sizesToKg(STANDARD_SIZES);

// products comes from the page above, which fetches it once for both
// this flow and the week planner.
export default function DecantingFlow({ products = [], onCrumbChange }) {
  const [phase, setPhase] = useState('which');

  const [productId, setProductId] = useState('');
  const [weighedKg, setWeighedKg] = useState('');

  // requiredKg is what the ECDs need this week. It belongs to the
  // manager's confirmed demand; until that endpoint exists the staff
  // screen asks for it once rather than pretending to know it.
  // See HANDOFF.md.
  const [requiredKg, setRequiredKg] = useState('');

  const [plan, setPlan] = useState(null);          // active accepted/calculated line
  const [recommendedPlan, setRecommendedPlan] = useState(null);
  const [, setCustomPlan] = useState(null);
  const [activePlanSizes, setActivePlanSizes] = useState([]);
  const [activePlanType, setActivePlanType] = useState(null);
  const [produced, setProduced] = useState({});    // { '2kg': 11, ... }
  const [wastageKg, setWastageKg] = useState('');
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [showCustomChooser, setShowCustomChooser] = useState(false);

  const [busy, setBusy] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [recommendedError, setRecommendedError] = useState(null);
  const [customError, setCustomError] = useState(null);
  const [validationTriggered, setValidationTriggered] = useState(false);
  const recommendationSuccessKeyRef = useRef(null);
  const customSuccessKeyRef = useRef(null);
  const requestSeqRef = useRef(0);
  const inputsKeyRef = useRef(null);
  const selectedSizesKeyRef = useRef('');

  const [mode, setMode] = useState(readStoredMode);
  // Which panel Guided has open. Form ignores it entirely.
  const [panel, setPanel] = useState('scale');
  const [bagFocus, setBagFocus] = useState(null);
  const {
    ids: confirmedIds, toggle: toggleConfirmed,
    confirmAll: confirmAllBags, reset: resetConfirmed,
  } = useConfirmed();

  // The product list here is the whole catalogue, and the names run
  // long enough that two sacks can look identical until you read to
  // the end of them.
  const productSearch = useListSearch(products, productText);
  const productSearchProps = {
    id: 'stf-product-search',
    query: productSearch.query,
    onQuery: productSearch.setQuery,
    placeholder: 'Search products',
    buttonLabel: 'Search products',
  };

  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('decanting-view-toggle');
  // The sheet just saved, fetched in full by recordDecanting itself —
  // null hides the pop-up; set once by save() on success.
  const [pdfRecord, setPdfRecord] = useState(null);
  const [doneRecord, setDoneRecord] = useState(null);
  // True when the last sheet could not be sent and is on the phone.
  const [queued, setQueued] = useState(false);
  const [labelsBusy, setLabelsBusy] = useState(false);
  const [labelsError, setLabelsError] = useState(null);

  const step = STEP_META[phase];
  const weekOf = useMemo(() => mondayOfThisWeek(), []);
  // Matches ReceivingFlow's own placement: visible from the first
  // screen, not held back for the counting step. Hiding it until
  // "work" read, from the floor, as though only Receiving had a
  // Guided/Form choice at all — this one was there the whole time,
  // just a screen later than the others.
  const showToggle = phase !== 'done';

  useEffect(() => {
    onCrumbChange?.({
      label: step.label,
      step: phase === 'done' ? null : step.n,
      total: phase === 'done' ? null : TOTAL_STEPS,
    });
  }, [step.label, step.n, phase, onCrumbChange]);

  useEffect(() => {
    if (!showCoachmark || !showToggle) return undefined;
    const timer = setTimeout(dismissCoachmark, 5000);
    return () => clearTimeout(timer);
  }, [showCoachmark, showToggle, dismissCoachmark]);

  const handleModeChange = (next) => {
    setMode(next);
    // Switching to Guided from a half-filled form should land on the
    // part that still needs doing, not back at the top.
    if (next === 'guided') setPanel(plan ? 'count' : 'scale');
    try { localStorage.setItem(MODE_KEY, next); } catch { /* nothing we can do */ }
    dismissCoachmark();
  };

  const product = products.find((p) => String(p.id) === String(productId));

  const selectedSizesKg = sizesToKg(selectedSizes);

  const recommendedBagLabels = planLabels(recommendedPlan);
  const activeBagLabels = planLabels(plan);

  const madeTotal = activeBagLabels.reduce((sum, l) => sum + (Number(produced[l]) || 0), 0);

  const clearActivePlan = () => {
    setPlan(null);
    setActivePlanSizes([]);
    setActivePlanType(null);
    setProduced({});
    resetConfirmed();
  };

  const invalidatePlan = () => {
    clearActivePlan();
    setRecommendedPlan(null);
    setCustomPlan(null);
    setRecommendedError(null);
    setCustomError(null);
    setPanel('scale');
    setShowCustomChooser(false);
  };

  const toggleBagSize = (size) => {
    if (activePlanType === 'custom') clearActivePlan();
    setCustomPlan(null);
    setCustomError(null);
    customSuccessKeyRef.current = null;
    setSelectedSizes((current) => (
      current.includes(size)
        ? current.filter((item) => item !== size)
        : [...current, size]
    ));
  };

  const validateWeights = ({ includeWastage = false } = {}) => {
    const messages = [];
    if (!product) messages.push('Choose a product.');

    const weighed = parseKgInput(weighedKg);
    if (weighed.blank) messages.push('Enter the weight shown on the scale.');
    else if (weighed.invalid) messages.push('Enter a valid weight.');
    else if (weighed.value <= 0) messages.push('Weight must be greater than 0 kg.');

    const required = parseKgInput(requiredKg);
    if (required.blank) messages.push('Enter how many kilograms are needed.');
    else if (required.invalid) messages.push('Enter a valid required weight.');
    else if (required.value <= 0) messages.push('Required weight must be greater than 0 kg.');

    const wastage = parseKgInput(wastageKg === '' ? '0' : wastageKg);
    if (includeWastage || wastageKg !== '') {
      if (wastage.invalid) messages.push('Enter a valid wastage amount.');
      else if (wastage.value < 0) messages.push('Wastage cannot be negative.');
      else if (!weighed.blank && !weighed.invalid && wastage.value > weighed.value) {
        messages.push('Wastage cannot be greater than the weighed amount.');
      }
    }

    return {
      messages,
      values: {
        weighedKg: weighed.value,
        requiredKg: required.value,
        wastageKg: wastage.value ?? 0,
      },
    };
  };

  const buildCalculationPayload = (sizesKg, values) => ({
    selectedSizes: sizesKg,
    items: [{
      productId: product.id,
      productName: product.name,
      requiredKg: values.requiredKg,
      actualBulkKg: values.weighedKg,
      wastageKg: values.wastageKg,
    }],
  });

  const seedActivePlan = (line, sizesKg, type) => {
    setPlan(line);
    setActivePlanSizes(sizesKg);
    setActivePlanType(type);
    setProduced({ ...line.bags });
    setBagFocus(null);
    setPanel('bags');
    resetConfirmed();
  };

  const useRecommendedPlan = () => {
    if (!recommendedPlan) return;
    seedActivePlan(recommendedPlan, ALL_SUPPORTED_SIZES_KG, 'recommended');
    setError(null);
  };

  const useSelectedBagSizes = async () => {
    const validation = validateWeights({ includeWastage: true });
    if (validation.messages.length) {
      setCustomError(validation.messages.join(' '));
      return;
    }
    if (!selectedSizesKg.length) {
      setCustomError('Choose at least one bag size before calculating.');
      return;
    }

    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    setCalculating(true);
    try {
      const result = await calculateDecantingPlan(buildCalculationPayload(selectedSizesKg, validation.values));
      if (requestSeqRef.current !== seq) return;
      const line = result.plans[0];
      setCustomPlan(line);
      setCustomError(null);
      seedActivePlan(line, selectedSizesKg, 'custom');
    } catch (err) {
      if (requestSeqRef.current !== seq) return;
      setCustomPlan(null);
      setCustomError(stockMessage(err) ?? "We couldn't calculate that custom bag plan. Your recommended plan is still available.");
    } finally {
      if (requestSeqRef.current === seq) setCalculating(false);
    }
  };

  useEffect(() => {
    if (phase !== 'work') return undefined;

    const validation = validateWeights({ includeWastage: true });
    if (validation.messages.length) {
      clearActivePlan();
      setRecommendedPlan(null);
      setCustomPlan(null);
      inputsKeyRef.current = null;
      selectedSizesKeyRef.current = '';
      return undefined;
    }

    const baseKey = JSON.stringify({
      productId: product.id,
      weighedKg: validation.values.weighedKg,
      requiredKg: validation.values.requiredKg,
      wastageKg: validation.values.wastageKg,
    });
    const selectedKey = selectedSizes.join('|');
    const inputsChanged = inputsKeyRef.current !== baseKey;
    if (inputsChanged) {
      inputsKeyRef.current = baseKey;
      clearActivePlan();
      setRecommendedPlan(null);
      setCustomPlan(null);
      setRecommendedError(null);
      setCustomError(null);
      recommendationSuccessKeyRef.current = null;
      customSuccessKeyRef.current = null;
      selectedSizesKeyRef.current = selectedKey;
    }
    selectedSizesKeyRef.current = selectedKey;
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    let cancelled = false;

    const runCalculation = async ({ sizesKg, key, type }) => {
      const successRef = type === 'recommended' ? recommendationSuccessKeyRef : customSuccessKeyRef;
      if (successRef.current === key) return;
      setCalculating(true);
      try {
        const result = await calculateDecantingPlan(buildCalculationPayload(sizesKg, validation.values));
        if (cancelled || requestSeqRef.current !== seq) return;
        const line = result.plans[0];
        successRef.current = key;
        if (type === 'recommended') {
          setRecommendedPlan(line);
          setRecommendedError(null);
        } else {
          setCustomPlan(line);
          setCustomError(null);
          seedActivePlan(line, sizesKg, 'custom');
        }
      } catch (err) {
        if (cancelled || requestSeqRef.current !== seq) return;
        // More than is in stock: the weight is wrong, so no plan of
        // either kind, and the reason in the server's own words.
        const overStock = stockMessage(err);
        if (type === 'recommended') {
          setRecommendedPlan(null);
          setRecommendedError(overStock ?? "We couldn't create a recommended bag plan. You can still choose your own bag sizes.");
        } else {
          setCustomPlan(null);
          setCustomError(overStock ?? "We couldn't calculate that custom bag plan. Your recommended plan is still available.");
        }
      } finally {
        if (!cancelled && requestSeqRef.current === seq) setCalculating(false);
      }
    };

    runCalculation({
      sizesKg: ALL_SUPPORTED_SIZES_KG,
      key: `${baseKey}:recommended`,
      type: 'recommended',
    });

    if (!selectedSizes.length) {
      setCustomPlan(null);
      setCustomError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [phase, product?.id, product?.name, weighedKg, requiredKg, wastageKg, selectedSizes.join('|')]);

  // ── Save, once, for good ────────────────────────────────────
  const save = async () => {
    setValidationTriggered(true);
    const validation = validateWeights({ includeWastage: true });
    if (validation.messages.length) {
      setError(validation.messages.join(' '));
      return;
    }
    if (!plan) {
      setError('Use the recommended plan or choose bag sizes for a custom plan before saving.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await recordDecanting({
        weekOf,
        selectedSizes: activePlanSizes,
        items: [{
          productId: product.id,
          // So a message about this line can name it.
          productName: product.name,
          requiredKg: validation.values.requiredKg,
          actualBulkKg: validation.values.weighedKg,
          wastageKg: validation.values.wastageKg,
        }],
      });
      setPhase('done');
      // No signal: the sheet is waiting on the phone, so there is no
      // record to show yet.
      setQueued(Boolean(result?.queued));
      if (result?.queued) return;
      // recordDecanting already returns the full joined record. Kept
      // for the "View decanting sheet" button on the confirmation, not
      // opened over it.
      setDoneRecord(result);
    } catch (err) {
      setError(
        /cannot exceed/.test(err.message)
          ? 'You cannot have spilled more than the bulk amount. Check that number.'
          : err.message
      );
    } finally {
      setBusy(false);
    }
  };

  // ── Bag labels ──────────────────────────────────────────────
  // One sticker per bag counted back, each size with its own code. The
  // codes are linked to the product (with the bag size as units per
  // scan) before the sheet opens, so a bag scanned at packing counts
  // the right amount. Linking twice is harmless: the server treats the
  // same link as done.
  const printBagLabels = async () => {
    setLabelsBusy(true);
    setLabelsError(null);
    try {
      const bags = activeBagLabels
        .map((label) => ({ label, count: Number(produced[label]) || 0, sizeKg: sizeLabelToKg(label) }))
        .filter((b) => b.count > 0 && Number.isFinite(b.sizeKg))
        .map((b) => ({ ...b, code: ownBagCode(product.id, b.sizeKg) }));
      await Promise.all(bags.map((b) => linkBarcode(product.id, {
        code: b.code, unitsPerScan: unitsPerBag(b.sizeKg, product.default_unit),
      })));
      const { opened } = openBagLabelPdf({ productName: product.name, bags, decantedOn: todaySast() });
      if (!opened) setLabelsError('The labels could not open. Allow pop-ups for this site and try again.');
    } catch (err) {
      setLabelsError(err.message);
    } finally {
      setLabelsBusy(false);
    }
  };

  const restart = () => {
    setLabelsError(null);
    setDoneRecord(null);
    setPhase('which');
    setProductId('');
    setWeighedKg('');
    setRequiredKg('');
    setPlan(null);
    setRecommendedPlan(null);
    setCustomPlan(null);
    setActivePlanSizes([]);
    setActivePlanType(null);
    setProduced({});
    setWastageKg('');
    setSelectedSizes([]);
    setShowCustomChooser(false);
    setValidationTriggered(false);
    setPanel('scale');
    setBagFocus(null);
    setPdfRecord(null);
  };

  // Weight is the thing everything else waits on, so a change to it
  // invalidates the plan rather than leaving a stale one on screen.
  const changeInput = (setter) => (value) => {
    setter(value);
    invalidatePlan();
    // The message about a missing weight is stale the moment one is typed.
    setError(null);
  };

  // Said above the button rather than hidden in a disabled state. On
  // this page the missing thing is usually a panel further up that
  // the worker has already scrolled past.
  const blockers = [];
  if (!weighedKg)  blockers.push('the weight on the scale');
  if (!requiredKg) blockers.push('what the centres need this week');
  if (!plan)       blockers.push('the bag plan');
  const blockedNote = validationTriggered && blockers.length ? `Still needed: ${blockers.join(', ')}.` : null;

  const isOpen = (key) => mode === 'full' || panel === key;
  const openPanel = (key) => () => {
    if (key === 'bags' && !plan) return;
    if (key === 'count' && !plan) return;
    setPanel(key);
  };

  const commit = (
    <Actions>
      <Button disabled={busy} onClick={save}>
        {busy ? 'Saving' : 'Save decanted amount'}
      </Button>
      <Button variant="secondary" onClick={() => setPhase('which')}>
        Change the product
      </Button>
    </Actions>
  );

  // Same as ReceivingFlow's own toggleControl — see that file's note.
  const toggleControl = showToggle ? (
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

      {/* ── 1 · Which sack ─────────────────────────────────── */}
      {phase === 'which' && (
        <StepScreen
          title="What are you decanting?"
          sub="Pick the product in front of you."
          toggle={toggleControl}
          actions={
            <Actions>
              <Button disabled={!productId} onClick={() => setPhase('work')}>Next</Button>
            </Actions>
          }
        >
          {/* A dropdown, not the tap-target stack this used to be —
              same reasoning as ReceivingFlow's order picker: the
              catalogue runs to dozens of products with names long
              enough to confuse, so it needs the search-then-pick
              shape SelectField gives, in both Guided and Form.
              There's no Guided/Form split here at all, unlike the
              supplier picker on Receiving — that one stays ChoiceList
              because it's four rows, not dozens. */}
          {productSearch.filtered.length > 0 ? (
            <SelectField
              id="stf-decanting-product"
              label="Product"
              placeholder="Choose a product"
              options={productSearch.filtered.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              value={productId}
              onChange={(value) => {
                setProductId(value);
                // A different sack is a different job: the plan and the
                // count-back belonged to the old one.
                invalidatePlan();
                setSelectedSizes([]);
                setShowCustomChooser(false);
                setValidationTriggered(false);
              }}
              search={productSearchProps}
            />
          ) : productSearch.searching ? (
            <>
              <ListTools {...productSearchProps} />
              <NoMatches
              query={productSearch.query}
              onClear={() => productSearch.setQuery('')}
              noun="products"
            />
            </>
          ) : (
            <Notice>Nothing is marked as decantable yet. An admin sets that on the Products screen.</Notice>
          )}
        </StepScreen>
      )}

      {/* ── 2 · The work, on one page ──────────────────────── */}
      {(phase === 'work' || phase === 'done') && (
        <TaskPage
          title={product ? product.name : 'Decanting'}
          sub="Weigh it, bag it, then record what you made."
          toggle={toggleControl}
          note={blockedNote}
          actions={commit}
          side={
            <div className="stf-summary">
              <p className="stf-summary-title">This run</p>
              <KeyValues
                pairs={[
                  ['Product', product ? product.name : '-'],
                  ['Bulk amount', weighedKg ? `${weighedKg} kg` : '-'],
                  ['Needed this week', requiredKg ? `${requiredKg} kg` : '-'],
                  ['Decanted amount', plan ? `${madeTotal} bags` : '-'],
                  ['Spilled', wastageKg ? `${wastageKg} kg` : '0 kg'],
                  ['Filed under', `Week of ${longDate(weekOf)}`],
                ]}
              />
              <Notice>Once you save this, it cannot be changed.</Notice>
            </div>
          }
        >
          {/* ── Panel 1 · the scale ───────────────────────── */}
          <Panel
            n={1}
            title="Bulk amount"
            done={Boolean(plan)}
            open={isOpen('scale')}
            onOpen={mode === 'guided' ? openPanel('scale') : null}
            summary={
              weighedKg
                ? `${weighedKg} kg bulk · ${requiredKg || '-'} kg needed`
                : 'Not weighed yet'
            }
          >
            <NumberField
              id="stf-weighed"
              label="Bulk amount on the scale, in kilograms"
              value={weighedKg}
              onChange={changeInput(setWeighedKg)}
            />
            <NumberField
              id="stf-required"
              label="Kilograms the centres need this week"
              hint="Your manager sets this. Ask them if you are not sure."
              value={requiredKg}
              onChange={changeInput(setRequiredKg)}
            />
            {recommendedError ? <Notice tone="warn">{recommendedError}</Notice> : null}
            {recommendedPlan ? (
              <PlanResult
                title="Recommended bag plan"
                line={recommendedPlan}
                labels={recommendedBagLabels}
                onUseRecommended={activePlanType !== 'recommended' ? useRecommendedPlan : null}
              />
            ) : null}

            {recommendedPlan || recommendedError ? (
              <Actions>
                <Button variant="secondary" onClick={() => setShowCustomChooser(true)}>
                  Choose my own plan
                </Button>
              </Actions>
            ) : null}

            {showCustomChooser ? (
              <>
                <div className="stf-field">
                  <p className="stf-field-label">Bag sizes</p>
                  <div className="bag-size-toggle-group stf-segments" role="group" aria-label="Bag sizes">
                    {STANDARD_SIZES.map((size) => (
                      <BagSizeToggle
                        key={size}
                        label={size}
                        selected={selectedSizes.includes(size)}
                        onToggle={() => toggleBagSize(size)}
                      />
                    ))}
                  </div>
                </div>
                {selectedSizes.length ? (
                  <Actions>
                    <Button disabled={calculating} onClick={useSelectedBagSizes}>
                      {calculating ? 'Working it out' : 'Use selected bag sizes'}
                    </Button>
                  </Actions>
                ) : null}
                {customError && selectedSizes.length ? <Notice tone="warn">{customError}</Notice> : null}
              </>
            ) : null}
            {calculating ? <p className="stf-field-hint">Working out bag plan…</p> : null}
          </Panel>

          {/* ── Panel 2 · the instruction ─────────────────── */}
          <Panel
            n={2}
            title="Bag this many"
            done={Boolean(plan)}
            locked={!plan}
            open={isOpen('bags')}
            onOpen={mode === 'guided' ? openPanel('bags') : null}
            summary={
              plan
                ? activeBagLabels.map((l) => `${plan.bags[l]} × ${l}`).join(' · ')
                : 'Weigh the bulk amount first'
            }
          >
            {plan ? (
              <>
                {/* Nothing to type here, which is exactly why the
                    numbers can be 34px and read with both hands
                    full. */}
                <PlanResult
                  title={activePlanType === 'custom' ? 'Custom plan' : 'Recommended bag plan'}
                  line={plan}
                  labels={activeBagLabels}
                />

                {activePlanType === 'custom' && recommendedPlan ? (
                  <PlanResult
                    title="Recommended bag plan"
                    line={recommendedPlan}
                    labels={recommendedBagLabels}
                    onUseRecommended={useRecommendedPlan}
                  />
                ) : null}

                {plan && mode === 'guided' ? (
                  <Actions>
                    <Button onClick={() => setPanel('count')}>I have filled them</Button>
                  </Actions>
                ) : null}
              </>
            ) : null}
          </Panel>

          {/* ── Panel 3 · count back ──────────────────────── */}
          <Panel
            n={3}
            title="Decanted amount"
            locked={!plan}
            open={isOpen('count')}
            onOpen={mode === 'guided' ? openPanel('count') : null}
            summary={plan ? `${madeTotal} ${madeTotal === 1 ? 'bag' : 'bags'} decanted` : 'Weigh the bulk amount first'}
          >
            {plan ? (
              <>
                {/* The same list receiving and dispatch count on, so a
                    worker who has done one of those has already
                    learned this one. Seeded from the plan, so a run
                    that went exactly as instructed needs no typing. */}
                <WorkList
                  lines={activeBagLabels.map((label) => ({
                    id:       label,
                    title:    `${label} bags`,
                    expected: plan.bags[label],
                    value:    produced[label] ?? '',
                  }))}
                  expectedLabel="planned"
                  guided={mode === 'guided'}
                  focusId={mode === 'guided' ? bagFocus : null}
                  onFocus={(id) => setBagFocus(mode === 'guided' ? id : null)}
                  onChange={(id, value) => setProduced((all) => ({ ...all, [id]: value }))}
                  onAcceptAll={() => {
                    setProduced({ ...plan.bags });
                    confirmAllBags(activeBagLabels);
                  }}
                  acceptAllLabel="Exactly as planned"
                  confirmed={confirmedIds}
                  onConfirm={toggleConfirmed}
                />

                <NumberField
                  id="stf-wastage"
                  label="Spilled or spoiled, in kilograms"
                  hint="Put 0 if none was lost."
                  value={wastageKg}
                  flagged={Number(wastageKg) > 0}
                  onChange={changeInput(setWastageKg)}
                />

                {/* Threshold: more than 5% of the sack. Reported to
                    the manager, never blocked — the run happened
                    either way. */}
                {Number(wastageKg) > Number(weighedKg) * 0.05 ? (
                  <Notice tone="warn">
                    That is more waste than usual for a bulk amount this size. Your manager will look at it.
                    You can still save.
                  </Notice>
                ) : null}
              </>
            ) : null}
          </Panel>
        </TaskPage>
      )}

      {/* ── Done: the one confirmation every flow uses ─────── */}
      <SuccessDialog
        open={phase === 'done'}
        tone={queued ? 'offline' : 'success'}
        title={queued ? OFFLINE_TITLE : 'Decanting saved'}
        picture="ti-paper-bag"
        facts={[
          { value: madeTotal, label: madeTotal === 1 ? 'bag made' : 'bags made' },
          weighedKg !== '' ? { value: `${weighedKg} kg`, label: 'bulk weighed' } : null,
          Number(wastageKg) > 0 ? { value: `${wastageKg} kg`, label: 'wastage' } : null,
        ]}
        onClose={restart}
        action={doneRecord && !queued ? [
          { label: 'View decanting sheet', onClick: () => setPdfRecord(doneRecord) },
          // Linking the bag codes needs signal, so labels come with the
          // sheet, once the server has the run.
          madeTotal > 0 ? {
            label: labelsBusy ? 'Making labels' : 'Print bag labels', onClick: printBagLabels, disabled: labelsBusy,
          } : null,
        ] : null}
      >
        {queued ? offlineLine('Do not record it again.') : 'Bags and waste recorded.'}
        {labelsError ? <Notice tone="warn">{labelsError}</Notice> : null}
      </SuccessDialog>

      {pdfRecord ? (
        <DecantingSheetPDF record={pdfRecord} onClose={() => setPdfRecord(null)} />
      ) : null}
    </>
  );
}
