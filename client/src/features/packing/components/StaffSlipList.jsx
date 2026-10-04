// ─────────────────────────────────────────────────────────────
// client/src/features/packing/components/StaffSlipList.jsx
//
// The packer's own board: what's on the floor waiting to be claimed,
// what this worker has already claimed, and what's already done.
// Opens on "Assigned to floor" — a worker wants to see what's
// available to pick up before they see what they've already got —
// not the whole warehouse queue; the manager's board (PackingBoard.jsx,
// still at /noc/packing) is where every filter and every slip lives.
//
// "Spare" has no dedicated query param on the API — a slip is spare
// simply because assigned_to is null — so it's a second fetch,
// scoped to today via the existing dispatchDate filter, filtered
// here. Two small requests rather than growing the API for a
// distinction the client can compute itself.
//
// Spare slips render in the same stacked list "mine" and "done" use,
// each row ending in a Claim button instead of a status badge — a
// worker deciding what to pick up next wants to see the pallets, not
// pick a name off a dropdown. Scoped to today only — a slip scheduled
// for another day is not "available on the floor" yet, whatever else
// is spare. The instant a claim lands, the reload drops that slip out
// of the spare fetch entirely, so it's off this list for every other
// packer too.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import useListSearch from '../../staff/hooks/useListSearch';
import ListTools, { NoMatches } from '../../staff/components/ListTools';
import { fetchPickingSlips, assignSlip } from '../../../services/pickingAPI';
import { Notice } from '../../staff/components/StepPrimitives';
import Paged from '../../staff/components/Paged';
import usePaged from '../../staff/hooks/usePaged';
import { todayISO, isSpareSlip } from '../spareSlips';
import { volunteerHolder } from '../../pickingSlips/slipViews';

const COHORT_LABELS = { tuesday: 'Tuesday', thursday: 'Thursday' };

// Centre and packer. Module level so its identity is stable.
const slipText = (slip) => [slip.ecd_name, slip.packer_name, volunteerHolder(slip)].filter(Boolean).join(' ');
const DONE_STATUSES = ['complete', 'collected'];
const MISSED_COLLECTION_DAYS = 21; // same threshold as the manager board

function daysSinceCollection(lastCollectedDate, dispatchDate) {
  if (!lastCollectedDate || !dispatchDate) return null;
  const last = new Date(lastCollectedDate);
  const due = new Date(dispatchDate);
  if (Number.isNaN(last.getTime()) || Number.isNaN(due.getTime())) return null;
  return Math.round((due - last) / (24 * 60 * 60 * 1000));
}

function badgeFor(slip) {
  if (slip.status === 'collected') return { className: 'stf-badge is-done', label: 'Collected' };
  if (slip.status === 'complete') return { className: 'stf-badge is-done', label: 'Complete' };
  if (slip.status === 'in_progress') return { className: 'stf-badge is-active', label: 'In progress' };
  if (slip.status === 'cancelled') return { className: 'stf-badge', label: 'Cancelled' };
  return { className: 'stf-badge', label: 'Pending' };
}

// Floor, then claimed, then done — the three states a pallet actually
// moves through. "Assigned to floor" comes first: a worker opening
// Packing wants to see what's available to pick up before they see
// what they've already got. Same 'spare'/'mine' keys and data as
// before, only the labels and the order changed.
const TABS = [
  { key: 'spare', label: 'Assigned to floor' },
  { key: 'mine', label: 'Claimed by me' },
  { key: 'done', label: 'Done' },
];

