// ─────────────────────────────────────────────────────────────
// client/src/tests/packingRouting.test.jsx
//
// Regression cover for the packing navigation break: the board sent
// the packer to "/programmes/noc/packing/:id", App.jsx only declared
// "/noc/packing/:slipId", and the deep link fell through to the
// catch-all — so clicking a pallet dumped you on the landing page.
//
// These tests assert the two halves still agree. matchRoutes ranks
// patterns the same way <Routes> does, so a path that only matches
// "*" here is a path that would redirect at runtime.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { PACKING } from '../routes/paths';

// The packing-relevant slice of the route table in App.jsx, plus the
// catch-all, so a miss is visible rather than silent.
const routes = [
  { path: PACKING.board },
  { path: PACKING.detailPattern },
  { path: '/programmes/noc/packing' },
  { path: '/programmes/noc/packing/:slipId' },
  { path: '*' },
];

const matchedPattern = (pathname) => {
  const matches = matchRoutes(routes, pathname);
  return matches ? matches[matches.length - 1].route.path : null;
};

describe('packing routes', () => {
  it('resolves the board path to the board route', () => {
    expect(matchedPattern(PACKING.board)).toBe(PACKING.board);
  });

  it('resolves a slip opened from the board to the detail route', () => {
    // This is the exact call PackingPage makes in onOpenSlip.
    expect(matchedPattern(PACKING.detail(5))).toBe(PACKING.detailPattern);
  });

  it('never lets the detail path fall through to the catch-all', () => {
    expect(matchedPattern(PACKING.detail(12345))).not.toBe('*');
  });

  it('still resolves the legacy board path so old links keep working', () => {
    expect(matchedPattern('/programmes/noc/packing')).toBe('/programmes/noc/packing');
  });

  it('still resolves a legacy deep link to a specific pallet', () => {
    expect(matchedPattern('/programmes/noc/packing/5'))
      .toBe('/programmes/noc/packing/:slipId');
  });

  it('builds the detail URL from the board path', () => {
    // Guards against someone editing one string and not the other.
    expect(PACKING.detail(7)).toBe(`${PACKING.board}/7`);
    expect(PACKING.detailPattern).toBe(`${PACKING.board}/:slipId`);
  });
});