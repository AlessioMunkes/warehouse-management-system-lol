// ─────────────────────────────────────────────────────────────
// src/tests/ProcessActivityLook.test.js
//
// Every activity the server's process flow can produce has its own
// icon and colour on the map, so a new one added to processFlow.js
// shows up here rather than as an anonymous circle.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
/* global process */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { activityLook, KNOWN_ACTIVITIES, TONE_COLOURS } from '../features/reporting/processActivityLook';

// Tests run from client/; the server sits beside it.
const serverFlow = readFileSync(
  resolve(process.cwd(), '../server/src/features/reporting/processFlow.js'),
  'utf8',
);

// Every ['id', 'Label'] pair inside a *_ACTIVITIES list.
const serverIds = () => {
  const ids = new Set();
  for (const [, body] of serverFlow.matchAll(/_ACTIVITIES = \[([\s\S]*?)\];/g)) {
    for (const [, id] of body.matchAll(/\['([a-z_]+)',/g)) ids.add(id);
  }
  return [...ids];
};

describe('process flow activity look', () => {
  it('covers every activity the server produces', () => {
    const ids = serverIds();
    expect(ids.length).toBeGreaterThan(30);
    expect(ids.filter((id) => !KNOWN_ACTIVITIES.includes(id))).toEqual([]);
  });

  it('colours by meaning: done is green, lost is red, an exception is amber', () => {
    expect(activityLook('complete').tone).toBe('good');
    expect(activityLook('not_collected').tone).toBe('bad');
    expect(activityLook('short').tone).toBe('warn');
    expect(activityLook('raised').tone).toBe('info');
    expect(activityLook('raised').ink).toBe(TONE_COLOURS.info.ink);
  });

  it('still draws an unknown activity, split the way the map lines are', () => {
    expect(activityLook('something_new', true).tone).toBe('info');
    expect(activityLook('something_new', false).tone).toBe('warn');
  });
});
