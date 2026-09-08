// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.catalog.test.js
//
// Structural tests over the expanded catalog. No database, no
// network — these check that the catalog, the validator, the
// repository and the tool schema cannot drift apart, which is the
// failure mode a generated schema is meant to prevent.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';

// The repository is imported below to prove every repoFn exists, and
// it pulls in config/db.js, which calls process.exit(1) when it
// cannot reach Postgres. These are structural tests — they must run
// with no database, in CI and on a laptop with the server stopped.
vi.mock('../src/config/db.js', () => ({
  default: { query: vi.fn() },
}));

import {
  METRICS, METRIC_IDS, DIMENSIONS, FILTERS, CHART_TYPES, isSnapshot,
} from '../src/features/reporting/reportCatalog.js';
import { validateSpec } from '../src/features/reporting/specValidator.js';
import { buildTools, buildSystemPrompt } from '../src/features/reporting/ai/toolSchema.js';
import repo from '../src/repositories/reporting.repository.js';

const RANGE = { from: '2026-06-01', to: '2026-08-01' };

describe('catalog integrity', () => {
  it('every metric declares a repository function that exists', () => {
    for (const m of Object.values(METRICS)) {
      expect(typeof repo[m.repoFn], `${m.id} -> ${m.repoFn}`).toBe('function');
    }
  });

  it('every declared dimension and filter is defined', () => {
    for (const m of Object.values(METRICS)) {
      for (const d of m.dimensions) expect(DIMENSIONS[d], `${m.id}: ${d}`).toBeDefined();
      for (const f of m.filters)    expect(FILTERS[f],    `${m.id}: ${f}`).toBeDefined();
    }
  });

  it('every metric has a valid default chart, a unit, a caveat and a temporal mode', () => {
    for (const m of Object.values(METRICS)) {
      expect(CHART_TYPES).toContain(m.defaultChart);
      expect(m.unit).toBeTruthy();
      expect(m.caveat).toBeTruthy();
      expect(['range', 'snapshot']).toContain(m.temporal);
    }
  });

  // A ranked bar chart of one "Total" row is a rendering bug that
  // looks like a data bug. Collect every offender rather than
  // throwing on the first, so one run names them all.
  it('no metric defaults to a ranked chart over a single total row', () => {
    const bad = Object.values(METRICS)
      .filter((m) => m.dimensions[0] === 'none' && m.defaultChart === 'hbar')
      .map((m) => m.id);
    expect(bad).toEqual([]);
  });
});

describe('privacy is structural, not incidental', () => {
  // Guards the rule in reportCatalog.js: donation and volunteer
  // reporting is aggregate-only. If someone adds a donor or
  // volunteer breakdown, this fails.
  const FORBIDDEN = ['donor', 'caller', 'volunteer_name', 'full_name', 'tax_reference', 'contact'];

  it('no dimension exposes an individual', () => {
    for (const d of Object.keys(DIMENSIONS)) {
      for (const bad of FORBIDDEN) expect(d).not.toContain(bad);
    }
  });

  it('no filter exposes an individual', () => {
    for (const f of Object.keys(FILTERS)) {
      for (const bad of FORBIDDEN) expect(f).not.toContain(bad);
    }
  });
});

describe('validateSpec across the expanded set', () => {
  it('accepts every metric with its own defaults', () => {
    for (const id of METRIC_IDS) {
      expect(() => validateSpec({ metric: id, dateRange: RANGE }), id).not.toThrow();
    }
  });

  it('accepts every declared dimension for every metric', () => {
    for (const m of Object.values(METRICS)) {
      for (const d of m.dimensions) {
        expect(() => validateSpec({ metric: m.id, dimension: d, dateRange: RANGE }),
          `${m.id} / ${d}`).not.toThrow();
      }
    }
  });

  it('snapshots do not require dates and discard any given', () => {
    for (const m of Object.values(METRICS).filter(isSnapshot)) {
      const bare = validateSpec({ metric: m.id });
      expect(bare.dateRange).toBeNull();
      const withDates = validateSpec({ metric: m.id, dateRange: RANGE });
      expect(withDates.dateRange).toBeNull();
    }
  });

  it('range metrics still require dates', () => {
    for (const m of Object.values(METRICS).filter((x) => !isSnapshot(x))) {
      expect(() => validateSpec({ metric: m.id }), m.id).toThrow(/date range is required/i);
    }
  });
});

describe('tool schema stays in step with the catalog', () => {
  const tools = buildTools();
  const runReport = tools.find((t) => t.name === 'run_report');

  it('offers exactly the catalog metrics', () => {
    expect(runReport.parameters.properties.metric.enum.sort()).toEqual([...METRIC_IDS].sort());
  });

  it('only offers dimensions some metric declares', () => {
    const declared = new Set(Object.values(METRICS).flatMap((m) => m.dimensions));
    for (const d of runReport.parameters.properties.dimension.enum) {
      expect(declared.has(d)).toBe(true);
    }
  });

  it('does not require dates, because snapshots have none', () => {
    expect(runReport.parameters.required).toEqual(['metric']);
  });

  it('every metric the model can name is runnable', () => {
    for (const id of runReport.parameters.properties.metric.enum) {
      expect(() => validateSpec({ metric: id, dateRange: RANGE }), id).not.toThrow();
    }
  });

  it('separates period reports from live ones in the prompt', () => {
    const prompt = buildSystemPrompt('2026-08-22');
    expect(prompt).toMatch(/LIVE REPORTS/);
    expect(prompt).toMatch(/Do NOT send dates/);
    for (const id of METRIC_IDS) expect(prompt).toContain(id);
  });

  it('tells the model that donor-level reporting does not exist', () => {
    const prompt = buildSystemPrompt('2026-08-22');
    expect(prompt).toMatch(/aggregate only/i);
  });
});
