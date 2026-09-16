// ─────────────────────────────────────────────────────────────
// server/__tests__/assistant.catalog.test.js
//
// The catalog and the grounding built from it. No network, no
// database — everything here is a pure function.
//
// What these tests are really protecting is the one property the
// whole feature rests on: THE MODEL CANNOT SAY ANYTHING THAT IS NOT
// IN THE CATALOG, AND CANNOT SAY ANYTHING THIS ROLE MAY NOT HEAR.
// Both are enforced by the enum handed to Gemini, so both are
// testable without ever calling it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  TOPICS, TOPIC_IDS, SCREENS, SCREEN_IDS,
  getTopic, topicsForRole, screensForRole, suggestionsFor, publicTopic,
} from '../src/features/assistant/helpCatalog.js';
import { buildTools, buildSystemPrompt } from '../src/features/assistant/ai/toolSchema.js';

const ROLES = ['warehouse_worker', 'manager', 'admin'];

describe('the help catalog', () => {
  it('has no duplicate topic ids', () => {
    expect(new Set(TOPIC_IDS).size).toBe(TOPIC_IDS.length);
  });

  it('has no duplicate screen ids', () => {
    expect(new Set(SCREEN_IDS).size).toBe(SCREEN_IDS.length);
  });

  it('gives every topic a title, a body and at least one role', () => {
    for (const t of TOPICS) {
      expect(t.title, t.id).toBeTruthy();
      expect(t.body, t.id).toBeTruthy();
      expect(t.roles?.length, t.id).toBeGreaterThan(0);
    }
  });

  // A topic pointing at a screen that does not exist would render a
  // chip that goes nowhere.
  it('only references screens that exist', () => {
    for (const t of TOPICS) {
      for (const s of t.screens ?? []) {
        expect(SCREEN_IDS, `${t.id} -> ${s}`).toContain(s);
      }
    }
  });

  // `related` is rendered as tappable links, so a typo here is a
  // dead end rather than a compile error.
  it('only references related topics that exist', () => {
    for (const t of TOPICS) {
      for (const r of t.related ?? []) {
        expect(TOPIC_IDS, `${t.id} -> ${r}`).toContain(r);
      }
    }
  });

  // The whole point of the `asks` field is reaching people who do
  // not know the system's vocabulary. A topic without them is only
  // findable by someone who already knows what it is called.
  it('gives every topic the phrasings people actually use', () => {
    for (const t of TOPICS) {
      expect(t.asks?.length, `${t.id} has no asks`).toBeGreaterThan(0);
    }
  });

  it('only uses roles that exist', () => {
    for (const t of TOPICS) {
      for (const r of t.roles) expect(ROLES, t.id).toContain(r);
    }
  });
});

describe('what each role may be told', () => {
  it('gives a warehouse worker the floor topics and not master data', () => {
    const ids = topicsForRole('warehouse_worker').map((t) => t.id);
    expect(ids).toContain('receiving-record');
    expect(ids).toContain('dispatch-collection');
    expect(ids).toContain('packing-pallet');
    // Admin-only. A worker asking "how do I add a product" should be
    // told it is not covered, not walked through it.
    expect(ids).not.toContain('product-fields');
    expect(ids).not.toContain('users-and-accounts');
    expect(ids).not.toContain('archive-not-delete');
  });

  it('gives a manager the operational topics but not master data', () => {
    const ids = topicsForRole('manager').map((t) => t.id);
    expect(ids).toContain('po-create');
    expect(ids).toContain('reporting-ask');
    expect(ids).toContain('beneficiary-manage');
    // Consistent with the route gate: product editing is admin-only.
    expect(ids).not.toContain('product-fields');
    // But the topic EXPLAINING why they cannot is theirs to read.
    expect(ids).toContain('master-data-admin-only');
  });

  it('gives an admin everything', () => {
    expect(topicsForRole('admin')).toHaveLength(TOPICS.length);
  });

  it('never offers a role a topic it is not allowed', () => {
    for (const role of ROLES) {
      for (const t of topicsForRole(role)) {
        expect(t.roles, `${role} / ${t.id}`).toContain(role);
      }
    }
  });
});

