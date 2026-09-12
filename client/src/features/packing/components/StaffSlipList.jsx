// ─────────────────────────────────────────────────────────────
// client/src/features/packing/components/StaffSlipList.jsx
//
// The packer's own board: assigned to me, spare slips waiting to be
// claimed, and what's already done. Opens on "assigned to me", not
// the whole warehouse queue — the manager's board (PackingBoard.jsx,
// still at /noc/packing) is where every filter and every slip lives.
//
// "Spare" has no dedicated query param on the API — a slip is spare
// simply because assigned_to is null — so it's a second fetch of the
// unfiltered board, filtered here. Two small requests rather than
// growing the API for a distinction the client can compute itself.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import useListSearch from '../../staff/hooks/useListSearch';
import ListTools, { NoMatches } from '../../staff/components/ListTools';
import { fetchPickingSlips, assignSlip } from '../../../services/pickingAPI';
import { Notice } from '../../staff/components/StepPrimitives';
import Paged from '../../staff/components/Paged';
import usePaged from '../../staff/hooks/usePaged';

const COHORT_LABELS = { week1: 'Week 1', week2: 'Week 2' };

// Centre and packer. Module level so its identity is stable.
const slipText = (slip) => [slip.ecd_name, slip.packer_name].filter(Boolean).join(' ');
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

const TABS = [
  { key: 'mine', label: 'Assigned to me' },
  { key: 'spare', label: 'Spare slips' },
  { key: 'done', label: 'Done' },
];

export default function StaffSlipList({ onOpenSlip }) {
  const [tab, setTab] = useState('mine');
  const [mineSlips, setMineSlips] = useState([]);
  const [allSlips, setAllSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claimingId, setClaimingId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchPickingSlips({ mine: true }), fetchPickingSlips({})])
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
  const spare = allSlips.filter((s) => !s.assigned_to && s.status === 'pending');

  const rows = tab === 'mine' ? active : tab === 'spare' ? spare : done;
  const counts = { mine: active.length, spare: spare.length, done: done.length };
  // The tabs are the filter this screen already had; search narrows
  // whichever one is open.
  const search = useListSearch(rows, slipText);

  // usePaged clamps when the list shrinks, which is what stops a
  // switch from a long tab to a short one — or a search that matches
  // two rows — landing on an empty page 3 with nothing to explain it.
  const paged = usePaged(search.filtered);

  const handleClaim = async (e, slipId) => {
    e.stopPropagation();
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
          placeholder="Search by centre or packer"
        />
      ) : null}

      {loading ? (
        <div className="stf-skeleton" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="stf-empty">
          {tab === 'mine' && 'Nothing assigned to you yet — waiting for slips from your manager, or claim one from Spare slips.'}
          {tab === 'spare' && 'No spare pallets right now. Check back once your manager assigns the next batch.'}
          {tab === 'done' && "Nothing finished yet today — completed and collected pallets will show up here."}
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
            const badge = badgeFor(slip);
            const gap = daysSinceCollection(slip.last_collected_date, slip.dispatch_date);
            const missed = !slip.last_collected_date || (gap !== null && gap >= MISSED_COLLECTION_DAYS);
            const isSpare = tab === 'spare';
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
                    {missed && !isDone ? ' · Not collected in a while' : ''}
                  </span>
                </span>
                <span className={badge.className}>{badge.label}</span>
                {isSpare ? (
                  <button
                    type="button"
                    className="stf-btn stf-btn-secondary"
                    onClick={(e) => handleClaim(e, slip.id)}
                    disabled={claimingId === slip.id}
                  >
                    {claimingId === slip.id ? 'Claiming…' : 'Claim pallet'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Paged {...paged} noun="pallets" />
    </div>
  );
}