export default function StaffSlipList({ onOpenSlip }) {
  const [tab, setTab] = useState('spare');
  const [mineSlips, setMineSlips] = useState([]);
  const [allSlips, setAllSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claimingId, setClaimingId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchPickingSlips({ mine: true }),
      fetchPickingSlips({ dispatchDate: todayISO() }),
    ])
      .then(([mine, all]) => {
        if (cancelled) return;
        setMineSlips(mine || []);
        setAllSlips(all || []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your pallets.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [reloadToken]);

  const active = mineSlips.filter((s) => !DONE_STATUSES.includes(s.status) && s.status !== 'cancelled');
  const done = mineSlips.filter((s) => DONE_STATUSES.includes(s.status));
  const spare = allSlips.filter(isSpareSlip);

  const rows = tab === 'mine' ? active : tab === 'spare' ? spare : done;
  const counts = { mine: active.length, spare: spare.length, done: done.length };
  // The tabs are the filter this screen already had; search narrows
  // whichever one is open.
  const search = useListSearch(rows, slipText);

  // usePaged clamps when the list shrinks, which is what stops a
  // switch from a long tab to a short one — or a search that matches
  // two rows — landing on an empty page 3 with nothing to explain it.
  const paged = usePaged(search.filtered);

  const handleClaim = async (slipId) => {
    setClaimingId(slipId);
    setError(null);
    try {
      await assignSlip(slipId);
      setTab('mine');
      setReloadToken((t) => t + 1);
    } catch (err) {
      setError(err.message || 'Could not claim this pallet.');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>Packing</h1>
        <p className="stf-step-sub">Claim a pallet, confirm what's packed, flag what's short.</p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <div className="stf-segments" role="tablist" aria-label="Pallet lists">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`stf-segment${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {!loading && rows.length > 0 ? (
        <ListTools
          id="stf-slip-search"
          query={search.query}
          onQuery={search.setQuery}
          placeholder={tab === 'spare' ? 'Search by centre' : 'Search by centre or packer'}
        />
      ) : null}

      {loading ? (
        <div className="stf-skeleton" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="stf-empty">
          {tab === 'mine' && "You haven't claimed anything yet. Claim one from Assigned to floor, or wait for your manager to assign one."}
          {tab === 'spare' && 'Nothing on the floor right now. Check back once your manager assigns the next batch.'}
          {tab === 'done' && 'Nothing finished yet today. Completed and collected pallets will show up here.'}
        </div>
      ) : search.filtered.length === 0 ? (
        <NoMatches
          query={search.query}
          onClear={() => search.setQuery('')}
          noun="pallets"
        />
      ) : (
        <div className="stf-list">
          {paged.slice.map((slip) => {
            // Spare rows aren't openable yet — nobody's working them —
            // so the row ends in a Claim button instead of the status
            // badge every assigned row gets.
            if (tab === 'spare') {
              return (
                <div key={slip.id} className="stf-row is-static">
                  <span className="stf-row-main">
                    <span className="stf-row-title">{slip.ecd_name}</span>
                    <span className="stf-row-meta">
                      {COHORT_LABELS[slip.cohort] || slip.cohort} · {slip.child_count} children
                    </span>
                  </span>
                  <button
                    type="button"
                    className="stf-btn stf-btn-primary"
                    onClick={() => handleClaim(slip.id)}
                    disabled={claimingId === slip.id}
                  >
                    {claimingId === slip.id ? 'Claiming…' : 'Claim'}
                  </button>
                </div>
              );
            }

            const badge = badgeFor(slip);
            const gap = daysSinceCollection(slip.last_collected_date, slip.dispatch_date);
            const missed = !slip.last_collected_date || (gap !== null && gap >= MISSED_COLLECTION_DAYS);
            const isDone = tab === 'done';

            return (
              <div
                key={slip.id}
                className={`stf-row${missed && !isDone ? ' is-warn' : ''}${isDone ? ' is-static' : ''}`}
                role={isDone ? undefined : 'button'}
                tabIndex={isDone ? undefined : 0}
                onClick={isDone ? undefined : () => onOpenSlip(slip.id)}
                onKeyDown={
                  isDone
                    ? undefined
                    : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSlip(slip.id); } }
                }
              >
                <span className="stf-row-main">
                  <span className="stf-row-title">{slip.ecd_name}</span>
                  <span className="stf-row-meta">
                    {COHORT_LABELS[slip.cohort] || slip.cohort} · {slip.child_count} children ·{' '}
                    {slip.confirmed_items}/{slip.total_items} items packed
                    {volunteerHolder(slip) ? ` · ${volunteerHolder(slip)}` : ''}
                    {missed && !isDone ? ' · Not collected in a while' : ''}
                  </span>
                </span>
                <span className={badge.className}>{badge.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <Paged {...paged} noun="pallets" />
    </div>
  );
}
