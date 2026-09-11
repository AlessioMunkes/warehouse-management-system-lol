// ─────────────────────────────────────────────────────────────
// client/src/features/InventoryManagement/components/BalanceChart.jsx
//
// Stock balance over time, for one product.
//
// The series is derived rather than stored — see balanceSeries.js,
// which reconstructs it by walking today's on-hand back through the
// movement ledger.
//
// ONE SERIES, SO NO LEGEND
// The panel title says what this is. A legend box for a single line is
// furniture. The one thing that is direct-labelled is the endpoint,
// because "what is it now" is the question people open this with;
// every other value is on the crosshair and, more importantly, in the
// figures directly above the chart — the chart never gates a number.
//
// The dashed rule is the reorder threshold. Dashes are noise on a
// gridline but they are the right signal for an actual threshold, which
// is what this is: everything below the line is a reorder.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { buildSeries } from '../balanceSeries';

// Brand ink and accent. Deliberately not the status red used for
// "Shortfall" badges elsewhere — this line is identity ("the balance"),
// not a judgement about it.
const LINE   = '#ef3a40';
const GRID   = '#e9e3dd';
const INK    = '#2b3336';
const MUTED  = '#676767';

const PAD = { top: 12, right: 56, bottom: 22, left: 8 };
const H = 150;

const fmtDate = (t) => new Date(t).toLocaleDateString('en-ZA', {
  day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg',
});

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function BalanceChart({ movements, onHand, reorderAt = 0, unit = '', width = 560 }) {
  const points = useMemo(() => buildSeries(movements, onHand), [movements, onHand]);
  const [hover, setHover] = useState(null);

  if (points.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[#676767]">
        No movements recorded yet, so there is no history to plot.
      </p>
    );
  }

  const innerW = Math.max(120, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;

  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.v);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  // The threshold is part of the picture: a balance that never comes
  // near it should still show how far away it is.
  const vMax = Math.max(...vs, Number(reorderAt) || 0, 1);
  const vMin = Math.min(...vs, 0);
  const vSpan = vMax - vMin || 1;

  const x = (t) => PAD.left + (tMax === tMin ? innerW : ((t - tMin) / (tMax - tMin)) * innerW);
  const y = (v) => PAD.top + innerH - ((v - vMin) / vSpan) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points[points.length - 1].t).toFixed(1)},${y(vMin).toFixed(1)} L${x(points[0].t).toFixed(1)},${y(vMin).toFixed(1)} Z`;

  const last = points[points.length - 1];
  const thresholdY = y(Number(reorderAt) || 0);
  const active = hover !== null ? points[hover] : null;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        // width 100% with a FIXED height letterboxes the plot: the
        // default preserveAspectRatio fits the viewBox inside the box,
        // so in a 624px container the 560-unit drawing renders at scale
        // 1 with 32px of dead space down each side. Letting the height
        // follow the width keeps the aspect ratio and fills the panel.
        role="img"
        aria-label={`Stock balance over time. Now ${fmtNum(last.v)} ${unit}.`}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none' }}
      >
        {/* Hairline grid, solid — dashes here would read as a threshold,
            and there is a real one further down that needs to own that. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left} x2={PAD.left + innerW}
            y1={PAD.top + innerH * f} y2={PAD.top + innerH * f}
            stroke={GRID} strokeWidth="1"
          />
        ))}

        <path d={area} fill={LINE} fillOpacity="0.08" />
        <path d={line} fill="none" stroke={LINE} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />

        {(Number(reorderAt) || 0) > 0 ? (
          <>
            <line
              x1={PAD.left} x2={PAD.left + innerW}
              y1={thresholdY} y2={thresholdY}
              stroke={MUTED} strokeWidth="1" strokeDasharray="4 4"
            />
            <text x={PAD.left + innerW + 6} y={thresholdY + 4}
                  fontSize="10" fill={MUTED}>
              reorder {fmtNum(Number(reorderAt))}
            </text>
          </>
        ) : null}

        {/* The endpoint, direct-labelled. The only value on the plot
            that gets a number of its own. */}
        <circle cx={x(last.t)} cy={y(last.v)} r="4"
                fill={LINE} stroke="#ffffff" strokeWidth="2" />
        <text x={x(last.t) + 8} y={y(last.v) + 4}
              fontSize="11" fontWeight="600" fill={INK}>
          {fmtNum(last.v)}{unit ? ` ${unit}` : ''}
        </text>

        {/* x-axis band, inside the viewBox so the container never has to
            grow a scrollbar to show it. */}
        <text x={PAD.left} y={H - 6} fontSize="10" fill={MUTED}>{fmtDate(tMin)}</text>
        <text x={PAD.left + innerW} y={H - 6} fontSize="10" fill={MUTED} textAnchor="end">
          {fmtDate(tMax)}
        </text>

        {active ? (
          <g pointerEvents="none">
            <line x1={x(active.t)} x2={x(active.t)} y1={PAD.top} y2={PAD.top + innerH}
                  stroke={INK} strokeWidth="1" strokeOpacity="0.25" />
            <circle cx={x(active.t)} cy={y(active.v)} r="4"
                    fill={LINE} stroke="#ffffff" strokeWidth="2" />
          </g>
        ) : null}

        {/* Nearest-point hit layer: one full-height band per point, so
            the target is the whole column rather than a 4px dot. */}
        {points.map((p, i) => {
          const bandW = innerW / points.length;
          return (
            <rect
              key={p.t + '-' + i}
              x={Math.max(0, x(p.t) - bandW / 2)} y={PAD.top}
              width={Math.max(bandW, 8)} height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
      </svg>

      <figcaption className="mt-1 min-h-5 text-xs text-[#676767]">
        {active
          ? `${fmtDate(active.t)} · ${fmtNum(active.v)}${unit ? ` ${unit}` : ''}` +
            (active.movement
              ? ` · ${active.movement.movementType?.replace(/_/g, ' ') ?? 'movement'}`
              : ' · now')
          : `Balance after each of the last ${points.length - (points[points.length - 1].movement ? 0 : 1)} movements.`}
      </figcaption>
    </figure>
  );
}
