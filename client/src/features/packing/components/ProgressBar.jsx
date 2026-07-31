// client/src/features/packing/components/ProgressBar.jsx


export default function ProgressBar({ total = 0, confirmed = 0, flagged = 0 }) {
  const done = confirmed + flagged;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="progress">
      <div className="progress__track">
        <div className="progress__confirmed" style={{ width: `${total ? (confirmed / total) * 100 : 0}%` }} />
        <div
          className="progress__flagged"
          style={{ width: `${total ? (flagged / total) * 100 : 0}%` }}
        />
      </div>
      <span className="progress__label">{done}/{total} · {pct}%</span>
    </div>
  );
}