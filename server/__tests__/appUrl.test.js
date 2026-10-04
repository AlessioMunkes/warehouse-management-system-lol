// ─────────────────────────────────────────────────────────────
// server/__tests__/appUrl.test.js
//
// config/appUrl.js: the one place that decides what web address every
// link in an email starts with. These pin the chain (the live site sets
// CLIENT_URL and CLIENT_ORIGIN and must keep working with no change) and
// what happens in production when nothing is set.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  LINK_KINDS, DEV_DEFAULT_URL, chainFor, resolveAppBaseUrl, appBaseUrl, missingAddressMessage,
} from '../src/config/appUrl.js';

const KINDS = Object.keys(LINK_KINDS);
const resolve = (kind, env) => resolveAppBaseUrl(kind, env);

afterEach(() => vi.restoreAllMocks());

describe('the chain, per kind of link', () => {
  it.each([
    ['invite',        ['USER_INVITE_BASE_URL', 'APP_BASE_URL', 'CLIENT_URL', 'FRONTEND_URL', 'CLIENT_ORIGIN']],
    ['passwordReset', ['PASSWORD_RESET_BASE_URL', 'APP_BASE_URL', 'CLIENT_URL', 'FRONTEND_URL', 'CLIENT_ORIGIN']],
    ['section18a',    ['SECTION18A_FORM_BASE_URL', 'APP_BASE_URL', 'CLIENT_URL', 'FRONTEND_URL', 'CLIENT_ORIGIN']],
    ['financeReport', ['APP_BASE_URL', 'CLIENT_ORIGIN', 'CLIENT_URL', 'FRONTEND_URL']],
    ['gmailReturn',   ['APP_BASE_URL', 'CLIENT_ORIGIN', 'CLIENT_URL', 'FRONTEND_URL']],
    ['savedReport',   ['APP_BASE_URL', 'CLIENT_URL', 'FRONTEND_URL', 'CLIENT_ORIGIN']],
  ])('%s reads %j, first one set wins', (kind, names) => {
    expect(chainFor(kind)).toEqual(names);
  });

  it('refuses a kind it does not know', () => {
    expect(() => chainFor('carrier-pigeon')).toThrow(/Unknown link kind/);
  });
});

