// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/useChartMotion.js
//
// Whether a chart may animate its bars, lines and slices growing in.
//
// The app's "Reduce movement" switch (shellContext.js) sets a CSS
// attribute, which stops CSS transitions but not Recharts: Recharts
// animates in JavaScript, so every chart asks here instead. Off when
// the switch is on, or, outside the manager shell where there is no
// switch, when the device's saved setting or the operating system asks
// for less movement. Pass the answer to `isAnimationActive`.
// ─────────────────────────────────────────────────────────────
import { readStoredMotion, useReducedMotion } from '../../components/layout/shellContext';

export const useChartMotion = () => {
  const { reducedMotion } = useReducedMotion();
  return !(reducedMotion || readStoredMotion());
};
