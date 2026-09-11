// ─────────────────────────────────────────────────────────────
// client/src/features/decanting/components/DecantingFlow.jsx
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
import { useEffect, useMemo, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, NumberField, ChoiceList, Notice,
  KeyValues, ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import useCoachmark from '../../staff/hooks/useCoachmark';
import useConfirmed from '../../staff/hooks/useConfirmed';
import useListSearch from '../../staff/hooks/useListSearch';
import TaskPage from '../../staff/components/TaskPage';
import WorkList from '../../staff/components/WorkList';
import ListTools, { NoMatches } from '../../staff/components/ListTools';
import { calculateDecantingPlan, recordDecanting } from '../../../services/decantingAPI';
// The same list the planner and ProductLineRow offer. Importing it
// rather than restating it is the point: a fourth bag size added here
// appears in both, or in neither.
import { STANDARD_SIZES, sizesToKg } from './BagSizes';
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

// Sent explicitly rather than relying on the server default, so a
// change on either side is a visible change here too. sizesToKg is
// what stops the old NaN bug coming back: the API takes numbers and
// STANDARD_SIZES are display labels.
const BAG_SIZES_KG = sizesToKg(STANDARD_SIZES);

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
const bagPhrase = (label) => `bags of ${label}`;

// The margin, said the way someone standing at a scale would say it.
// A percentage on screen is a number nobody can act on.
const leftoverSentence = (plan) => {
  const left = Number(plan.surplusKg ?? 0);
  if (left <= 0) return 'That uses the whole sack.';
  if (left < 1) return 'That leaves a little under a kilo in the sack.';
  return `That leaves about ${Math.round(left)} kg in the sack.`;
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

  const [plan, setPlan] = useState(null);          // one line from /calculate
  const [produced, setProduced] = useState({});    // { '2kg': 11, ... }
  const [wastageKg, setWastageKg] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  const step = STEP_META[phase];
  const weekOf = useMemo(() => mondayOfThisWeek(), []);
  const showToggle = phase === 'work';

  useEffect(() => { onCrumbChange?.(step.label); }, [step.label, onCrumbChange]);

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

  // Bag labels, largest first, as the plan returned them.
  const bagLabels = plan
    ? Object.keys(plan.bags).sort((a, b) => {
        const kg = (l) => (l.endsWith('kg') ? parseFloat(l) : parseFloat(l) / 1000);
        return kg(b) - kg(a);
      })
    : [];

  const madeTotal = bagLabels.reduce((sum, l) => sum + (Number(produced[l]) || 0), 0);

  // ── Ask the server for the split ────────────────────────────
  const workOutTheBags = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await calculateDecantingPlan({
        selectedSizes: BAG_SIZES_KG,
        items: [{
          productId: product.id,
          productName: product.name,
          requiredKg: Number(requiredKg),
          actualBulkKg: Number(weighedKg),
        }],
      });
      const line = result.plans[0];
      setPlan(line);
      // Seed the count-back with the plan, so a run that went exactly
      // as instructed needs no typing at all — only corrections do.
      setProduced({ ...line.bags });
      setBagFocus(null);
      setPanel('bags');
    } catch (err) {
      // A validation message from the service is written for a
      // developer ("must be at least half the smallest selected bag
      // size"). Shown as-is it is worse than nothing, so the two
      // cases staff can actually cause get their own sentence.
      setError(
        /at least half/.test(err.message)
          ? 'That weight is too small to fill even one bag. Check the scale and type it again.'
          : err.message
      );
    } finally {
      setBusy(false);
    }
  };

  // ── Save, once, for good ────────────────────────────────────
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await recordDecanting({
        weekOf,
        selectedSizes: BAG_SIZES_KG,
        items: [{
          productId: product.id,
          requiredKg: Number(requiredKg),
          actualBulkKg: Number(weighedKg),
          wastageKg: Number(wastageKg || 0),
        }],
      });
      setPhase('done');
      // recordDecanting already returns the full joined record (see
      // decanting.repository.js's own getDecantingById-after-insert
      // pattern) — no second fetch needed for the pop-up.
      setPdfRecord(result);
    } catch (err) {
      setError(
        /cannot exceed/.test(err.message)
          ? 'You cannot have spilled more than was in the sack. Check that number.'
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
    setProduced({});
    setWastageKg('');
    setPanel('scale');
    setBagFocus(null);
    setPdfRecord(null);
  };

  // Weight is the thing everything else waits on, so a change to it
  // invalidates the plan rather than leaving a stale one on screen.
  const changeWeight = (setter) => (value) => {
    setter(value);
    if (plan) { setPlan(null); setProduced({}); setPanel('scale'); }
  };

  // Said above the button rather than hidden in a disabled state. On
  // this page the missing thing is usually a panel further up that
  // the worker has already scrolled past.
  const blockers = [];
  if (!weighedKg)  blockers.push('the weight on the scale');
  if (!requiredKg) blockers.push('what the centres need this week');
  if (!plan)       blockers.push('the bag plan');
  const blockedNote = blockers.length ? `Still needed: ${blockers.join(', ')}.` : null;

  const isOpen = (key) => mode === 'full' || panel === key;
  const openPanel = (key) => () => {
    if (key !== 'scale' && !plan) return;
    setPanel(key);
  };

  const commit = (
    <Actions>
      <Button disabled={busy || blockers.length > 0} onClick={save}>
        {busy ? 'Saving' : 'Save this sack'}
      </Button>
      <Button variant="secondary" onClick={() => setPhase('which')}>
        Change the sack
      </Button>
    </Actions>
  );

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

      {phase !== 'done' ? <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} /> : null}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which sack ─────────────────────────────────── */}
      {phase === 'which' && (
        <StepScreen
          title="What are you decanting?"
          sub="Pick the sack in front of you."
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

          {productSearch.searching && productSearch.filtered.length === 0 ? (
            <NoMatches
              query={productSearch.query}
              onClear={() => productSearch.setQuery('')}
              noun="products"
            />
          ) : (
            <ChoiceList
              legend="Product"
              options={productSearch.filtered.map((p) => ({
                value: p.id,
                label: p.name,
                meta: p.weight_kg ? `Big sacks, about ${Number(p.weight_kg)} kg` : 'Bulk sacks',
              }))}
              value={productId}
              onChange={(value) => {
                setProductId(value);
                // A different sack is a different job: the plan and the
                // count-back belonged to the old one.
                setPlan(null);
                setProduced({});
                setPanel('scale');
                resetConfirmed();
              }}
              onActivate={() => setPhase('work')}
            />
          )}
        </StepScreen>
      )}

      {/* ── 2 · The work, on one page ──────────────────────── */}
      {phase === 'work' && (
        <TaskPage
          title={product ? product.name : 'Decanting'}
          sub="Weigh the sack, fill the bags it works out to, then say what you actually got."
          note={blockedNote}
          actions={commit}
          side={
            <div className="stf-summary">
              <p className="stf-summary-title">This sack</p>
              <KeyValues
                pairs={[
                  ['Product', product ? product.name : '—'],
                  ['On the scale', weighedKg ? `${weighedKg} kg` : '—'],
                  ['Needed this week', requiredKg ? `${requiredKg} kg` : '—'],
                  ['Bags counted back', plan ? String(madeTotal) : '—'],
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
            title="On the scale"
            done={Boolean(plan)}
            open={isOpen('scale')}
            onOpen={mode === 'guided' ? openPanel('scale') : null}
            summary={
              weighedKg
                ? `${weighedKg} kg weighed · ${requiredKg || '—'} kg needed`
                : 'Not weighed yet'
            }
          >
            <NumberField
              id="stf-weighed"
              label="Kilograms on the scale"
              value={weighedKg}
              onChange={changeWeight(setWeighedKg)}
            />
            <NumberField
              id="stf-required"
              label="Kilograms the centres need this week"
              hint="Your manager sets this. Ask them if you are not sure."
              value={requiredKg}
              onChange={changeWeight(setRequiredKg)}
            />
            {!plan ? (
              <Actions>
                <Button disabled={!weighedKg || !requiredKg || busy} onClick={workOutTheBags}>
                  {busy ? 'Working it out' : 'Work out the bags'}
                </Button>
              </Actions>
            ) : null}
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
                ? bagLabels.map((l) => `${plan.bags[l]} × ${l}`).join(' · ')
                : 'Weigh the sack first'
            }
          >
            {plan ? (
              <>
                {/* Nothing to type here, which is exactly why the
                    numbers can be 34px and read with both hands
                    full. */}
                {bagLabels.map((label) => (
                  <div key={label} className="stf-instruction">
                    <span className="stf-instruction-n">{plan.bags[label]}</span>
                    <span className="stf-instruction-l">{bagPhrase(label)}</span>
                  </div>
                ))}

                <p className="stf-field-hint">{leftoverSentence(plan)}</p>

                {/* The sack was lighter than the week needs: a supply
                    problem, not a mistake staff made. Said plainly,
                    and it does not block the run. */}
                {plan.isBulkLimited ? (
                  <Notice tone="warn">
                    This sack does not hold everything the centres need this week. Pack what is here
                    and tell your manager, so they can order more.
                  </Notice>
                ) : null}

                {mode === 'guided' ? (
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
            title="What you actually got"
            locked={!plan}
            open={isOpen('count')}
            onOpen={mode === 'guided' ? openPanel('count') : null}
            summary={plan ? `${madeTotal} bags counted back` : 'Weigh the sack first'}
          >
            {plan ? (
              <>
                {/* The same list receiving and dispatch count on, so a
                    worker who has done one of those has already
                    learned this one. Seeded from the plan, so a run
                    that went exactly as instructed needs no typing. */}
                <WorkList
                  lines={bagLabels.map((label) => ({
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
                    confirmAllBags(bagLabels);
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
                  onChange={setWastageKg}
                />

                {/* Threshold: more than 5% of the sack. Reported to
                    the manager, never blocked — the run happened
                    either way. */}
                {Number(wastageKg) > Number(weighedKg) * 0.05 ? (
                  <Notice tone="warn">
                    That is more waste than usual for a sack this size. Your manager will look at it.
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
          title="Saved"
          sub="The bags are on the system and the waste is on this week's report."
          actions={
            <Actions>
              <Button onClick={restart}>Decant another sack</Button>
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
