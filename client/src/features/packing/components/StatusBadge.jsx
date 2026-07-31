// client/src/features/packing/components/StatusBadge.jsx


const LABELS = {
  pending: 'Pending',
  in_progress: 'In progress',
  complete: 'Complete',
  cancelled: 'Cancelled',
  confirmed: 'Confirmed',
  flagged: 'Flagged',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {LABELS[status] || status}
    </span>
  );
}