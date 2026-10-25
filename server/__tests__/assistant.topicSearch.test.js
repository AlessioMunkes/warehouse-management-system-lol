// ─────────────────────────────────────────────────────────────
// server/__tests__/assistant.topicSearch.test.js
//
// The catalogue's own reading of a question, used when the model
// cannot be asked or gives up. It only ranks topics the role may read.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { searchTopics, CONFIDENT_SCORE } from '../src/features/assistant/topicSearch.js';
import { getTopic } from '../src/features/assistant/helpCatalog.js';

const top = (question, role) => searchTopics(question, role)[0]?.topic.id ?? null;

describe('searchTopics', () => {
  it.each([
    ['what is the process map', 'manager', 'process-map'],
    ['how do i save a report and get it emailed', 'manager', 'reporting-saved'],
    ['change the summer recipe', 'admin', 'recipes'],
    ['why is a centre grey on the map', 'manager', 'impact-map'],
    ['what is the process', 'warehouse_worker', 'process-overview'],
  ])('reads "%s" (%s) as %s', (question, role, id) => {
    expect(top(question, role)).toBe(id);
  });

  it('is confident only when the words point clearly at a topic', () => {
    expect(searchTopics('what is the process map', 'manager')[0].score).toBeGreaterThanOrEqual(CONFIDENT_SCORE);
  });

  it('finds nothing for words no topic uses', () => {
    expect(searchTopics('what is the weather', 'warehouse_worker')).toEqual([]);
    expect(searchTopics('', 'manager')).toEqual([]);
  });

  it('only ever returns topics the role may read', () => {
    for (const role of ['warehouse_worker', 'manager', 'admin', 'guest']) {
      for (const q of ['add a user', 'process map', 'edit a product', 'pack a pallet', 'reports']) {
        for (const r of searchTopics(q, role, { limit: 10 })) expect(getTopic(r.topic.id).roles).toContain(role);
      }
    }
  });

  it('leaves out what it is told to', () => {
    expect(searchTopics('what is the process map', 'manager', { exclude: ['process-map'] }).map((r) => r.topic.id))
      .not.toContain('process-map');
  });
});
