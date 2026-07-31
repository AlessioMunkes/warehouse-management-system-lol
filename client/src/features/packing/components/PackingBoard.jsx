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

function isManager(user) {
  return user?.role === "manager" || user?.role === "admin";
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

            return (
              <div
                key={slip.id}
                className="po-card"
                onClick={() => onOpenSlip(slip.id)}
                role="button"
                tabIndex={0}
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