describe('which address wins', () => {
  const ALL = {
    USER_INVITE_BASE_URL: 'https://invite.example',
    PASSWORD_RESET_BASE_URL: 'https://reset.example',
    SECTION18A_FORM_BASE_URL: 'https://forms.example',
    APP_BASE_URL: 'https://app.example',
    CLIENT_URL: 'https://client-url.example',
    FRONTEND_URL: 'https://frontend.example',
    CLIENT_ORIGIN: 'https://origin.example',
  };

  it("lets a kind's own override beat APP_BASE_URL", () => {
    expect(resolve('invite', ALL)).toMatchObject({ url: 'https://invite.example', source: 'USER_INVITE_BASE_URL' });
    expect(resolve('passwordReset', ALL)).toMatchObject({ url: 'https://reset.example', source: 'PASSWORD_RESET_BASE_URL' });
    expect(resolve('section18a', ALL)).toMatchObject({ url: 'https://forms.example', source: 'SECTION18A_FORM_BASE_URL' });
  });

  it('lets APP_BASE_URL beat the older names for every kind', () => {
    const {
      USER_INVITE_BASE_URL, PASSWORD_RESET_BASE_URL, SECTION18A_FORM_BASE_URL, ...rest
    } = ALL;
    for (const kind of KINDS) {
      expect(resolve(kind, rest), kind).toMatchObject({ url: 'https://app.example', source: 'APP_BASE_URL' });
    }
  });

  it('uses the older names in the order each kind read them', () => {
    const old = {
      CLIENT_URL: 'https://client-url.example',
      FRONTEND_URL: 'https://frontend.example',
      CLIENT_ORIGIN: 'https://origin.example',
    };
    expect(resolve('invite', old).source).toBe('CLIENT_URL');
    expect(resolve('passwordReset', old).source).toBe('CLIENT_URL');
    expect(resolve('section18a', old).source).toBe('CLIENT_URL');
    expect(resolve('savedReport', old).source).toBe('CLIENT_URL');
    // These two read CLIENT_ORIGIN first, and still do.
    expect(resolve('financeReport', old).source).toBe('CLIENT_ORIGIN');
    expect(resolve('gmailReturn', old).source).toBe('CLIENT_ORIGIN');
  });

  // Render sets CLIENT_URL and CLIENT_ORIGIN, nothing else. No change to
  // those may change where any link points.
  it('keeps every link where it was on a server that only sets CLIENT_URL and CLIENT_ORIGIN', () => {
    const render = {
      NODE_ENV: 'production', CLIENT_URL: 'https://wms.example', CLIENT_ORIGIN: 'https://wms-origin.example',
    };
    expect(resolve('invite', render).url).toBe('https://wms.example');
    expect(resolve('passwordReset', render).url).toBe('https://wms.example');
    expect(resolve('section18a', render).url).toBe('https://wms.example');
    expect(resolve('savedReport', render).url).toBe('https://wms.example');
    expect(resolve('financeReport', render).url).toBe('https://wms-origin.example');
    expect(resolve('gmailReturn', render).url).toBe('https://wms-origin.example');
  });

  it('now finds CLIENT_ORIGIN for the links that used to ignore it', () => {
    const onlyOrigin = { NODE_ENV: 'production', CLIENT_ORIGIN: 'https://origin.example' };
    for (const kind of KINDS) {
      expect(resolve(kind, onlyOrigin), kind).toMatchObject({ url: 'https://origin.example', source: 'CLIENT_ORIGIN' });
    }
  });

  it('trims spaces and trailing slashes, and ignores blank values', () => {
    expect(resolve('invite', { APP_BASE_URL: '  https://app.example//  ' }).url).toBe('https://app.example');
    expect(resolve('invite', { APP_BASE_URL: '   ', CLIENT_URL: 'https://client-url.example/' })).toMatchObject({
      url: 'https://client-url.example', source: 'CLIENT_URL',
    });
  });
});

describe('when nothing is set', () => {
  it.each(KINDS)('falls back to localhost for %s outside production', (kind) => {
    expect(resolve(kind, {})).toMatchObject({ url: DEV_DEFAULT_URL, source: null, isDevDefault: true });
    expect(resolve(kind, { NODE_ENV: 'development' }).url).toBe(DEV_DEFAULT_URL);
    expect(resolve(kind, { NODE_ENV: 'test' }).url).toBe('http://localhost:5173');
  });

  it.each(KINDS)('gives no address for %s in production, and does not throw', (kind) => {
    expect(() => resolve(kind, { NODE_ENV: 'production' })).not.toThrow();
    expect(resolve(kind, { NODE_ENV: 'production' })).toMatchObject({ url: null, source: null, isDevDefault: false });
  });

  it('uses an address that is set even if it is localhost (Connections is what flags it)', () => {
    expect(resolve('invite', { NODE_ENV: 'production', APP_BASE_URL: 'http://localhost:5173' }).url)
      .toBe('http://localhost:5173');
  });
});

describe('appBaseUrl, the one the services call', () => {
  const NAMES = ['APP_BASE_URL', 'USER_INVITE_BASE_URL', 'CLIENT_URL', 'FRONTEND_URL', 'CLIENT_ORIGIN'];

  it('logs a clear error and returns null in production with nothing set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    NAMES.forEach((n) => vi.stubEnv(n, ''));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(appBaseUrl('invite')).toBeNull();
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).toContain('[links]');
      expect(log.mock.calls[0][0]).toContain('APP_BASE_URL');
      expect(log.mock.calls[0][0]).toContain('invite links');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns the address, and logs nothing, when one is set', () => {
    vi.stubEnv('APP_BASE_URL', 'https://app.example/');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(appBaseUrl('invite')).toBe('https://app.example');
      expect(log).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('words the message for people, per kind', () => {
    expect(missingAddressMessage('financeReport')).toBe(
      'No web address is set for finance report links. Set APP_BASE_URL on the server (for example https://your-site.example).',
    );
  });
});
