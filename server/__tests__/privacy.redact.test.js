// ─────────────────────────────────────────────────────────────
// server/__tests__/privacy.redact.test.js
//
// What reaches the AI model is never a person: typed questions lose
// names, phone numbers, emails and ID numbers; a chart whose dots are
// people goes out as "Packer A", "Packer B" and comes back named.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redactText, pseudonymise, restore } from '../src/features/privacy/redact.js';

const NAMES = ['Nomsa Dlamini', 'Mcebisi Khumalo', 'Grace Petersen', 'Tiger Mokoena'];
const KEEP = new Set(['tiger', 'brands', 'rice', 'little', 'stars']);

describe('redactText', () => {
  it('takes out full names in any case', () => {
    expect(redactText('slips packed by nomsa dlamini last month', NAMES).text).toBe('slips packed by [person] last month');
  });

  it('takes out a capitalised first or last name on its own', () => {
    expect(redactText('how many lines did Mcebisi flag', NAMES).text).toBe('how many lines did [person] flag');
    expect(redactText('volunteer hours for Petersen', NAMES).text).toBe('volunteer hours for [person]');
  });

  it('leaves ordinary words that are also names, and organisation words', () => {
    // "grace" as a word, "Tiger" as in Tiger Brands (a supplier).
    expect(redactText('grace period on overdue orders', NAMES).text).toBe('grace period on overdue orders');
    expect(redactText('deliveries from Tiger Brands', NAMES, KEEP).text).toBe('deliveries from Tiger Brands');
  });

  it('takes out phone numbers, emails and SA ID numbers', () => {
    const { text, redacted } = redactText('call 082 555 1234 or +27 21 555 1234, mail a.b@ladles.org.za, id 9001015009087', []);
    expect(text).toBe('call [phone] or [phone], mail [email], id [id number]');
    expect(redacted).toBe(4);
  });

  it('keeps dates, years and quantities', () => {
    const q = 'how much rice went out between 2026-01-01 and 2026-03-31, over 500 kg';
    expect(redactText(q, NAMES).text).toBe(q);
  });
});

describe('pseudonymise and restore', () => {
  it('gives each person a stable alias and puts the names back', () => {
    const { map, alias } = pseudonymise(['Nomsa', 'Mcebisi', 'Nomsa'], 'Packer');
    expect(alias('Nomsa')).toBe('Packer A');
    expect(alias('Mcebisi')).toBe('Packer B');
    expect(restore('Packer B flags most; Packer A carries the load.', map)).toBe('Mcebisi flags most; Nomsa carries the load.');
  });

  it('does not confuse Packer A with Packer AA', () => {
    const labels = Array.from({ length: 27 }, (_, i) => `P${i}`);
    const { map } = pseudonymise(labels, 'Packer');
    expect(restore('Packer AA and Packer A', map)).toBe('P26 and P0');
  });
});

// ── The services send only the redacted question ──────────────
const providerMock = { isEnabled: vi.fn(() => true), providerName: vi.fn(() => 'google:test'), callWithTools: vi.fn() };
vi.mock('../src/features/reporting/ai/provider.js', () => ({ default: providerMock }));
vi.mock('../src/repositories/knownPeople.repository.js', () => ({
  default: { listNames: vi.fn(async () => ({ names: NAMES, keep: KEEP })) },
}));
vi.mock('../src/repositories/assistantLog.repository.js', () => ({ default: { record: vi.fn() } }));
vi.mock('../src/repositories/reportingLog.repository.js', () => ({ default: { record: vi.fn() } }));

describe('what the model is sent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the help assistant', async () => {
    const { default: assistant } = await import('../src/services/assistant.service.js');
    providerMock.callWithTools.mockResolvedValueOnce({ name: 'explain_topic', args: { topic_id: 'receiving-record' } });
    await assistant.ask({ question: 'Nomsa Dlamini on 082 555 1234 asked how to receive', userId: 1, role: 'warehouse_worker' });
    const sent = providerMock.callWithTools.mock.calls[0][0].userMessage;
    expect(sent).not.toMatch(/Nomsa|Dlamini|082/);
    expect(sent).toMatch(/\[person\] on \[phone\] asked how to receive/);
  });

  it('the reporting assistant', async () => {
    const { default: reportingAi } = await import('../src/services/reportingAi.service.js');
    providerMock.callWithTools.mockResolvedValue({ name: 'no_matching_report', args: { reason: 'test' } });
    await reportingAi.ask({ question: 'slips Mcebisi packed last month', userId: 1 });
    const sent = providerMock.callWithTools.mock.calls[0][0].userMessage;
    expect(sent).toBe('slips [person] packed last month');
  });
});

describe('a scatter whose dots are people', () => {
  it('sends aliases and writes the names back into the report', async () => {
    const { writeComparisonNarrative } = await import('../src/features/reporting/insights/narrative.js');
    const { getComparison } = await import('../src/features/reporting/reportComparisons.js');
    const def = getComparison('packer_workload_vs_flags');
    const comparison = {
      dateRange: { from: '2026-07-01', to: '2026-09-27' }, averages: { x: 30, y: 2 },
      points: [{ label: 'Mcebisi Khumalo', x: 42, y: 7.1 }, { label: 'Nomsa Dlamini', x: 49, y: 0 }],
    };
    providerMock.callWithTools.mockResolvedValueOnce({ name: 'write_report', args: {
      headline: 'Packer A flags most', explanation: 'Packer B packs the most lines.', business_view: 'Check Packer A stock.', next_steps: ['Talk to Packer A'],
    } });
    const n = await writeComparisonNarrative({ def, comparison, flagged: [comparison.points[0]] });
    const sent = providerMock.callWithTools.mock.calls[0][0].userMessage;
    expect(sent).not.toMatch(/Mcebisi|Nomsa|Khumalo|Dlamini/);
    expect(n.headline).toBe('Mcebisi Khumalo flags most');
    expect(n.explanation).toBe('Nomsa Dlamini packs the most lines.');
    expect(n.nextSteps).toEqual(['Talk to Mcebisi Khumalo']);
  });
});
