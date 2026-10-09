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
import { STANDARD_SIZES, sizesToKg } from './BagSizes';
import BagSizeToggle from './BagSizeToggle';
import DecantingSheetPDF from './DecantingSheetPDF';

// Name and SKU: two sacks of maize meal are told apart by the code on
// the bag as often as by the name on it. Module level for a stable
// identity — see the same note in ReceivingFlow.jsx.
const productText = (product) => [product?.name, product?.sku].filter(Boolean).join(' ');

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

// Monday of the current week, which is what weekOf means server-side.
const mondayOfThisWeek = () => {
  const now = new Date();
  const day = now.getDay();               // 0 Sunday .. 6 Saturday
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now.toISOString().slice(0, 10);
};

const longDate = (iso) =>
  new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });

// "500g" and "2kg" are the labels decanting.service.js returns as the
// keys of the bags object; this turns one into a sentence.
const bagPhrase = (label, count) => `${Number(count) === 1 ? 'bag' : 'bags'} of ${label}`;

const grams = (kg) => `${Math.round(Number(kg || 0) * 1000)}g`;
const readableKg = (kg) => {
  const value = Number(kg || 0);
  if (value >= 1) return `${Number(value.toFixed(2))}kg`;
  return grams(value);
};

const partialBagText = (partialBag) => {
  if (!partialBag?.isPartial) return null;
  return `Actual contents: ${grams(partialBag.actualWeightKg)}`;
};

// The margin, said the way someone standing at a scale would say it.
// A percentage on screen is a number nobody can act on.
const leftoverSentence = (plan) => {
  const left = Number(plan.surplusKg ?? 0);
  if (left <= 0) return 'That uses the whole bulk amount.';
  if (left < 1) return 'That leaves a little under a kilo of the bulk amount.';
  return `That leaves about ${Math.round(left)} kg of the bulk amount.`;
};

const parseKgInput = (raw) => {
  const text = String(raw ?? '').trim();
  if (text === '') return { blank: true, value: null };
  if (!/^-?\d+(?:[.,]\d{1,3})?$/.test(text)) return { invalid: true, value: null };
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? { value } : { invalid: true, value: null };
};

