// ─────────────────────────────────────────────────────────────
// client/src/features/packing/StaffSlipList.jsx
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
// scoped to the floor window (spareSlips.js) via the existing
// from/to filter, filtered here. Two small requests rather than growing the API for a
// distinction the client can compute itself.
//
// Spare slips render in the same stacked list "mine" and "done" use,
// each row ending in a Claim button instead of a status badge — a
// worker deciding what to pick up next wants to see the pallets, not
// pick a name off a dropdown. A slip is on the floor from the moment a
// manager creates it, not only on its dispatch day. The instant a claim lands, the reload drops that slip out
// of the spare fetch entirely, so it's off this list for every other
// packer too.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import useListSearch from '../staff/useListSearch';
import ListTools, { NoMatches } from '../staff/ListTools';
import { fetchPickingSlips, assignSlip } from '../../services/pickingAPI';
import { Notice } from '../staff/StepPrimitives';
import Paged from '../staff/Paged';
import usePaged from '../staff/usePaged';
import { floorWindow, isSpareSlip } from './spareSlips';
import { volunteerHolder, dayLabel } from '../pickingSlips/slipViews';
import { useT } from '../../translations';

const cohortLabel = (cohort, t) => (cohort === 'tuesday' || cohort === 'thursday' ? t(`day.${cohort}`) : cohort);

// Soup kitchens and test centres have no child count; say nothing rather
// than "· children" with the number missing.
const childCountNote = (count, t) => (count == null || count === '' ? '' : ` · ${t('common.children', { n: count })}`);

// The day a floor pallet goes out. The floor shows the whole week now,
// so the row has to say which day each one is for.
const goingOut = (slip, t) => {
  const day = slip.dispatch_date_iso ?? String(slip.dispatch_date ?? '').slice(0, 10);
  return day ? t('packing.goingOut', { day: dayLabel(day) }) : cohortLabel(slip.cohort, t);
};

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

function badgeFor(slip, t) {
  if (slip.status === 'collected') return { className: 'stf-badge is-done', label: t('status.collected') };
  if (slip.status === 'complete') return { className: 'stf-badge is-done', label: t('status.complete') };
  if (slip.status === 'in_progress') return { className: 'stf-badge is-active', label: t('status.inProgress') };
  if (slip.status === 'cancelled') return { className: 'stf-badge', label: t('status.cancelled') };
  return { className: 'stf-badge', label: t('status.pending') };
}

// Floor, then claimed, then done — the three states a pallet actually
// moves through. "Assigned to floor" comes first: a worker opening
// Packing wants to see what's available to pick up before they see
// what they've already got. Same 'spare'/'mine' keys and data as
// before, only the labels and the order changed.
const TABS = [
  { key: 'spare', label: 'packing.tab.floor' },
  { key: 'mine', label: 'packing.tab.mine' },
  { key: 'done', label: 'packing.tab.done' },
];

export default function StaffSlipList({ onOpenSlip }) {
  const [tab, setTab] = useState('spare');
  const [mineSlips, setMineSlips] = useState([]);
  const [allSlips, setAllSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claimingId, setClaimingId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const t = useT();

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchPickingSlips({ mine: true }),
      fetchPickingSlips(floorWindow()),
    ])
      .then(([mine, all]) => {
        if (cancelled) return;
        setMineSlips(mine || []);
        setAllSlips(all || []);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'packing.loadFailed');
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
      setError(err.message || 'packing.claimFailed');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>{t('packing.title')}</h1>
        <p className="stf-step-sub">{t('packing.sub')}</p>
      </div>

      {/* A key when the message is ours, the server's own words otherwise. */}
      {error ? <Notice tone="warn">{t(error)}</Notice> : null}

      <div className="stf-segments" role="tablist" aria-label={t('packing.lists')}>
        {TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            role="tab"
            aria-selected={tab === tabItem.key}
            className={`stf-segment${tab === tabItem.key ? ' is-active' : ''}`}
            onClick={() => setTab(tabItem.key)}
          >
            {t(tabItem.label)} ({counts[tabItem.key]})
          </button>
        ))}
      </div>

      {!loading && rows.length > 0 ? (
        <ListTools
          id="stf-slip-search"
          query={search.query}
          onQuery={search.setQuery}
          placeholder={tab === 'spare' ? t('packing.searchCentre') : t('packing.searchCentrePacker')}
        />
      ) : null}

      {loading ? (
        <div className="stf-skeleton" aria-label={t('common.loading')} />
      ) : rows.length === 0 ? (
        <div className="stf-empty">
          {tab === 'mine' && t('packing.empty.mine')}
          {tab === 'spare' && t('packing.empty.floor')}
          {tab === 'done' && t('packing.empty.done')}
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
                      {goingOut(slip, t)}{childCountNote(slip.child_count, t)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="stf-btn stf-btn-primary"
                    onClick={() => handleClaim(slip.id)}
                    disabled={claimingId === slip.id}
                  >
                    {claimingId === slip.id ? t('packing.claiming') : t('packing.claim')}
                  </button>
                </div>
              );
            }

            const badge = badgeFor(slip, t);
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
                    {cohortLabel(slip.cohort, t)}{childCountNote(slip.child_count, t)} ·{' '}
                    {t('packing.itemsPacked', { done: slip.confirmed_items, all: slip.total_items })}
                    {volunteerHolder(slip) ? ` · ${volunteerHolder(slip)}` : ''}
                    {missed && !isDone ? ` · ${t('packing.notCollected')}` : ''}
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
