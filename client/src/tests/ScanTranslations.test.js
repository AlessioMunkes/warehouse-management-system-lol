// ─────────────────────────────────────────────────────────────
// client/src/tests/ScanTranslations.test.js
//
// The words for the pallet scan button, on the volunteer's screens and
// the worker's, in all three languages. The volunteer's keys are also
// covered by GuestTranslations.test.jsx; these add the worker's and the
// house rules for this text.
//
// @vitest-environment node
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../translations/messages';

const scanKeys = Object.keys(MESSAGES.en).filter((k) =>
  k.startsWith('guest.scan.') || k.startsWith('packing.scan.') || k.startsWith('guest.slip.'));

describe('scan and pallet-state text', () => {
  it('exists', () => {
    expect(scanKeys.length).toBeGreaterThanOrEqual(30);
    for (const needed of ['guest.scan.button', 'packing.scan.button', 'guest.scan.notPallet', 'packing.scan.notPallet',
      'guest.scan.denied', 'guest.scan.noCamera', 'guest.scan.failed',
      'packing.scan.denied', 'packing.scan.noCamera', 'packing.scan.failed',
      'guest.slip.cancelled', 'guest.slip.collected', 'guest.slip.packed', 'guest.slip.holding']) {
      expect(scanKeys, needed).toContain(needed);
    }
  });

  it.each(['af', 'xh'])('is in %s, not left in English', (lang) => {
    for (const key of scanKeys) {
      expect(MESSAGES[lang][key], key).toBeTruthy();
      expect(MESSAGES[lang][key], key).not.toBe(MESSAGES.en[key]);
    }
  });

  it.each(['en', 'af', 'xh'])('has no em dash in %s', (lang) => {
    for (const key of scanKeys) expect(MESSAGES[lang][key], key).not.toMatch(/[—–]/);
  });

  // Every denied / no camera / failed message points to the typed code.
  it.each(['en', 'af', 'xh'])('tells the person what to do instead when the camera fails, in %s', (lang) => {
    for (const key of ['guest.scan.denied', 'guest.scan.noCamera', 'guest.scan.failed',
      'packing.scan.denied', 'packing.scan.noCamera', 'packing.scan.failed']) {
      expect(MESSAGES[lang][key], key).toMatch(/\b6\b|-6\b/);
    }
  });

  // The partner VMS prints a different QR for attendance: nothing here may
  // read as checking in.
  it('never says check in, sign in or register', () => {
    for (const key of scanKeys) {
      expect(MESSAGES.en[key], key).not.toMatch(/check.?in|sign.?in|register|arriv/i);
    }
  });

  it('marks the Afrikaans and isiXhosa scan text as drafts for a fluent speaker', () => {
    const source = readFileSync(fileURLToPath(new URL('../translations/messages.js', import.meta.url)), 'utf8');
    expect(source).toMatch(/DRAFT: not yet checked by a fluent speaker/);
    expect(source).toMatch(/HAVE NOT BEEN CHECKED BY A FLUENT/);
  });
});

describe('the scanner frame', () => {
  const css = readFileSync(fileURLToPath(new URL('../styles/index.css', import.meta.url)), 'utf8');
  const rule = css.slice(css.indexOf('.scan-view {'), css.indexOf('}', css.indexOf('.scan-view {')));

  // Reduce motion is honoured by there being no motion to reduce.
  it('does not animate or transition', () => {
    expect(rule).toContain('aspect-ratio');
    expect(rule).not.toMatch(/animation|transition/);
  });
});
