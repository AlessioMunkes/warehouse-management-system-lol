// ─────────────────────────────────────────────────────────────
// client/src/pages/GuestPackPage.jsx
//
// BR-22 screen (d): a Love Activist packing their pallet.
//
// DERIVED FROM StaffSlipFlow.jsx, WITH ONE DELIBERATE DIVERGENCE.
//
// StaffSlipFlow shows the whole pallet at once, and its header comment
// explains why: an experienced packer needs to see everything while
// standing in front of it, so a wizard would be slower and more
// annoying than a checklist.
//
// This screen shows ONE ITEM AT A TIME. That is a choice, not an
// oversight, and it is the opposite choice for a good reason: the
// person here may never have packed a pallet before, may be in their
// sixties, is standing up holding a phone one-handed, and will likely
// never see this screen again. A list of nine rows with two buttons
// each is a wall. One thing, one decision, then the next thing, is not.
//
// Everything else is deliberately the same as staff: same endpoints,
// same statuses, same event vocabulary, same idea of what "flagged"
// means. Only the presentation differs.
//
// ACC-05 is the same rule the staff step flows follow. ACC-06 is why
// every control here is 56px rather than 44px.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchMySlip, confirmItem, flagItem, completeSlip,
} from '../services/guestSlipAPI';
import {
  GuestShell, GuestScreen, PlaceBar, Button, ButtonRow, Notice,
  StatusPill, Progress, Counter, HelpNote, Loading,
} from '../features/guest/components/GuestPrimitives';
import { formatDay, displayName } from '../features/guest/guestFormat';

// Plain words. No "variance", no "SKU", no "cohort" — ACC-09.
const PROBLEM_REASONS = [
  { value: 'Short quantity',  label: 'There isn’t enough of it' },
  { value: 'Damaged stock',   label: 'It looks damaged or spoiled' },
  { value: 'Substituted item', label: 'I packed something else instead' },
  { value: 'Other',           label: 'Something else' },
];

const GuestPackPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [slip, setSlip]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [mode, setMode]   = useState('item');   // 'item' | 'problem'
  // Quantity is keyed to the item it belongs to rather than synced by an
  // effect. Syncing with useEffect meant an extra render per item and,
  // worse, a window in which the counter still showed the PREVIOUS
  // item's number — on a screen whose whole job is one item at a time.
  // Deriving it during render means it is never briefly wrong.
  const [qtyFor, setQtyFor] = useState(null);   // { itemId, value }
  const [reason, setReason] = useState('');
  const [busy, setBusy]   = useState(false);
  const [saidSo, setSaidSo] = useState(null);   // the confirmation after every action

  const load = useCallback(async () => {
    try {
      const data = await fetchMySlip();
      setSlip(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      if (err.status === 404) setSlip(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items    = slip?.items ?? [];
  const total    = items.length;
  const done     = items.filter((i) => i.status !== 'pending').length;
  // The next thing to deal with — progressive disclosure in one line.
  const current  = items.find((i) => i.status === 'pending') ?? null;
  const allDone  = total > 0 && done === total;

  // Defaults to what the slip asks for, until this volunteer changes it.
  const qty = (qtyFor && qtyFor.itemId === current?.id)
    ? qtyFor.value
    : (Number(current?.required_quantity) || 0);
  const setQty = (value) => setQtyFor({ itemId: current?.id, value });

  if (loading) return <GuestShell><Loading label="Loading your pallet" /></GuestShell>;

  // No pallet — a dead end, so it gets a way out.
  if (!slip) {
    return (
      <GuestShell>
        <GuestScreen
          title="You don’t have a pallet yet"
          lede="Pick one and we’ll get started."
        >
          {error ? <Notice tone="info">{error}</Notice> : null}
          <Button onClick={() => navigate('/guest-home')}>See today’s pallets</Button>
          <HelpNote />
        </GuestScreen>
      </GuestShell>
    );
  }

  const beneficiary = slip.beneficiary_name || slip.ecd_name || 'a community partner';

  const act = async (fn, successMessage) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSaidSo(successMessage);       // confirmation after every action
      setMode('item');
      setReason('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeSlip(slip.id);

      // Carry the real numbers forward. Once the slip is complete it is
      // no longer claimable, so GET /mine returns 404 and the summary
      // screen has nothing to fetch. These are counted from the items
      // this volunteer actually just worked through — never placeholders.
      const packed  = items.filter((i) => i.status === 'confirmed');
      const flagged = items.filter((i) => i.status === 'flagged');
      const units   = packed.reduce((sum, i) => sum + (Number(i.packed_quantity) || 0), 0);

      navigate('/guest/done', {
        replace: true,
        state: {
          summary: {
            beneficiary,
            beneficiaryKind: slip.beneficiary_kind,
            dispatchDate: slip.dispatch_date,
            childCount: slip.child_count ?? null,
            itemsPacked: packed.length,
            itemsFlagged: flagged.length,
            totalItems: items.length,
            unitsPacked: units,
          },
        },
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  // ── An empty pallet ─────────────────────────────────────────
  // A real state: ECD 12 has no order lines, so slip 136 has zero items.
  // Rendering an empty checklist would leave a first-timer staring at
  // nothing, wondering what they did wrong. Say it in words instead.
  if (total === 0) {
    return (
      <GuestShell>
        <GuestScreen
          title="This pallet is empty"
          lede={`There is nothing listed for ${beneficiary} yet, so there is nothing to pack right now.`}
        >
          <PlaceBar items={[
            { text: 'Packing for' }, { text: beneficiary, strong: true },
            { text: `Going out ${formatDay(slip.dispatch_date)}` },
          ]} />
          <Notice tone="info">
            This is not something you have done wrong — the list for this pallet
            has not been set up yet. A staff member needs to sort it out.
          </Notice>
          <Button onClick={() => navigate('/guest-home')}>Pick a different pallet</Button>
          <HelpNote>Please let a staff member know about this one.</HelpNote>
        </GuestScreen>
      </GuestShell>
    );
  }

  // ── Everything done — offer to close it ─────────────────────
  if (allDone) {
    return (
      <GuestShell>
        <GuestScreen
          title="That’s everything"
          lede={`You have been through all ${total} item${total === 1 ? '' : 's'}. One last step.`}
        >
          <PlaceBar items={[
            { text: 'Packing for' }, { text: beneficiary, strong: true },
          ]} />
          <Progress done={done} total={total} />
          {error ? <Notice tone="warn">{error}</Notice> : null}
          <Button onClick={finish} disabled={busy}>
            {busy ? 'Finishing…' : 'Finish this pallet'}
          </Button>
          <HelpNote>Spotted something you want to change first?</HelpNote>
        </GuestScreen>
      </GuestShell>
    );
  }

  // ── Reporting a problem ─────────────────────────────────────
  if (mode === 'problem') {
    return (
      <GuestShell>
        <GuestScreen
          title="What’s wrong with it?"
          lede="Whatever you pick, it gets passed to a staff member. Nothing here is a mistake on your part."
        >
          <PlaceBar items={[{ text: current.product_name, strong: true }]} />

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="gst-sr">Why is there a problem?</legend>
            <div className="gst-stack-tight">
              {PROBLEM_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`gst-card gst-card-button${reason === r.value ? ' gst-card-quiet' : ''}`}
                  aria-pressed={reason === r.value}
                  onClick={() => setReason(r.value)}
                >
                  <span className="gst-card-title" style={{ fontSize: '1rem' }}>
                    {reason === r.value ? '✓ ' : ''}{r.label}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <Counter label="How many did you actually pack?" value={qty} onChange={setQty} />

          {error ? <Notice tone="warn">{error}</Notice> : null}

          <ButtonRow>
            <Button
              disabled={!reason || busy}
              onClick={() => act(
                () => flagItem(slip.id, current.id, reason, qty),
                `Thanks — a staff member will look at the ${current.product_name}.`,
              )}
            >
              {busy ? 'Saving…' : 'Report it'}
            </Button>
            <Button variant="ghost" onClick={() => { setMode('item'); setReason(''); }} disabled={busy}>
              Back
            </Button>
          </ButtonRow>

          <HelpNote />
        </GuestScreen>
      </GuestShell>
    );
  }

  // ── The one item in front of them ───────────────────────────
  return (
    <GuestShell>
      <GuestScreen
        title={current.product_name}
        lede={`Put ${current.required_quantity} ${current.unit || ''} into the box.`.replace(/\s+/g, ' ')}
      >
        {/* Constant sense of place: what, for whom, how far through. */}
        <PlaceBar items={[
          { text: 'For' }, { text: beneficiary, strong: true },
          { text: `Going out ${formatDay(slip.dispatch_date)}` },
        ]} />

        <Progress done={done} total={total} />

        {/* Confirmation after every action — never leave someone
            wondering whether a tap landed. Announced, not just drawn. */}
        {saidSo ? <Notice tone="good">{saidSo}</Notice> : null}
        {error ? <Notice tone="warn">{error}</Notice> : null}

        <div className="gst-card gst-animate-rise" key={current.id}>
          <p className="gst-card-meta">Item {done + 1} of {total}</p>
          <h2 className="gst-card-title" style={{ fontSize: '1.375rem' }}>{current.product_name}</h2>
          <p className="gst-card-meta">
            You need <strong>{current.required_quantity} {current.unit || ''}</strong>.
            Take from the oldest stock first.
          </p>
        </div>

        <Counter label="How many did you pack?" value={qty} onChange={setQty} />

        <ButtonRow>
          <Button
            disabled={busy}
            onClick={() => act(
              () => confirmItem(slip.id, current.id, qty),
              `${current.product_name} — packed. Nice one, ${displayName(user?.firstName)}.`,
            )}
          >
            {busy ? 'Saving…' : 'Packed it'}
          </Button>
          <Button variant="secondary" onClick={() => setMode('problem')} disabled={busy}>
            There’s a problem
          </Button>
        </ButtonRow>

        {/* What has been dealt with so far, so the screen is a record
            and not just a conveyor belt. Marks and words, never colour
            alone (ACC-03). */}
        {done > 0 ? (
          <details className="gst-card gst-card-quiet">
            <summary style={{ minHeight: 'var(--gst-tap)', display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 700 }}>
              What you’ve done so far ({done})
            </summary>
            <ul className="gst-done-list gst-stack-tight">
              {items.filter((i) => i.status !== 'pending').map((i) => (
                <li key={i.id} className="gst-done-row">
                  <span>{i.product_name}</span>
                  <StatusPill status={i.status} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <HelpNote />
      </GuestScreen>
    </GuestShell>
  );
};

export default GuestPackPage;
