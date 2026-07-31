// client/src/features/packing/components/SlipCard.jsx
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';

const cohortLabel = (c) => (c === 'week1' ? 'Week 1' : 'Week 2');

export default function SlipCard({ slip, onOpen, onClaim, currentUserId }) {
  const isUnassigned = !slip.assigned_to;
  const isMine = slip.assigned_to === currentUserId;

  return (
    <button className="slip-card" onClick={() => onOpen(slip.id)}>
      <div className="slip-card__top">
        <div>
          <div className="slip-card__ecd">{slip.ecd_name}</div>
          <div className="slip-card__meta">
            {cohortLabel(slip.cohort)} · {slip.child_count} children
          </div>
        </div>
        <StatusBadge status={slip.status} />
      </div>

      <ProgressBar
        total={Number(slip.total_items)}
        confirmed={Number(slip.confirmed_items)}
        flagged={Number(slip.flagged_items)}
      />

      <div className="slip-card__bottom">
        <span className="slip-card__packer">
          {slip.packer_name ? `Packing: ${slip.packer_name}` : 'Unclaimed'}
        </span>

        {isUnassigned && (
          <span
            className="slip-card__claim"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClaim(slip.id); }}
          >
            Claim pallet
          </span>
        )}
        {isMine && slip.status !== 'complete' && (
          <span className="slip-card__mine">Assigned to you</span>
        )}
      </div>
    </button>
  );
}