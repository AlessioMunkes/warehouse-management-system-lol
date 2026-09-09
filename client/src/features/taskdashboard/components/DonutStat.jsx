// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/DonutStat.jsx
//
// Hand-rolled SVG, same convention ReportChart.jsx already
// established for this codebase (no charting library) — small enough
// here that pulling one in for a single donut would cost more than
// it saves.
//
// A plain <ul> of the same numbers sits directly under the ring, not
// hidden behind a toggle — ReportChart.jsx's own accessibility note
// applies here too: colour alone must not be how the split is read.
// ─────────────────────────────────────────────────────────────
const SIZE = 120;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DonutStat({ segments, centerLabel, centerValue }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke="#e9e3dd" strokeWidth={STROKE}
        />
        {total > 0 ? segments.map((seg) => {
          const fraction = seg.value / total;
          const dash = fraction * CIRCUMFERENCE;
          const circle = (
            <circle
              key={seg.label}
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              fill="none" stroke={seg.color} strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          );
          offset += dash;
          return circle;
        }) : null}
        <text
          x="50%" y="48%" textAnchor="middle" dominantBaseline="middle"
          className="fill-[#2b3336]" style={{ fontSize: 22, fontWeight: 600 }}
        >
          {centerValue}
        </text>
        <text
          x="50%" y="65%" textAnchor="middle" dominantBaseline="middle"
          className="fill-muted-foreground" style={{ fontSize: 10 }}
        >
          {centerLabel}
        </text>
      </svg>

      <ul className="space-y-1.5 text-sm">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-medium">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
