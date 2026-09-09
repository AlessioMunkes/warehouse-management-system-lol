// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/GateQueue.jsx
//
// The board at the gate, from GET /api/dispatch?scope=gate.
//
// Not just today: every pallet still outstanding on any date, plus
// whatever was handled today. A pallet staged for Tuesday that nobody
// fetched is still in the building on Thursday and has to be
// releasable — the 16:00 sweep marks it not_collected but leaves it
// collectable as a late collection.
//
// WHAT CHANGED
// This used to make two calls to the PICKING endpoints and treat a
// slip with status 'complete' as "waiting" and status 'collected' as
// "done". Neither was right. A pallet's gate state lives in
// dispatch_events, not in picking_slips.status, and 'collected' is
// not a picking slip status at all — the value is 'dispatched' — so
// the "collected today" count was permanently zero and a collected
// pallet just disappeared off the screen with nothing to show for it.
//
// One call now returns the whole day: awaiting, collected, late, and
// written off, each row carrying dispatch_status. Rows are keyed on
// picking_slip_id, not id.
//
// Everything still awaiting is shown; only an already-COMPLETED
// dispatch survives for a centre that has since gone inactive — the
// pallet already left, and the centre's current status doesn't
// rewrite that history. A centre with nothing awaiting it (BR-11's
// hard block) has no reason to occupy a row on the working queue at
// all, so those are filtered out entirely rather than shown greyed
// out with an explanation nobody standing at the gate can act on.
//
// BR-12 (wrong collection day) is no longer missing: the server
// computes it per pallet and returns it in the gate view's
// eligibility object, which PalletCheck reads. It is not surfaced on
// the board because a pallet booked for another day should not be in
// this list in the first place — if one appears, opening it
// explains why.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import dispatchAPI from '../../../services/dispatchAPI';
import { Notice } from '../../staff/components/StepPrimitives';

// The four states a row can be in, and how each reads on the floor.
// Kept as one table so the label, the styling and the "can you open
// it?" decision cannot drift apart.
const STATE = {
  awaiting:       { label: 'Waiting for collection', tone: '',           openable: true  },
  collected:      { label: 'Collected',              tone: ' is-static', openable: false },
  late_collected: { label: 'Collected (late)',       tone: ' is-static', openable: false },
  // Openable. The 16:00 sweep records that a day ended without this
  // pallet leaving; it does not put the pallet out of reach. A driver
  // arriving at 16:40 is collecting the same food off the same floor,
  // so the row opens and the collection runs normally — it is filed
  // as 'late_collected' afterwards. Marked warn so it still reads as
  // an exception on the board, but not is-static, which is what made
  // it un-tappable.
  not_collected:  { label: 'Not collected',          tone: ' is-warn',   openable: true  },
  cancelled:      { label: 'Cancelled',              tone: ' is-static', openable: false },
};

const stateOf = (row) => STATE[row.dispatch_status] || STATE.awaiting;

// Time formatted for a glance, not a report.
const timeOf = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
};

export default function GateQueue({ onOpenPallet }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;

    dispatchAPI.getGateQueue()
      .then((board) => {
        if (cancelled) return;
        // Hide a centre with nothing outstanding — see the header
        // comment above. A completed dispatch is kept regardless of
        // the centre's current status.
        const visible = (board || []).filter((row) =>
          row.ecd_is_active !== false ||
          ['collected', 'late_collected'].includes(row.dispatch_status)
        );
        setRows(visible);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the gate queue.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const done    = rows.filter((r) => ['collected', 'late_collected'].includes(r.dispatch_status));
  const waiting = rows.filter((r) => stateOf(r).openable);

  const summary = rows.length === 0
    ? 'Nothing waiting for collection.'
    : `${done.length} of ${rows.length} collected · ${waiting.length} still waiting`;

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>At the gate</h1>
        <p className="stf-step-sub">{summary}</p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {loading ? (
        <div className="stf-skeleton" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="stf-empty">No pallets are waiting for collection.</div>
      ) : (
        <div className="stf-list">
          {rows.map((row) => {
            const state    = stateOf(row);
            const openable = state.openable;
            const at       = timeOf(row.collected_at);

            // What the second line says, in order of what matters
            // most to someone standing at a gate.
            let meta;
            if (row.dispatch_status === 'not_collected') {
              meta = 'Awaiting late collection. Written off at 16:00.';
            } else if (at) {
              meta = `${state.label} at ${at}${row.driver_name ? ` · ${row.driver_name}` : ''}`;
              // The centre going inactive afterwards doesn't rewrite
              // this pallet's history — it's shown here purely as
              // information, never as a reason to hide a completed row.
              if (row.ecd_is_active === false) meta += ' · Centre now inactive';
            } else {
              const flags = [];
              if (Number(row.flagged_items) > 0)  flags.push(`${row.flagged_items} flagged`);
              if (Number(row.variance_items) > 0) flags.push(`${row.variance_items} short or over`);
              meta = [`${row.total_items} items ready for dispatch`, ...flags].join(' · ');
            }

            const open = () => onOpenPallet(row.picking_slip_id);

            return (
              <div
                key={row.picking_slip_id}
                className={`stf-row${state.tone}`}
                role={openable ? 'button' : undefined}
                tabIndex={openable ? 0 : undefined}
                onClick={openable ? open : undefined}
                onKeyDown={
                  openable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                      }
                    : undefined
                }
              >
                <span className="stf-row-main">
                  <span className="stf-row-title">
                    {row.ecd_name}
                    {row.pallet_ref ? ` · ${row.pallet_ref}` : ''}
                  </span>
                  <span className="stf-row-meta">{meta}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
