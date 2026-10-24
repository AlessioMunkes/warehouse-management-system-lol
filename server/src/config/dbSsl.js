// ─────────────────────────────────────────────────────────────
// server/src/config/dbSsl.js
//
// The `ssl` option for every database connection: the server's pools,
// the migrator and warehouse-admin.
//
//   DB_SSL=false        no SSL (a local Postgres without it)
//   DB_SSL_CA=...       SSL, and the server's certificate must be signed
//                       by this CA. Either the PEM text or a path to the
//                       .crt file. For Supabase, download it from
//                       Project Settings > Database > SSL Configuration.
//   DB_SSL=verify       SSL, checked against the system's trusted CAs
//                       (a provider whose certificate is publicly signed)
//   neither             SSL, but the certificate is not checked
//
// The last is how this has always run. Traffic is encrypted, but
// anyone able to sit between the server and the database could pose as
// it and read the password. It stays the default only because
// Supabase's CA is not one Node trusts, so checking without DB_SSL_CA
// would refuse every connection. Production says so at startup.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';

const readCa = (value) => {
  const text = String(value).trim();
  if (text.startsWith('-----BEGIN')) return text.replace(/\\n/g, '\n');
  return fs.readFileSync(text, 'utf8');
};

export const dbSslConfig = (env = process.env, warn = console.warn) => {
  if (env.DB_SSL === 'false') return false;
  if (env.DB_SSL_CA) return { ca: readCa(env.DB_SSL_CA), rejectUnauthorized: true };
  if (env.DB_SSL === 'verify') return { rejectUnauthorized: true };
  if (env.NODE_ENV === 'production') {
    warn('[db] The database certificate is not being checked. Set DB_SSL_CA to the provider\'s CA certificate (see env.example).');
  }
  return { rejectUnauthorized: false };
};
