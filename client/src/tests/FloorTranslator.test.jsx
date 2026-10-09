// ─────────────────────────────────────────────────────────────
// client/src/tests/FloorTranslator.test.jsx
//
// The floor's text that is translated on the page, by phrase
// (translations/phrases.js and translations/floorTranslator.js).
//
// The table is checked as a whole for the mistakes that would show on a
// screen: a missing language, a {} dropped in translation. The page
// half is checked against a real React tree, because the claim it makes
// is that React and it can share a text node.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useState } from 'react';

const { PHRASES } = await import('../translations/phrases');
const {
  buildTables, translatePhrase, startFloorTranslation, stopFloorTranslation,
} = await import('../translations/floorTranslator');

const table = buildTables(PHRASES);
const holes = (text) => (text.match(/\{\}/g) ?? []).length;

afterEach(() => { stopFloorTranslation(); });

describe('the phrase table', () => {
  it('gives every phrase in all three languages', () => {
    for (const row of PHRASES) {
      expect(row, row[0]).toHaveLength(3);
      for (const text of row) expect(typeof text === 'string' && text.trim().length > 0, row[0]).toBe(true);
    }
  });

  it('keeps every filled-in value in each translation', () => {
    for (const [english, af, xh] of PHRASES) {
      expect(holes(af), english).toBe(holes(english));
      expect(holes(xh), english).toBe(holes(english));
    }
  });

  it('lists each English phrase once', () => {
    const seen = new Set();
    for (const [english] of PHRASES) {
      expect(seen.has(english), english).toBe(false);
      seen.add(english);
    }
  });
});

describe('translatePhrase', () => {
  it('translates a whole phrase', () => {
    expect(translatePhrase('Start counting', 'af', table)).toBe('Begin tel');
    expect(translatePhrase('Start counting', 'xh', table)).toBe('Qala ukubala');
  });

  it('carries filled-in values across, in order', () => {
    expect(translatePhrase('Step 2 of 5', 'af', table)).toBe('Stap 2 van 5');
    expect(translatePhrase('3 of 8 collected · 5 still waiting', 'af', table)).toBe('3 van 8 afgehaal · 5 wag nog');
  });

  it('translates a filled-in value that is itself a phrase', () => {
    expect(translatePhrase('Decanting / What you are working with', 'af', table)).toBe('Oorskep / Waarmee jy werk');
  });

  it('leaves a name inside a phrase alone', () => {
    expect(translatePhrase('Baked Beans is counted in whole units. Enter a whole number.', 'af', table))
      .toBe("Baked Beans word in heel eenhede getel. Voer 'n heelgetal in.");
  });

  it('answers null for English, for an unknown language and for text it does not know', () => {
    expect(translatePhrase('Start counting', 'en', table)).toBeNull();
    expect(translatePhrase('Start counting', 'zz', table)).toBeNull();
    expect(translatePhrase('Little Stars ECD', 'af', table)).toBeNull();
    expect(translatePhrase('42', 'af', table)).toBeNull();
  });
});

describe('on the page', () => {
  const Screen = () => {
    const [step, setStep] = useState(1);
    const [typed, setTyped] = useState('');
    return (
      <div>
        <h1>Count and put away</h1>
        <p>Step {step} of 3</p>
        <p data-testid="centre">Little Stars ECD</p>
        <p translate="no">Start counting</p>
        <input aria-label="Search this list" placeholder="Search products" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="button" onClick={() => setStep((s) => s + 1)}>Next</button>
        {step > 1 ? <p>Delivery received</p> : null}
      </div>
    );
  };

  it('puts a screen into the language, and keeps up as React changes it', async () => {
    render(<Screen />);
    await act(async () => { await startFloorTranslation('af'); });

    expect(screen.getByRole('heading').textContent).toBe('Tel en pak weg');
    expect(screen.getByRole('button').textContent).toBe('Volgende');
    // Names stay as they are, and so does anything marked translate="no".
    expect(screen.getByTestId('centre').textContent).toBe('Little Stars ECD');
    expect(screen.getByText('Start counting')).toBeTruthy();
    // What a person reads on a field, not what they type into it.
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-label')).toBe('Soek in hierdie lys');
    expect(input.getAttribute('placeholder')).toBe('Soek produkte');

    // React re-renders: new text arrives in English and is translated.
    act(() => { screen.getByRole('button').click(); });
    await waitFor(() => expect(screen.getByText('Aflewering ontvang')).toBeTruthy());
    expect(screen.getByRole('button').textContent).toBe('Volgende');
  });

  it('goes back to the English exactly as it was', async () => {
    render(<Screen />);
    await act(async () => { await startFloorTranslation('xh'); });
    expect(screen.getByRole('heading').textContent).toBe('Bala uze ubeke');

    act(() => { stopFloorTranslation(); });
    expect(screen.getByRole('heading').textContent).toBe('Count and put away');
    expect(screen.getByRole('button').textContent).toBe('Next');
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Search products');
  });

  it('changes straight from one language to another', async () => {
    render(<Screen />);
    await act(async () => { await startFloorTranslation('af'); });
    await act(async () => { await startFloorTranslation('xh'); });
    expect(screen.getByRole('heading').textContent).toBe('Bala uze ubeke');
  });

  it('does nothing at all in English', async () => {
    render(<Screen />);
    await act(async () => { await startFloorTranslation('en'); });
    expect(screen.getByRole('heading').textContent).toBe('Count and put away');
  });
});
