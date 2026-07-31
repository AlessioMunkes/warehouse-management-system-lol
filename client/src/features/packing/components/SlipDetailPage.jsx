// client/src/features/packing/SlipDetailPage.jsx
import {  useState, useCallback } from 'react';
import  {pickingApi}  from '../../../services/pickingAPI';
import StatusBadge from './StatusBadge';
import ItemRow from './ItemRow';
import CompleteSlipBar from './CompleteSlipBar'

const cohortLabel = (c) => (c === 'week1' ? 'Week 1' : 'Week 2');

export default function SlipDetailPage({ slipId, user, onBack }) {
  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isManager = user?.role === 'manager' || user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pickingApi.getSlip(slipId);
      setSlip(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slipId]);

 // useEffect(() => { load(); }, [load]);

  if (loading) return <div className="slip-detail__loading">Loading pallet…</div>;
  if (error) return <div className="slip-detail__error">{error}</div>;
  if (!slip) return null;

  const isMine = slip.assigned_to === user.id;
  const canEdit = isManager || isMine;
  const isLocked = slip.status === 'complete';
  const pendingCount = slip.items.filter((i) => i.status === 'pending').length;

  const handleClaim = async () => {
    try {
      await pickingApi.assignSlip(slip.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirm = (itemId, packedQuantity) =>
    pickingApi.confirmItem(slip.id, itemId, { packedQuantity }).then(load);

  const handleFlag = (itemId, flagReason, packedQuantity) =>
    pickingApi.flagItem(slip.id, itemId, { flagReason, packedQuantity }).then(load);

  const handleComplete = (body) => pickingApi.completeSlip(slip.id, body).then((result) => {
    load();
    return result;
  });

  return (
    <div className="slip-detail">
      <button className="slip-detail__back" onClick={onBack}>← Back to board</button>

      <div className="slip-detail__card">
        <div className="slip-detail__header">
          <div>
            <h1>{slip.ecd_name}</h1>
            <p className="slip-detail__meta">
              {cohortLabel(slip.cohort)} · {slip.child_count} children ·{' '}
              {new Date(slip.dispatch_date).toLocaleDateString()}
              {slip.contact_name ? ` · Contact: ${slip.contact_name}` : ''}
            </p>
          </div>
          <StatusBadge status={slip.status} />
        </div>

        {!slip.assigned_to && !isLocked && (
          <button className="btn btn--primary slip-detail__claim" onClick={handleClaim}>
            Claim this pallet
          </button>
        )}
        {slip.assigned_to && (
          <p className="slip-detail__packer">
            Packing: {slip.packer_name}{isMine ? ' (you)' : ''}
          </p>
        )}

        <div className="slip-detail__items">
          {slip.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              locked={isLocked}
              canEdit={canEdit}
              onConfirm={handleConfirm}
              onFlag={handleFlag}
            />
          ))}
        </div>

        {canEdit && (
          <CompleteSlipBar slip={slip} pendingCount={pendingCount} onComplete={handleComplete} />
        )}
      </div>
    </div>
  );
}