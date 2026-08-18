// ─────────────────────────────────────────────────────────────
// client/src/features/decanting/components/DecantingFlow.jsx
//
// Decanting, as four sequential screens (ACC-05):
//
//   1  What are you decanting?    pick the sack in front of you
//   2  What does the scale say?   one number, the whole screen
//   3  Bag this many              nothing to type, read from a metre
//   4  What did you get?          count back, plus what was spilled
//
// The split in step 3 is NOT worked out in this file. It comes from
// POST /api/decanting/calculate, because decanting.service.js already
// solves it properly: a closest-total search across the chosen bag
// sizes, capped at the weighed bulk so the plan can never instruct
// staff to pack more than is physically in the sack. Re-deriving that
// in the client would put two answers in the building.
//
// Two things the service decides that this screen only reports:
//   - the 0.5% margin, stated here in plain words rather than as a
//     percentage (ACC-09)
//   - whether the run is bulk-limited, which is what turns "one sack
//     is enough" into "you will be short"
//
// Saving is final. decanting.service.js has no update path, by
// design: wastage cannot be un-recorded.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, NumberField, ChoiceList, Notice,
} from '../../staff/components/StepPrimitives';
import { calculateDecantingPlan, recordDecanting } from '../../../services/decantingAPI';
// The same list the planner and ProductLineRow offer. Importing it
// rather than restating it is the point of folding the two views: a
// fourth bag size added here appears in both, or in neither.
import { STANDARD_SIZES, sizesToKg } from './BagSizes';

const TOTAL_STEPS = 4;

// Sent explicitly rather than relying on the server default, so a
// change on either side is a visible change here too. sizesToKg is
// what stops the old NaN bug coming back: the API takes numbers and
// STANDARD_SIZES are display labels.
const BAG_SIZES_KG = sizesToKg(STANDARD_SIZES);

const STEP_META = {
  product: { n: 1, label: 'What you are working with' },
  weight:  { n: 2, label: 'Weight' },
  bag:     { n: 3, label: 'Bag this many' },
  count:   { n: 4, label: 'What you got' },
  done:    { n: 4, label: 'Saved' },
};

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
const bagPhrase = (label) => (label.endsWith('kg') ? `bags of ${label}` : `bags of ${label}`);

// The margin, said the way someone standing at a scale would say it.
// A percentage on screen is a number nobody can act on.
const leftoverSentence = (plan) => {
  const left = Number(plan.surplusKg ?? 0);
  if (left <= 0) return 'That uses the whole sack.';
  if (left < 1) return `That leaves a little under a kilo in the sack.`;
  return `That leaves about ${Math.round(left)} kg in the sack.`;
};

