// ─────────────────────────────────────────────────────────────
// client/src/tests/FirstUseTranslations.test.js
//
// The welcome card (welcome.*) and the Help tip (help.*), in all three
// languages, under the same house rules as the scan text.
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { MESSAGES } from '../translations/messages';

const keys = Object.keys(MESSAGES.en).filter((k) => k.startsWith('welcome.') || k.startsWith('help.'));

describe('first-use text', () => {
  it('exists', () => {
    expect(keys).toEqual(expect.arrayContaining([
      'welcome.title', 'welcome.intro', 'welcome.worker.tasks', 'welcome.worker.views',
      'welcome.worker.offline', 'welcome.help', 'welcome.done', 'help.hint', 'help.hintClose',
    ]));
  });

  it.each(['af', 'xh'])('is in %s, not left in English', (lang) => {
    for (const key of keys) {
      expect(MESSAGES[lang][key], key).toBeTruthy();
      expect(MESSAGES[lang][key], key).not.toBe(MESSAGES.en[key]);
    }
  });

  it.each(['en', 'af', 'xh'])('has no em dash in %s', (lang) => {
    for (const key of keys) expect(MESSAGES[lang][key], key).not.toMatch(/[—–]/);
  });

  it.each(['af', 'xh'])('keeps {name} in %s', (lang) => {
    expect(MESSAGES[lang]['welcome.title']).toContain('{name}');
  });

  // The card names the two views by the words on the toggle itself.
  it.each(['en', 'af', 'xh'])('calls the views what the toggle calls them, in %s', (lang) => {
    const text = MESSAGES[lang]['welcome.worker.views'];
    expect(text).toContain(MESSAGES[lang]['slip.view.guided']);
    expect(text).toContain(MESSAGES[lang]['slip.view.form']);
  });
});
