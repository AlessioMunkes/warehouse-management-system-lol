// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.fallback.test.js
//
// When every Gemini model is down, the ask box still answers:
//   - the keyword matcher routes real manager questions to the
//     right operational report, breakdown and chart
//   - it refuses what it cannot match (and impact questions) rather
//     than guessing
//   - the provider walks the model chain on 429/503/timeouts, and
//     stops on a 400
// No database and no network.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../src/config/db.js', () => ({ default: { query: vi.fn() } }));

const { matchQuestion, resolveDates } = await import('../src/features/reporting/ai/keywordFallback.js');
const provider = (await import('../src/features/reporting/ai/provider.js')).default;

const TODAY = '2026-09-24';
const route = (q) => {
  const m = matchQuestion(q, TODAY);
  if (!m) return null;
  return m.kind === 'comparison' ? `scatter:${m.id}` : `${m.spec.metric}/${m.spec.dimension}${m.chartHint ? `/${m.chartHint}` : ''}`;
};

describe('keyword fallback', () => {
  it.each([
    ['which suppliers deliver late?', 'po_on_time_rate/supplier'],
    ['Which centres keep missing collections?', 'repeat_non_collections/ecd_centre'],
    ['What needs reordering right now?', 'low_stock_items/product'],
    ['Which products have gone up in price?', 'unit_price_trend/product'],
    ['Is decanting wastage getting worse?', 'decanting_wastage/month'],
    ['Which products do packers flag most?', 'picking_flag_rate/product'],
    ['Scatter plot of centres: collections vs children', 'scatter:centre_collections_vs_children'],
    ['Show spend by supplier per month as a stacked chart', 'procurement_spend/month_supplier/stacked'],
    ['Which purchase orders are overdue?', 'overdue_purchase_orders/supplier'],
    ['Which suppliers deliver the wrong quantities?', 'receiving_discrepancy_rate/supplier'],
    ['what is our stock worth by storage type', 'stock_value/storage_type'],
    ['food dispatched last month', 'dispatch_volume/month'],
    ['how long does picking take', 'picking_turnaround/month'],
  ])('%s', (q, want) => {
    expect(route(q)).toBe(want);
  });

  it.each(['how many children did we reach', 'tell me a joke', 'hello'])('does not guess at "%s"', (q) => {
    expect(route(q)).toBeNull();
  });

  it('resolves common periods', () => {
    expect(resolveDates('last month', TODAY)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(resolveDates('this year', TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
    expect(resolveDates('anything', TODAY)).toEqual({ from: '2026-07-01', to: TODAY });
  });
});

describe('model fallback chain', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  const reply = (status, body = {}) => Promise.resolve({
    ok: status === 200, status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(''),
  });
  const answer = { candidates: [{ content: { parts: [{ functionCall: { name: 'run_report', args: { metric: 'x' } } }] } }] };

  it('moves to the next model on a quota or overload error', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'a';
    process.env.GEMINI_FALLBACK_MODELS = 'b,c';
    const fetchMock = vi.fn()
      .mockReturnValueOnce(reply(429))
      .mockReturnValueOnce(reply(503))
      .mockReturnValueOnce(reply(200, answer));
    vi.stubGlobal('fetch', fetchMock);

    const call = await provider.callWithTools({ systemPrompt: 's', userMessage: 'u', tools: [] });
    expect(call).toMatchObject({ name: 'run_report', model: 'c' });
    expect(fetchMock.mock.calls.map((c) => c[0].match(/models\/([^:]+)/)[1])).toEqual(['a', 'b', 'c']);
  });

  it('stops at once on a bad request, which every model would reject', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'a';
    process.env.GEMINI_FALLBACK_MODELS = 'b';
    const fetchMock = vi.fn().mockReturnValue(reply(400));
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider.callWithTools({ systemPrompt: 's', userMessage: 'u', tools: [] })).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the quota error when every model is out', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'a';
    process.env.GEMINI_FALLBACK_MODELS = 'b';
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(reply(429)));
    await expect(provider.callWithTools({ systemPrompt: 's', userMessage: 'u', tools: [] })).rejects.toMatchObject({ status: 429, code: 'rate_limit' });
  });
});
