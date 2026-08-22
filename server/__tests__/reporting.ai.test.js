// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.ai.test.js
//
// The tool schema is generated from the catalog, so the thing worth
// testing is that the two cannot drift: every metric reachable, no
// enum containing something the validator would reject.
//
// No network. No mocked provider either — these are pure functions
// over the catalog, which is exactly why the schema is generated
// rather than hand-written.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { buildTools, buildSystemPrompt } from '../src/features/reporting/ai/toolSchema.js';
import { validateSpec } from '../src/features/reporting/specValidator.js';
import {
  METRIC_IDS, METRICS, COHORTS, BENEFICIARY_KINDS,
} from '../src/features/reporting/reportCatalog.js';

const tools = buildTools();
const runReport = tools.find((t) => t.name === 'run_report');
const clarify   = tools.find((t) => t.name === 'ask_clarification');

describe('tool schema is generated from the catalog', () => {
  it('declares both functions', () => {
    expect(runReport).toBeDefined();
    expect(clarify).toBeDefined();
  });

  it('offers exactly the catalog metrics, no more and no fewer', () => {
    expect(runReport.parameters.properties.metric.enum.sort())
      .toEqual([...METRIC_IDS].sort());
  });

  it('requires a metric and both dates', () => {
    expect(runReport.parameters.required).toEqual(
      expect.arrayContaining(['metric', 'date_from', 'date_to'])
    );
  });

  it('uses the real enum values from the database', () => {
    expect(runReport.parameters.properties.cohort.enum).toEqual(COHORTS);
    expect(runReport.parameters.properties.beneficiary_kind.enum).toEqual(BENEFICIARY_KINDS);
  });

  it('only offers dimensions some metric actually declares', () => {
    const declared = new Set(Object.values(METRICS).flatMap((m) => m.dimensions));
    for (const d of runReport.parameters.properties.dimension.enum) {
      expect(declared.has(d)).toBe(true);
    }
  });
});

describe('every metric the model can name is runnable', () => {
  // Guards the failure this whole design exists to prevent: the
  // model naming something the validator then rejects.
  it('validates for each enum value with its own default breakdown', () => {
    for (const id of runReport.parameters.properties.metric.enum) {
      expect(() => validateSpec({
        metric: id,
        dateRange: { from: '2026-06-01', to: '2026-08-01' },
      })).not.toThrow();
    }
  });
});

describe('system prompt', () => {
  const prompt = buildSystemPrompt('2026-08-22');

  it('states today so relative dates can be resolved', () => {
    expect(prompt).toContain('2026-08-22');
  });

  it('describes every available report', () => {
    for (const id of METRIC_IDS) expect(prompt).toContain(id);
  });

  it('carries the domain rules the schema cannot express', () => {
    expect(prompt).toMatch(/fortnightly/i);
    expect(prompt).toMatch(/week1/);
    expect(prompt).toMatch(/late/i);
  });
});
