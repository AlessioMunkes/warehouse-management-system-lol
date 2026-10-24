// Whether the database's certificate is checked, from DB_SSL and DB_SSL_CA.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dbSslConfig } from '../src/config/dbSsl.js';

const PEM = '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----';

describe('database SSL', () => {
  it('is off when DB_SSL=false', () => {
    expect(dbSslConfig({ DB_SSL: 'false' })).toBe(false);
  });

  it('checks the certificate against DB_SSL_CA, given as text or as a file', () => {
    expect(dbSslConfig({ DB_SSL_CA: PEM })).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(dbSslConfig({ DB_SSL_CA: PEM.replace(/\n/g, '\n') })).toEqual({ ca: PEM, rejectUnauthorized: true });

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wms-ca-')), 'ca.crt');
    fs.writeFileSync(file, PEM);
    expect(dbSslConfig({ DB_SSL_CA: file })).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('checks against the system CAs with DB_SSL=verify', () => {
    expect(dbSslConfig({ DB_SSL: 'verify' })).toEqual({ rejectUnauthorized: true });
  });

  it('stays unchecked by default, and production says so', () => {
    const warn = vi.fn();
    expect(dbSslConfig({}, warn)).toEqual({ rejectUnauthorized: false });
    expect(warn).not.toHaveBeenCalled();
    expect(dbSslConfig({ NODE_ENV: 'production' }, warn)).toEqual({ rejectUnauthorized: false });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
