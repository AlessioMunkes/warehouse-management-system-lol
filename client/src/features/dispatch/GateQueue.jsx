// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/GateQueue.jsx
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
import useListSearch from '../staff/useListSearch';
import ListTools, { FilterSegments, NoMatches } from '../staff/ListTools';
import dispatchAPI from '../../services/dispatchAPI';
import { Notice } from '../staff/StepPrimitives';
import Paged from '../staff/Paged';
import usePaged from '../staff/usePaged';

// What a row is, in the gate's own words: a pallet is awaiting dispatch,
// dispatched, or late. Late means its day's cut-off passed with nobody
// to take it; it is still on the floor and can still go, so it opens
// like any other. Kept as one table so the tab, the styling and the
// "can you open it?" decision cannot drift apart.
const STATE = {
  awaiting:       { tab: 'awaiting',   tone: '',           openable: true  },
  collected:      { tab: 'dispatched', tone: ' is-static', openable: false },
  late_collected: { tab: 'dispatched', tone: ' is-static', openable: false },
  not_collected:  { tab: 'late',       tone: ' is-warn',   openable: true  },
  cancelled:      { tab: null,         tone: ' is-static', openable: false },
};

const stateOf = (row) => STATE[row.dispatch_status] || STATE.awaiting;

// Centre, pallet reference, driver and cohort in one haystack. At a
// gate the thing a worker has been told is usually one of those and
// never reliably the same one: a driver says a name, a note says a
// pallet number. Module level, so its identity is stable and
// useListSearch's memo holds.
const searchText = (row) => [
  row.ecd_name, row.pallet_ref, row.driver_name, row.cohort,
].filter(Boolean).join(' ');

// The day a pallet is booked for, short: "Tue, 13 Oct". Read in the
// warehouse's timezone, not the tablet's.
const dayOf = (row) => {
  if (!row.dispatch_date) return null;
  const d = new Date(row.dispatch_date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-ZA', {
    timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short',
  });
};

const timeOf = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
};

// The second line of a row: the pallet's own number first, then the one
// thing worth knowing about it. Being on this list already says the
// pallet is ready, so the row does not say so again. It used to carry a
// countdown to "the 16:00 cut-off" on every row; the hour is a setting
// (and was not 16:00), and twenty-seven copies of one clock told nobody
// anything the tab does not.
const metaOf = (row) => {
  const state = stateOf(row);
  const at = timeOf(row.collected_at);
  const parts = [row.pallet_ref];
  if (state.tab === 'late') {
    parts.push('Missed its cut-off');
  } else if (at) {
    parts.push(row.dispatch_status === 'late_collected' ? `Late, ${at}` : at, row.driver_name);
    // The centre going inactive afterwards does not rewrite this
    // pallet's history; it is information, never a reason to hide it.
    if (row.ecd_is_active === false) parts.push('Centre now inactive');
  } else {
    parts.push(dayOf(row));
    if (Number(row.flagged_items) > 0)  parts.push(`${row.flagged_items} flagged`);
    if (Number(row.variance_items) > 0) parts.push(`${row.variance_items} short or over`);
  }
  return parts.filter(Boolean).join(' · ');
};

const EMPTY = {
  awaiting:   'No pallets awaiting dispatch.',
  late:       'No late pallets.',
  dispatched: 'Nothing dispatched today.',
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
        // Everything still to go, and anything already gone. A centre
        // that has since gone inactive keeps its dispatched rows and
        // loses the ones that can no longer be released to it.
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

  const count = (tab) => rows.filter((r) => stateOf(r).tab === tab).length;

  const search = useListSearch(rows, searchText);
  // Opens on what there is to do. There is no "All": the three tabs
  // between them are everything, and a search looks across all three.
  const [only, setOnly] = useState('awaiting');

  const visible = search.searching
    ? search.filtered
    : rows.filter((row) => stateOf(row).tab === only);

  const paged = usePaged(visible);

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>At the gate</h1>
        <p className="stf-step-sub">Hand each pallet to its driver.</p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {!loading && rows.length > 0 ? (
        <ListTools
          id="stf-gate-search"
          query={search.query}
          onQuery={search.setQuery}
          placeholder="Search by centre, pallet or driver"
        >
          <FilterSegments
            label="Show"
            value={only}
            onChange={setOnly}
            options={[
              { key: 'awaiting',   label: 'Awaiting dispatch', count: count('awaiting') },
              { key: 'late',       label: 'Late',              count: count('late') },
              { key: 'dispatched', label: 'Dispatched',        count: count('dispatched') },
            ]}
          />
        </ListTools>
      ) : null}

      {loading ? (
        <div className="stf-skeleton" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="stf-empty">{EMPTY.awaiting}</div>
      ) : visible.length === 0 && search.searching ? (
        <NoMatches
          query={search.query}
          onClear={() => search.setQuery('')}
          noun="pallets"
        />
      ) : visible.length === 0 ? (
        <div className="stf-empty">{EMPTY[only]}</div>
      ) : (
        <div className="stf-list">
          {paged.slice.map((row) => {
            const state    = stateOf(row);
            const openable = state.openable;
            const meta     = metaOf(row);
            const open     = () => onOpenPallet(row.picking_slip_id);

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
                  <span className="stf-row-title">{row.ecd_name}</span>
                  {meta ? <span className="stf-row-meta">{meta}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Paged {...paged} noun="pallets" />
    </section>
  );
}