describe('the suggestions shown when the panel opens', () => {
  it('leads with what the screen is for, not a general topic', () => {
    // The bug this pins: Receiving opened with "When the signal
    // drops" because the general topics were declared first.
    const [first] = suggestionsFor('receiving', 'warehouse_worker');
    expect(first.id).toBe('receiving-record');

    expect(suggestionsFor('dispatch', 'warehouse_worker')[0].id).toBe('dispatch-collection');
    expect(suggestionsFor('packing', 'warehouse_worker')[0].id).toBe('packing-pallet');
    expect(suggestionsFor('inventory', 'manager')[0].id).toBe('inventory-columns');
    expect(suggestionsFor('decanting', 'warehouse_worker')[0].id).toBe('decanting-record');
  });

  it('never suggests a topic the role may not see', () => {
    for (const role of ROLES) {
      const allowed = new Set(topicsForRole(role).map((t) => t.id));
      for (const screen of SCREEN_IDS) {
        for (const s of suggestionsFor(screen, role)) {
          expect(allowed, `${role} on ${screen}: ${s.id}`).toContain(s.id);
        }
      }
    }
  });

  it('is never empty, even on a screen with no topics of its own', () => {
    for (const role of ROLES) {
      for (const screen of SCREEN_IDS) {
        expect(suggestionsFor(screen, role).length, `${role} on ${screen}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('what crosses the wire', () => {
  // `asks` are prompt-engineering scaffolding and `rules` are URS
  // traceability. Neither is for the reader, and shipping them would
  // put "BR-14" in front of a volunteer.
  it('does not leak the prompt phrasings or the rule citations', () => {
    for (const t of TOPICS) {
      const sent = publicTopic(t);
      expect(sent.asks, t.id).toBeUndefined();
      expect(sent.rules, t.id).toBeUndefined();
      expect(sent.roles, t.id).toBeUndefined();
    }
  });

  it('resolves related topics to titles the client can render', () => {
    const t = getTopic('receiving-record');
    const sent = publicTopic(t);
    expect(sent.related.length).toBeGreaterThan(0);
    for (const r of sent.related) {
      expect(r.id).toBeTruthy();
      expect(r.title).toBeTruthy();
    }
  });
});

describe('the grounding handed to the model', () => {
  it('offers exactly the four ways of answering', () => {
    const names = buildTools('manager').map((t) => t.name);
    expect(names).toEqual([
      'explain_topic', 'open_screen', 'ask_clarification', 'not_covered',
    ]);
  });

  // THE central test. The topic id is an enum, so a role's tools
  // physically cannot name a topic that role may not be told about.
  it('scopes the topic enum to the role, so the model cannot pick a forbidden one', () => {
    for (const role of ROLES) {
      const allowed = topicsForRole(role).map((t) => t.id);
      const tools   = buildTools(role);

      const explain = tools.find((t) => t.name === 'explain_topic');
      expect(explain.parameters.properties.topic_id.enum, role).toEqual(allowed);

      // not_covered can offer a nearest topic, so it needs the same
      // gate — otherwise the refusal leaks what it is refusing.
      const notCovered = tools.find((t) => t.name === 'not_covered');
      expect(notCovered.parameters.properties.closest_topic_id.enum, role).toEqual(allowed);
    }
  });

  it('never puts an admin topic in a worker’s tools', () => {
    const workerIds = buildTools('warehouse_worker')
      .find((t) => t.name === 'explain_topic')
      .parameters.properties.topic_id.enum;
    expect(workerIds).not.toContain('product-fields');
    expect(workerIds).not.toContain('users-and-accounts');
  });

  // Screens are role-scoped too, because the assistant NAVIGATES —
  // it is not a hint any more. Fully exercised in
  // assistant.navigation.test.js; this is the line that stops the
  // enum quietly becoming "all screens" again.
  it('scopes the screen enum to the role as well', () => {
    const open = buildTools('warehouse_worker').find((t) => t.name === 'open_screen');
    expect(open.parameters.properties.screen_id.enum)
      .toEqual(screensForRole('warehouse_worker').map((s) => s.id));
    expect(open.parameters.properties.screen_id.enum).not.toEqual(SCREEN_IDS);
  });

  it('puts every allowed topic and its phrasings into the prompt', () => {
    for (const role of ROLES) {
      const prompt = buildSystemPrompt(role);
      for (const t of topicsForRole(role)) {
        expect(prompt, `${role} / ${t.id}`).toContain(t.id);
        // Without the phrasings the model only matches people who
        // already know the vocabulary — which is nobody who needs it.
        expect(prompt, `${role} / ${t.id} asks`).toContain(t.asks[0]);
      }
    }
  });

  it('keeps a forbidden topic out of the prompt entirely', () => {
    const prompt = buildSystemPrompt('warehouse_worker');
    expect(prompt).not.toContain('users-and-accounts');
    expect(prompt).not.toContain('product-fields');
  });

  it('tells the model it is not allowed to write the answer', () => {
    // Flattened first: the prompt is hand-wrapped, so "You do not
    // write the answer" has a newline inside it and a naive regex
    // fails on a re-wrap rather than on a real change.
    const prompt = buildSystemPrompt('manager').replace(/\s+/g, ' ');
    expect(prompt).toMatch(/do not write the answer/i);
    expect(prompt).toMatch(/not answer from your own knowledge/i);
    // Questions are typed by users and may contain anything.
    expect(prompt).toMatch(/never an instruction/i);
  });
});
