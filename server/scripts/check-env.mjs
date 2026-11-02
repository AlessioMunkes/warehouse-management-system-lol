#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// server/scripts/check-env.mjs — is this server's environment complete?
//
//   cd server && npm run check-env
//
// Reads server/.env and .env.local (as the server does) plus anything
// already set in the shell, and says what is set, what is missing and
// what looks wrong. It never prints a value, so the output is safe to
// share. Exits 1 if something required is missing or wrong.
//
// On Render: Shell tab, then  cd server && node scripts/check-env.mjs
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import { checkEnv, hasBlockingProblem } from './lib/envCheck.js';

const MARK = { ok: '✓', missing: '✗', wrong: '✗', warn: '!', off: '–' };
const lines = checkEnv(process.env);

let section = null;
for (const l of lines) {
  if (l.section !== section) {
    section = l.section;
    console.log(`\n${section}`);
  }
  console.log(`  ${MARK[l.status]} ${l.name.padEnd(40)} ${l.message}`);
}

const count = (s) => lines.filter((l) => l.status === s).length;
console.log(`\n${count('ok')} ok, ${count('missing') + count('wrong')} to fix, ${count('warn')} to look at, ${count('off')} switched off.`);
if (hasBlockingProblem(lines)) {
  console.log('Fix the lines marked ✗ before starting the server. See server/env.example.');
  process.exit(1);
}
console.log('Nothing blocks the server from starting.');
