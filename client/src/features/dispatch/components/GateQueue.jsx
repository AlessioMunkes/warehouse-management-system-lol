// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/GateQueue.jsx
//
// Today's staged pallets, waiting at the gate. Built entirely on the
// picking endpoints (dispatchAPI.getGateQueue) — a pallet staged for
// collection is simply a picking slip with status 'complete'.
//
// An inactive ECD is shown, not hidden, but cannot be opened (BR-11) —
// staff need to see why nothing is going to that centre today, not
// wonder where its row went.
//
// NOT implemented here, deliberately: the "wrong collection day needs
// manager approval" rule (BR-12). That needs the active cohort for a
// date, which today only exists inside picking.service.js's slip-
// generation validation, with no endpoint exposing it. Worth adding
// later; out of scope for this pass.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import dispatchAPI from '../../../services/dispatchAPI';
import { fetchPickingSlips } from '../../../services/pickingAPI';
import { Notice } from '../../staff/components/StepPrimitives';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function GateQueue({ onOpenPallet }) {
  const [staged, setStaged] = useState([]);
  const [collectedToday, setCollectedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const date = todayISO();

    Promise.all([
      dispatchAPI.getGateQueue(date),
      fetchPickingSlips({ dispatchDate: date, status: 'collected' }),
    ])
      .then(([queue, collected]) => {
        if (cancelled) return;
        setStaged(queue || []);
        setCollectedToday((collected || []).length);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the gate queue.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const totalToday = staged.length + collectedToday;

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>At the gate</h1>
        <p className="stf-step-sub">
          {totalToday > 0 ? `${collectedToday} of ${totalToday} collected today` : 'Nothing staged for today yet.'}
        </p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {loading ? (
        <div className="stf-skeleton" aria-label="Loading" />
      ) : staged.length === 0 ? (
        <div className="stf-empty">No pallets are staged for collection right now.</div>
      ) : (
        <div className="stf-list">
          {staged.map((slip) => {
            const openable = slip.ecd_is_active !== false;
            return (
              <div
                key={slip.id}
                className={`stf-row${openable ? '' : ' is-warn is-static'}`}
                role={openable ? 'button' : undefined}
                tabIndex={openable ? 0 : undefined}
                onClick={openable ? () => onOpenPallet(slip.id) : undefined}
                onKeyDown={
                  openable
                    ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPallet(slip.id); } }
                    : undefined
                }
              >
                <span className="stf-row-main">
                  <span className="stf-row-title">{slip.ecd_name}</span>
                  <span className="stf-row-meta">
                    {openable
                      ? `Pallet staged · ${slip.total_items} items`
                      : 'This centre is not active, so nothing can go out today.'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
