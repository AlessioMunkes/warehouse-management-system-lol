// ─────────────────────────────────────────────────────────────
// Sparkline.jsx
//
// A 30-day stock level trace, drawn as inline SVG.
//
// Hand-rolled rather than pulling in a chart library, matching
// ReportChart.jsx and DonutStat.jsx — this is one polyline and the
// project already draws its own charts. A charting dependency for a
// 90x24 line would be the largest thing in the bundle.
//
// Colour follows DIRECTION, not value: stock going down is the thing
// a manager is scanning for. A flat line is muted, because "nothing
// changed" is neither good nor bad.
// ─────────────────────────────────────────────────────────────
const WIDTH  = 90;
const HEIGHT = 24;
const PAD    = 2;

export default function Sparkline({ points, unit = '' }) {
  // No series at all means this product has never moved — the server
  // omits those rather than sending thirty zeroes. A single point is
  // not a line.
  if (!Array.isArray(points) || points.length < 2) {
    return <span className="text-xs text-muted-foreground" aria-hidden="true">—</span>;
  }

  const first = points[0];
  const last  = points[points.length - 1];
  const min   = Math.min(...points);
  const max   = Math.max(...points);

  // A flat series has zero range; dividing by it puts every y at NaN
  // and the polyline disappears without an error. Draw it down the
  // middle instead.
  const range = max - min;
  const innerH = HEIGHT - PAD * 2;
  const innerW = WIDTH  - PAD * 2;

  const coords = points.map((value, i) => {
    const x = PAD + (i / (points.length - 1)) * innerW;
    const y = range === 0
      ? HEIGHT / 2
      : PAD + innerH - ((value - min) / range) * innerH;
    return [x, y];
  });

  const path = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = coords[coords.length - 1];

  const delta = last - first;
  const stroke = delta < 0 ? '#ef3a40' : delta > 0 ? '#2f855a' : '#9a9a9a';

  const round = (n) => Math.round(Number(n) * 100) / 100;
  const label =
    `${round(first)} to ${round(last)} ${unit}`.trim() +
    ` over ${points.length} days (${delta > 0 ? '+' : ''}${round(delta)})`;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      className="overflow-visible"
    >
      <title>{label}</title>
      <polyline
        points={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The trailing dot marks "you are here" — without it a line
          that ends flat reads as though the chart was cut off. */}
      <circle cx={lastX} cy={lastY} r="2" fill={stroke} />
    </svg>
  );
}
