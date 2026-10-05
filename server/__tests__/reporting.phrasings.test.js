// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.phrasings.test.js
//
// The keyword fallback (no AI) against the real phrasings in
// src/features/reporting/ai/phrasings.js. Pass marks are the scores
// it reached when they were set, so a change can only raise them:
// if one of these fails, a keyword or synonym edit made matching worse.
//
// The live model is measured separately — scripts/evalReportingQuestions.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { PHRASINGS, answerId } from '../src/features/reporting/ai/phrasings.js';
import { matchQuestion, rankReports } from '../src/features/reporting/ai/keywordFallback.js';

const TODAY = '2026-09-27';

const score = (set) => {
  let first = 0; let top3 = 0; const misses = [];
  for (const p of set) {
    const m = answerId(matchQuestion(p.q, TODAY));
    const ranked = [m, ...rankReports(p.q, { exclude: m, limit: 3 }).map(answerId)].filter(Boolean).slice(0, 3);
    if (p.expect.includes(m)) first += 1; else misses.push(`${p.q} → ${m ?? 'nothing'}`);
    if (ranked.some((r) => p.expect.includes(r))) top3 += 1;
  }
  return { first, top3, n: set.length, misses };
};

describe('keyword matching on real phrasings', () => {
  const tuned = PHRASINGS.filter((p) => !p.holdout);
  const holdout = PHRASINGS.filter((p) => p.holdout);

  it('gets the tuned phrasings right first time (all but five)', () => {
    const r = score(tuned);
    expect(r.first, r.misses.join('\n')).toBeGreaterThanOrEqual(tuned.length - 5);
  });

  it('always has the right answer in its top three for tuned phrasings', () => {
    expect(score(tuned).top3).toBe(tuned.length);
  });

  // Holdout questions were never used for tuning: this is the honest
  // number for new wording, held so it does not slip.
  it('does not get worse on the holdout phrasings (at least 4 of 10 first, 5 in the top three)', () => {
    const r = score(holdout);
    expect(r.first).toBeGreaterThanOrEqual(4);
    expect(r.top3).toBeGreaterThanOrEqual(5);
  });

  it('every expected answer names something that exists', async () => {
    const { METRICS } = await import('../src/features/reporting/reportCatalog.js');
    const { COMPARISONS } = await import('../src/features/reporting/reportComparisons.js');
    const { DATASETS } = await import('../src/features/reporting/customQuery.js');
    for (const p of PHRASINGS) {
      for (const e of p.expect) {
        const [kind, id] = e.includes(':') ? e.split(':') : ['metric', e];
        const exists = kind === 'comparison' ? COMPARISONS[id] : kind === 'custom' ? DATASETS[id] : METRICS[id];
        expect(exists, `${p.q} expects ${e}`).toBeTruthy();
      }
    }
  });
});