// ── Panel ──────────────────────────────────────────────────────
// One part of the job. In Guided the head is a button and only one is
// open; in Form they are all open and the head is a plain label, so
// there is no control that looks tappable and does nothing.
function Panel({ n, title, summary, open, done, locked, onOpen, children }) {
  const clickable = Boolean(onOpen) && !locked;
  const Head = clickable ? 'button' : 'div';

  return (
    <section
      className={[
        'stf-panel',
        open ? 'is-open' : '',
        done && !open ? 'is-done' : '',
        locked ? 'is-locked' : '',
      ].filter(Boolean).join(' ')}
    >
      <Head
        className="stf-panel-head"
        {...(clickable ? { type: 'button', onClick: onOpen, 'aria-expanded': open } : {})}
      >
        <span className="stf-panel-n" aria-hidden="true">{n}</span>
        <span className="stf-panel-text">
          <span className="stf-panel-title">{title}</span>
          {/* The summary is what makes a closed panel worth having:
              closed and blank is just a hidden field. */}
          {!open && summary ? <span className="stf-panel-sum">{summary}</span> : null}
        </span>
      </Head>
      {open ? <div className="stf-panel-body">{children}</div> : null}
    </section>
  );
}

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

  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('decanting-view-toggle');
  // The sheet just saved, fetched in full by recordDecanting itself —
  // null hides the pop-up; set once by save() on success.
  const [pdfRecord, setPdfRecord] = useState(null);
  // True when the last sheet could not be sent and is on the phone.
  const [queued, setQueued] = useState(false);

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

  // Bag labels, largest first, as the plan returned them.
  const planLabels = (line) => line
    ? Object.keys(line.bags)
        .filter((label) => Number(line.bags[label]) > 0)
        .sort((a, b) => {
          const kg = (l) => (l.endsWith('kg') ? parseFloat(l) : parseFloat(l) / 1000);
          return kg(b) - kg(a);
    })
    : [];
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
    } catch {
      if (requestSeqRef.current !== seq) return;
      setCustomPlan(null);
      setCustomError("We couldn't calculate that custom bag plan. Your recommended plan is still available.");
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
      } catch {
        if (cancelled || requestSeqRef.current !== seq) return;
        if (type === 'recommended') {
          setRecommendedPlan(null);
          setRecommendedError("We couldn't create a recommended bag plan. You can still choose your own bag sizes.");
        } else {
          setCustomPlan(null);
          setCustomError("We couldn't calculate that custom bag plan. Your recommended plan is still available.");
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
      // recordDecanting already returns the full joined record (see
      // decanting.repository.js's own getDecantingById-after-insert
      // pattern) — no second fetch needed for the pop-up.
      setPdfRecord(result);
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

  const restart = () => {
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

  const renderPlanResult = ({ title, line, labels, showUseRecommended = false }) => {
    if (!line) return null;
    const shortfallKg = Number(line.shortfallKg || 0);
    const surplusKg = Number(line.surplusKg || 0);

    return (
      <>
        <p className="stf-field-label">{title}</p>
        {labels.map((label) => (
          <div key={`${title}-${label}`} className="stf-instruction">
            <span className="stf-instruction-n">{line.bags[label]}</span>
            <span className="stf-instruction-l">{bagPhrase(label, line.bags[label])}</span>
          </div>
        ))}

        {line.partialBag ? (
          <div className="stf-instruction">
            <span className="stf-instruction-n">1</span>
            <span className="stf-instruction-l">Partial 500g bag</span>
            <span className="stf-field-hint">{partialBagText(line.partialBag)}</span>
          </div>
        ) : null}

        <p className="stf-field-hint">Packed: {readableKg(line.packedKg)}</p>
        <p className="stf-field-hint">{leftoverSentence(line)}</p>

        {shortfallKg > 0 ? (
          <Notice tone="warn">
            {readableKg(shortfallKg)} still needs to be packed. Choose another bag size if you want
            to cover the remaining amount.
          </Notice>
        ) : null}

        {!shortfallKg && surplusKg >= 0.5 ? (
          <Notice tone="warn">
            {grams(surplusKg)} cannot be packed using the selected bag sizes. Choose another
            bag size or review the remaining amount.
          </Notice>
        ) : null}

        {line.isBulkLimited ? (
          <Notice tone="warn">
            This bulk amount does not cover everything the centres need this week. Pack what is here
            and tell your manager, so they can order more.
          </Notice>
        ) : null}

        {showUseRecommended ? (
          <Actions>
            <Button onClick={useRecommendedPlan}>Use recommended plan</Button>
          </Actions>
        ) : null}
      </>
    );
  };

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
          <ListTools
            id="stf-product-search"
            query={productSearch.query}
            onQuery={productSearch.setQuery}
            placeholder="Search products"
          />

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
                label: p.weight_kg
                  ? `${p.name} · bulk, about ${Number(p.weight_kg)} kg each`
                  : `${p.name} · bulk`,
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
            />
          ) : productSearch.searching ? (
            <NoMatches
              query={productSearch.query}
              onClear={() => productSearch.setQuery('')}
              noun="products"
            />
          ) : (
            <Notice>Nothing is marked as decantable yet. An admin sets that on the Products screen.</Notice>
          )}
        </StepScreen>
      )}

      {/* ── 2 · The work, on one page ──────────────────────── */}
      {phase === 'work' && (
        <TaskPage
          title={product ? product.name : 'Decanting'}
          sub="Weigh the bulk amount, fill the bags it works out to, then enter the decanted amount."
          toggle={toggleControl}
          note={blockedNote}
          actions={commit}
          side={
            <div className="stf-summary">
              <p className="stf-summary-title">This run</p>
              <KeyValues
                pairs={[
                  ['Product', product ? product.name : '—'],
                  ['Bulk amount', weighedKg ? `${weighedKg} kg` : '—'],
                  ['Needed this week', requiredKg ? `${requiredKg} kg` : '—'],
                  ['Decanted amount', plan ? `${madeTotal} bags` : '—'],
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
                ? `${weighedKg} kg bulk · ${requiredKg || '—'} kg needed`
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
            {recommendedPlan ? renderPlanResult({
              title: 'Recommended bag plan',
              line: recommendedPlan,
              labels: recommendedBagLabels,
              showUseRecommended: activePlanType !== 'recommended',
            }) : null}

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
                {renderPlanResult({
                  title: activePlanType === 'custom' ? 'Custom plan' : 'Recommended bag plan',
                  line: plan,
                  labels: activeBagLabels,
                })}

                {activePlanType === 'custom' && recommendedPlan ? renderPlanResult({
                  title: 'Recommended bag plan',
                  line: recommendedPlan,
                  labels: recommendedBagLabels,
                  showUseRecommended: true,
                }) : null}

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

      {/* ── Done ───────────────────────────────────────────── */}
      {phase === 'done' && (
        <StepScreen
          title={queued ? 'Saved on this phone' : 'Saved'}
          sub={queued
            ? 'There was no signal, so this sheet is waiting on your phone. It sends itself as soon as you are back in range; the bar at the top says when it has gone. Do not record it again.'
            : "The bags are on the system and the waste is on this week's report."}
          actions={
            <Actions>
              <Button onClick={restart}>Decant another bulk amount</Button>
            </Actions>
          }
        />
      )}

      {pdfRecord ? (
        <DecantingSheetPDF record={pdfRecord} onClose={() => setPdfRecord(null)} />
      ) : null}
    </>
  );
}