// products comes from the page above, which fetches it once for both
// this flow and the week planner.
export default function DecantingFlow({ products = [], onCrumbChange }) {
  const [phase, setPhase] = useState('product');

  const [productId, setProductId] = useState('');
  const [weighedKg, setWeighedKg] = useState('');

  // requiredKg is what the ECDs need this week. It belongs to the
  // manager's confirmed demand; until that endpoint exists the staff
  // screen asks for it once, on step 2, rather than pretending to
  // know it. See HANDOFF.md.
  const [requiredKg, setRequiredKg] = useState('');

  const [plan, setPlan] = useState(null);          // one line from /calculate
  const [produced, setProduced] = useState({});    // { '2kg': 11, ... }
  const [wastageKg, setWastageKg] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const step = STEP_META[phase];
 const weekOf = useMemo(() => mondayOfThisWeek(), []);

  useEffect(() => { onCrumbChange?.(step.label); }, [step.label, onCrumbChange]);

  const product = products.find((p) => String(p.id) === String(productId));

  // ── Step 2 to 3 · ask the server for the split ──────────────
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
      setPhase('bag');
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

  // ── Step 4 · save, once, for good ───────────────────────────
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await recordDecanting({
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
    setPhase('product');
    setProductId('');
    setWeighedKg('');
    setRequiredKg('');
    setPlan(null);
    setProduced({});
    setWastageKg('');
  };

  // Bag labels, largest first, as the plan returned them.
  const bagLabels = plan
    ? Object.keys(plan.bags).sort((a, b) => {
        const kg = (l) => (l.endsWith('kg') ? parseFloat(l) : parseFloat(l) / 1000);
        return kg(b) - kg(a);
      })
    : [];

  return (
    <>
      <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} />

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which sack ─────────────────────────────────── */}
      {phase === 'product' && (
        <StepScreen
          title="What are you decanting?"
          sub="Pick the sack in front of you."
          actions={
            <Actions>
              <Button disabled={!productId} onClick={() => setPhase('weight')}>Next</Button>
            </Actions>
          }
        >
          <ChoiceList
            legend="Product"
            options={products.map((p) => ({
              value: p.id,
              label: p.name,
              meta: p.weight_kg ? `Big sacks, about ${Number(p.weight_kg)} kg` : 'Bulk sacks',
            }))}
            value={productId}
            onChange={setProductId}
          />
        </StepScreen>
      )}

      {/* ── 2 · Weight ─────────────────────────────────────── */}
      {phase === 'weight' && (
        <StepScreen
          title="What does the scale say?"
          sub="Put the whole sack on the scale and read the number."
          actions={
            <Actions>
              <Button disabled={!weighedKg || !requiredKg || busy} onClick={workOutTheBags}>
                {busy ? 'Working it out' : 'Work out the bags'}
              </Button>
              <Button variant="secondary" onClick={() => setPhase('product')}>Back</Button>
            </Actions>
          }
        >
          <NumberField
            id="stf-weighed"
            label="Kilograms"
            value={weighedKg}
            onChange={setWeighedKg}
          />
          <NumberField
            id="stf-required"
            label="Kilograms the centres need this week"
            hint="Your manager sets this. Ask them if you are not sure."
            value={requiredKg}
            onChange={setRequiredKg}
          />
        </StepScreen>
      )}

      {/* ── 3 · The instruction ────────────────────────────── */}
      {phase === 'bag' && plan && (
        <StepScreen
          title="Bag this many"
          sub="Fill these, then come back and tell us what you got."
          actions={
            <Actions>
              <Button onClick={() => setPhase('count')}>I have filled them</Button>
              <Button variant="secondary" onClick={() => setPhase('weight')}>
                Change the weight
              </Button>
            </Actions>
          }
        >
          {/* Nothing to type on this screen, which is exactly why the
              numbers can be 34px and read with both hands full. */}
          {bagLabels.map((label) => (
            <div key={label} className="stf-instruction">
              <span className="stf-instruction-n">{plan.bags[label]}</span>
              <span className="stf-instruction-l">{bagPhrase(label)}</span>
            </div>
          ))}

          <p className="stf-field-hint">{leftoverSentence(plan)}</p>

          {/* The sack was lighter than the week needs: a supply
              problem, not a mistake staff made. Said plainly, and it
              does not block the run. */}
          {plan.isBulkLimited ? (
            <Notice tone="warn">
              This sack does not hold everything the centres need this week. Pack what is here and
              tell your manager, so they can order more.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      {/* ── 4 · Count back ─────────────────────────────────── */}
      {phase === 'count' && plan && (
        <StepScreen
          title="What did you actually get?"
          sub="Count the bags you filled."
          actions={
            <Actions>
              <Button disabled={busy} onClick={save}>{busy ? 'Saving' : 'Save'}</Button>
              <Button variant="secondary" onClick={() => setPhase('bag')}>
                Back to the bag list
              </Button>
            </Actions>
          }
        >
          {bagLabels.map((label) => (
            <NumberField
              key={label}
              id={`stf-made-${label}`}
              label={`${label} bags`}
              value={produced[label] ?? 0}
              onChange={(value) => setProduced((all) => ({ ...all, [label]: value }))}
            />
          ))}

          <NumberField
            id="stf-wastage"
            label="Spilled or spoiled, in kilograms"
            hint="Put 0 if none was lost."
            value={wastageKg}
            flagged={Number(wastageKg) > 0}
            onChange={setWastageKg}
          />

          {/* Threshold: more than 5% of the sack. Reported to the
              manager, never blocked — the run happened either way. */}
          {Number(wastageKg) > Number(weighedKg) * 0.05 ? (
            <Notice tone="warn">
              That is more waste than usual for a sack this size. Your manager will look at it. You
              can still save.
            </Notice>
          ) : null}

          <Notice>
            Once you save this, it cannot be changed. It goes on the week of {longDate(weekOf)}.
          </Notice>
        </StepScreen>
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
    </>
  );
}
