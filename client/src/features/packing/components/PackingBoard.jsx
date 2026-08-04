// PackingBoard.jsx
// Board (list) view for Packing. Fetches slips matching the
// current filters, renders them as .po-card rows, and lets an
// unassigned slip be claimed inline. Navigation to the detail
// view is delegated to the parent via onOpenSlip, so this
// component has no router dependency of its own.

import { useState, useEffect } from "react";
import { fetchPickingSlips, assignSlip } from "../../../services/pickingAPI";

const COHORT_LABELS = { week1: "Week 1", week2: "Week 2" };

const STATUS_BADGE = {
  pending: { className: "badge badge-pending", label: "Pending" },
  in_progress: { className: "status-badge status-badge-warning", label: "In progress" },
  complete: { className: "badge badge-complete", label: "Complete" },
  cancelled: { className: "badge badge-inactive", label: "Cancelled" },
};

// A centre is on a fortnightly rotation, so ~14 days between
// collections is normal. Past three weeks it has missed at least one
// turn, which warehouse visit §4.1 says has to be visible and
// followed up rather than discovered after the fact.
const MISSED_COLLECTION_DAYS = 21;

function isManager(user) {
  return user?.role === "manager" || user?.role === "admin";
}

// Days between the last recorded collection and this slip's dispatch
// date. Returns null when we can't tell, so "unknown" and "overdue"
// stay distinguishable.
function daysSinceCollection(lastCollectedDate, dispatchDate) {
  if (!lastCollectedDate || !dispatchDate) return null;
  const last = new Date(lastCollectedDate);
  const due = new Date(dispatchDate);
  if (Number.isNaN(last.getTime()) || Number.isNaN(due.getTime())) return null;
  return Math.round((due - last) / (24 * 60 * 60 * 1000));
}

function CollectionWarning({ slip }) {
  const gap = daysSinceCollection(slip.last_collected_date, slip.dispatch_date);

  if (!slip.last_collected_date) {
    return <span className="badge badge-pending">No collection on record</span>;
  }
  if (gap !== null && gap >= MISSED_COLLECTION_DAYS) {
    const weeks = Math.floor(gap / 7);
    return (
      <span className="status-badge status-badge-warning">
        Not collected in {weeks} weeks
      </span>
    );
  }
  return null;
}

export default function PackingBoard({ currentUser, onOpenSlip }) {
  const manager = isManager(currentUser);

  const [filters, setFilters] = useState({
    dispatchDate: "",
    cohort: "",
    status: "",
    mine: false,
  });

  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claimingId, setClaimingId] = useState(null);

  // Bumped after a successful claim to trigger a refetch without
  // calling a setState-triggering function directly inside the
  // effect body (react-hooks/set-state-in-effect).
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSlips() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPickingSlips({
          dispatchDate: filters.dispatchDate,
          cohort: filters.cohort,
          status: filters.status,
          mine: !manager && filters.mine,
        });
        if (!cancelled) setSlips(data || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load picking slips.");
          setSlips([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSlips();

    return () => {
      cancelled = true;
    };
  }, [filters, manager, reloadToken]);

  const handleClaim = async (e, slipId) => {
    e.stopPropagation();
    setClaimingId(slipId);
    setError(null);
    try {
      await assignSlip(slipId);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setError(err.message || "Could not claim this pallet.");
    } finally {
      setClaimingId(null);
    }
  };

  // The card is a div with role="button", so it has to answer Enter
  // and Space the way a real button does. A lot of the volunteers on
  // this floor are older or use assistive tech (warehouse visit §1.3),
  // and without this they can focus a pallet but never open it.
  const handleCardKeyDown = (e, slipId) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenSlip(slipId);
    }
  };

  return (
    <div className="decanting-content">
      <div className="page-title-row">
        <h1 className="font-display text-2xl font-bold text-text">Packing</h1>
        <p className="text-sm text-text-sub">
          Claim a pallet, confirm what's packed, flag what's short.
        </p>
      </div>

      {error && (
        <div className="alert-error">
          <p>{error}</p>
        </div>
      )}

      <div className="form-grid-2 mb-6">
        <div className="form-group">
          <label className="form-label" htmlFor="dispatchDate">Dispatch date</label>
          <input
            id="dispatchDate"
            type="date"
            className="form-input"
            value={filters.dispatchDate}
            onChange={(e) => setFilters((f) => ({ ...f, dispatchDate: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="cohort">Cohort</label>
          <select
            id="cohort"
            className="form-select"
            value={filters.cohort}
            onChange={(e) => setFilters((f) => ({ ...f, cohort: e.target.value }))}
          >
            <option value="">All cohorts</option>
            <option value="week1">Week 1</option>
            <option value="week2">Week 2</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="status">Status</label>
          <select
            id="status"
            className="form-select"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {!manager && (
          <div className="form-group">
            <label className="form-label">My pallets</label>
            <label className="product-line-override-toggle">
              <input
                type="checkbox"
                checked={filters.mine}
                onChange={(e) => setFilters((f) => ({ ...f, mine: e.target.checked }))}
              />
              My pallets only
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-text-sub">Loading picking slips…</p>
      ) : slips.length === 0 ? (
        <div className="info-notice">
          <p>No picking slips match these filters. Try a different dispatch date.</p>
        </div>
      ) : (
        <div>
          {slips.map((slip) => {
            const badge = STATUS_BADGE[slip.status] || STATUS_BADGE.pending;
            const assignedToMe = slip.assigned_to === currentUser?.id;
            const unassigned = !slip.assigned_to;

            // Both come back from the board query. flagged_items are
            // lines the packer marked short or damaged; variance_items
            // are lines confirmed at a quantity other than the one the
            // slip asked for. Neither used to be shown, which meant a
            // pallet with problems looked identical to a clean one and
            // dispatch had no reason to check it twice.
            const flagged = Number(slip.flagged_items) || 0;
            const variance = Number(slip.variance_items) || 0;

            return (
              <div
                key={slip.id}
                className="po-card"
                onClick={() => onOpenSlip(slip.id)}
                onKeyDown={(e) => handleCardKeyDown(e, slip.id)}
                role="button"
                tabIndex={0}
                aria-label={`Open picking slip for ${slip.ecd_name}`}
              >
                <div>
                  <div className="po-card-id">{slip.ecd_name}</div>
                  <div className="po-card-meta">
                    {COHORT_LABELS[slip.cohort] || slip.cohort} · {slip.child_count} children ·{" "}
                    {slip.confirmed_items}/{slip.total_items} items packed ·{" "}
                    {slip.packer_name || "Unclaimed"}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <CollectionWarning slip={slip} />

                  {flagged > 0 && (
                    <span className="note-status-chip is-discrepancy">
                      {flagged} flagged
                    </span>
                  )}
                  {variance > 0 && (
                    <span className="note-status-chip is-discrepancy">
                      {variance} qty differs
                    </span>
                  )}

                  {assignedToMe && slip.status !== "complete" && (
                    <span className="badge badge-recorded">Assigned to you</span>
                  )}
                  <span className={badge.className}>{badge.label}</span>
                  {unassigned && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={(e) => handleClaim(e, slip.id)}
                      disabled={claimingId === slip.id}
                    >
                      {claimingId === slip.id ? "Claiming…" : "Claim pallet"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}