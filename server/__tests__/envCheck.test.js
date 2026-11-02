// npm run check-env: what it says about an environment, never a value.
import { describe, it, expect } from 'vitest';
import { checkEnv, hasBlockingProblem } from '../scripts/lib/envCheck.js';

const GOOD = {
  DATABASE_URL: 'postgresql://postgres.abc:s3cret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
  JWT_SECRET: 'q'.repeat(48),
};
const line = (lines, name) => lines.find((l) => l.name === name);

describe('checkEnv', () => {
  it('passes a minimal local setup and calls the rest switched off', () => {
    const lines = checkEnv(GOOD);
    expect(hasBlockingProblem(lines)).toBe(false);
    expect(line(lines, 'DATABASE_URL').status).toBe('ok');
    expect(line(lines, 'Gmail (email sending)').status).toBe('off');
  });

  it('blocks on a missing database or login secret', () => {
    const lines = checkEnv({});
    expect(line(lines, 'DATABASE_URL').status).toBe('missing');
    expect(line(lines, 'JWT_SECRET').status).toBe('missing');
    expect(hasBlockingProblem(lines)).toBe(true);
  });

  it('catches the old env.example mistakes: a space, a placeholder, retired names', () => {
    expect(line(checkEnv({ ...GOOD, DATABASE_URL: ' uri-here' }), 'DATABASE_URL').status).toBe('wrong');
    expect(line(checkEnv({ ...GOOD, DATABASE_URL: 'postgresql://postgres.your-project:your-password@h:5432/p' }), 'DATABASE_URL').status).toBe('wrong');
    expect(line(checkEnv({ ...GOOD, JWT_SECRET: 'replace-with-a-long-random-string' }), 'JWT_SECRET').status).toBe('wrong');
    expect(line(checkEnv({ ...GOOD, DB_HOST: 'x' }), 'DB_HOST').status).toBe('warn');
  });

  it('accepts several warehouses instead of DATABASE_URL', () => {
    const lines = checkEnv({ JWT_SECRET: GOOD.JWT_SECRET, WAREHOUSE_DB_URLS: '{"cpt":"postgresql://a@b/c"}' });
    expect(line(lines, 'WAREHOUSE_DB_URLS').status).toBe('ok');
    expect(line(lines, 'DATABASE_URL')).toBeUndefined();
    expect(line(checkEnv({ ...GOOD, WAREHOUSE_DB_URLS: '{nope' }), 'WAREHOUSE_DB_URLS').status).toBe('wrong');
  });

  it('holds a live server to production rules', () => {
    const lines = checkEnv({
      ...GOOD, NODE_ENV: 'production', APP_BASE_URL: 'http://localhost:5173',
      QUICKBOOKS_CLIENT_ID: 'a', QUICKBOOKS_CLIENT_SECRET: 'b', QUICKBOOKS_REDIRECT_URI: 'https://x.org/cb',
      EMAIL_ENABLED: 'false',
    });
    expect(line(lines, 'APP_BASE_URL').status).toBe('wrong');
    expect(line(lines, 'TRUSTED_CLIENT_IP_HEADER').status).toBe('warn');
    expect(line(lines, 'QuickBooks').status).toBe('warn');
    expect(line(lines, 'EMAIL_ENABLED').status).toBe('warn');
  });

  it('wants all of a feature or none of it', () => {
    const half = checkEnv({ ...GOOD, GMAIL_CLIENT_ID: 'x' });
    expect(line(half, 'Gmail (email sending)')).toMatchObject({ status: 'wrong', message: expect.stringMatching(/GMAIL_CLIENT_SECRET/) });
    const badKey = checkEnv({ ...GOOD, GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: 'y', GMAIL_REDIRECT_URI: 'http://localhost:5000/cb', GMAIL_TOKEN_ENCRYPTION_KEY: 'short' });
    expect(line(badKey, 'Gmail (email sending)').status).toBe('wrong');
    const ok = checkEnv({ ...GOOD, GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: 'y', GMAIL_REDIRECT_URI: 'http://localhost:5000/cb', GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
    expect(line(ok, 'Gmail (email sending)').status).toBe('ok');
  });

  it('never repeats a value it was given', () => {
    const secret = 'postgresql://postgres.abc:TOPSECRETpw@host:5432/postgres';
    const lines = checkEnv({ DATABASE_URL: secret, JWT_SECRET: 'Z'.repeat(40), GMAIL_CLIENT_SECRET: 'gmail-SECRET-123' });
    const text = JSON.stringify(lines);
    expect(text).not.toMatch(/TOPSECRETpw|ZZZZ|gmail-SECRET-123/);
  });
});
