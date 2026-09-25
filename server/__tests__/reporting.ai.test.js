// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.ai.test.js
//
// The tool schema is generated from the catalog, so what is worth
// testing is that the two cannot drift: every metric reachable, no
// enum holding something the validator would reject.
//
// No network and no database — these are pure functions over the
// catalog, which is exactly why the schema is generated rather than
// hand-written.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { buildTools, buildSystemPrompt } from '../src/features/reporting/ai/toolSchema.js';
import { validateSpec } from '../src/features/reporting/specValidator.js';
import {
  METRIC_IDS, METRICS, COHORTS, BENEFICIARY_KINDS, MOVEMENT_TYPES, isSnapshot,
} from '../src/features/reporting/reportCatalog.js';

const tools = buildTools();
const runReport = tools.find((t) => t.name === 'run_report');
const clarify   = tools.find((t) => t.name === 'ask_clarification');
const RANGE = { from: '2026-06-01', to: '2026-08-01' };

describe('tool schema is generated from the catalog', () => {
  it('declares both functions', () => {
    expect(runReport).toBeDefined();
    expect(clarify).toBeDefined();
  });

  // The ask box is operations-only — see toolSchema.js's own header
  // note. Impact metrics (children_reached, meals_enabled,
  // adults_reached, paper_saved, compost_processed) must NOT be
  // reachable here, so this asserts the catalog's operational subset,
  // not the full catalog.
  it('offers exactly the catalog\'s operational metrics, no impact metrics', () => {
    const operationalIds = Object.values(METRICS).filter((m) => !m.impactOnly).map((m) => m.id);
    expect(runReport.parameters.properties.metric.enum.sort())
      .toEqual(operationalIds.sort());

    const impactIds = Object.values(METRICS).filter((m) => m.impactOnly).map((m) => m.id);
    expect(impactIds.length).toBeGreaterThan(0); // the exclusion is only meaningful if some exist
    for (const id of impactIds) {
      expect(runReport.parameters.properties.metric.enum).not.toContain(id);
    }
  });

  // Dates cannot be required any more: snapshot metrics are the
  // current position and take no range at all. The prompt tells the
  // model which reports need dates; the schema cannot.
  it('requires a metric, and only a metric', () => {
    expect(runReport.parameters.required).toEqual(['metric']);
  });

  it('still offers both date parameters for period reports', () => {
    expect(runReport.parameters.properties.date_from).toBeDefined();
    expect(runReport.parameters.properties.date_to).toBeDefined();
  });

  it('uses the real enum values from the database', () => {
    expect(runReport.parameters.properties.cohort.enum).toEqual(COHORTS);
    expect(runReport.parameters.properties.beneficiary_kind.enum).toEqual(BENEFICIARY_KINDS);
    expect(runReport.parameters.properties.movement_type.enum).toEqual(MOVEMENT_TYPES);
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
  it('validates for each enum value with its own defaults', () => {
    for (const id of runReport.parameters.properties.metric.enum) {
      expect(() => validateSpec({ metric: id, dateRange: RANGE }), id).not.toThrow();
    }
  });

  it('validates snapshot metrics with no dates supplied', () => {
    for (const m of Object.values(METRICS).filter(isSnapshot)) {
      expect(() => validateSpec({ metric: m.id }), m.id).not.toThrow();
    }
  });
});

describe('system prompt', () => {
  const prompt = buildSystemPrompt('2026-08-22');

  it('states today so relative dates can be resolved', () => {
    expect(prompt).toContain('2026-08-22');
  });

  // Every metric id appears somewhere in the prompt — the operational
  // ones as answerable reports, the impact ones (still checked via
  // METRIC_IDS, the full set) in the redirect section below, so the
  // model at least recognises the name even though it cannot run it.
  it('mentions every metric id, operational or impact', () => {
    for (const id of METRIC_IDS) expect(prompt).toContain(id);
  });

  it('tells the model impact metrics are out of scope and to redirect instead of guessing', () => {
    expect(prompt).toMatch(/IMPACT REPORTS ARE OUT OF SCOPE/);
    expect(prompt).toMatch(/Impact Calculator/);
  });

  it('separates period reports from live ones', () => {
    expect(prompt).toMatch(/LIVE REPORTS/);
    expect(prompt).toMatch(/Do NOT send dates/);
  });

  it('carries the domain rules the schema cannot express', () => {
    expect(prompt).toMatch(/fortnightly/i);
    expect(prompt).toMatch(/week1/);
    expect(prompt).toMatch(/late/i);
  });

  it('distinguishes goods coming in from goods going out', () => {
    expect(prompt).toMatch(/receiving/i);
    expect(prompt).toMatch(/dispatch/i);
  });

  it('tells the model that donor-level reporting does not exist', () => {
    expect(prompt).toMatch(/aggregate only/i);
  });
});
