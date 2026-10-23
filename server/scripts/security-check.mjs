#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// server/scripts/security-check.mjs
//
// Checks a running deployment from the outside, the way a stranger on
// the internet would see it:
//
//   npm run security-check -- https://wms-lol.onrender.com
//   npm run security-check -- http://localhost:5000
//
// It only reads. Nothing here logs in, signs a guest in, claims a
// pallet or writes a row, so it is safe against the live site. The
// exception is opt-in: --rate-limit sends wrong logins, short codes
// and reset requests until each is refused. That locks out only the IP
// running the check, for 15 minutes.
//
// Exit code 1 when any check fails, so CI or a cron can run it.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) || '').replace(/\/+$/, '');
const withRateLimit = args.includes('--rate-limit');

if (!/^https?:\/\//.test(base)) {
  console.error('Usage: npm run security-check -- <base url> [--rate-limit]');
  process.exit(2);
}
const isHttps = base.startsWith('https://');
const isLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);

const results = [];
const pass = (name, detail = '') => results.push({ ok: true, name, detail });
const fail = (name, detail = '') => results.push({ ok: false, name, detail });
const warn = (name, detail = '') => results.push({ ok: null, name, detail });
const check = (cond, name, detail) => (cond ? pass(name, detail) : fail(name, detail));

const TIMEOUT_MS = 60_000; // a sleeping free-tier service takes ~50s to wake
const get = (path, init = {}) => fetch(`${base}${path}`, {
  redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), ...init,
});
const send = (method, path, body, headers = {}) => get(path, {
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const text = async (res) => { try { return await res.text(); } catch { return ''; } };

// A response that gives away how the server is built.
const LEAK = /(at \w+ \(|node_modules|\/src\/|\\src\\|ECONNREFUSED|syntax error at|column ".*" does not exist|pg_|SequelizeError|stack)/i;

// ── 1. Transport ──────────────────────────────────────────────
const transport = async () => {
  if (!isHttps) { warn('HTTPS', 'not tested: the base URL is http'); return; }
  try {
    const plain = await fetch(base.replace('https://', 'http://') + '/api/health', {
      redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const loc = plain.headers.get('location') || '';
    check(plain.status >= 300 && plain.status < 400 && loc.startsWith('https://'),
      'Plain http redirects to https', `${plain.status} ${loc}`);
  } catch (err) {
    pass('Plain http redirects to https', `http refused (${err.cause?.code || err.message})`);
  }
};

// ── 2. Headers on the app shell and the API ───────────────────
const headers = async () => {
  const page = await get('/');
  const api = await get('/api/health');
  check(api.status === 200, 'Health check answers', String(api.status));

  for (const [label, res] of [['page', page], ['api', api]]) {
    const h = (n) => res.headers.get(n) || '';
    if (isHttps) {
      const hsts = h('strict-transport-security');
      const age = Number((hsts.match(/max-age=(\d+)/) || [])[1] || 0);
      check(age >= 15552000, `HSTS on the ${label} (6 months or more)`, hsts || 'missing');
    }
    check(h('x-content-type-options') === 'nosniff', `X-Content-Type-Options on the ${label}`, h('x-content-type-options') || 'missing');
    const csp = h('content-security-policy');
    check(/frame-ancestors 'self'|frame-ancestors 'none'/.test(csp) || /deny|sameorigin/i.test(h('x-frame-options')),
      `Clickjacking protection on the ${label}`, csp ? 'CSP frame-ancestors' : h('x-frame-options') || 'missing');
    check(!h('x-powered-by'), `No X-Powered-By on the ${label}`, h('x-powered-by'));
  }

  const csp = page.headers.get('content-security-policy') || '';
  check(Boolean(csp), 'Content-Security-Policy on the app', csp ? 'present' : 'missing');
  check(!/script-src[^;]*'unsafe-inline'/.test(csp) && !/script-src[^;]*'unsafe-eval'/.test(csp),
    'CSP does not allow inline or eval scripts', (csp.match(/script-src[^;]*/) || ['no script-src'])[0]);
  check(/object-src 'none'/.test(csp), 'CSP blocks plugins (object-src none)');
};

// ── 3. Files that must not be served ──────────────────────────
const exposedFiles = async () => {
  const shell = await text(await get('/'));
  for (const path of ['/.env', '/server/.env', '/.git/config', '/.git/HEAD', '/package.json',
    '/server/package.json', '/render.yaml', '/server/database/schema.sql', '/index.js']) {
    const res = await get(path);
    const body = await text(res);
    // The SPA answers unknown paths with index.html. That is fine; the
    // file itself is not.
    const isShell = body === shell || /<div id="root">/.test(body);
    check(res.status === 404 || isShell, `Not served: ${path}`, isShell ? 'app shell' : String(res.status));
  }

  // Source maps would hand out the readable source.
  const scripts = [...shell.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  if (!scripts.length) { warn('Source maps', 'no /assets script found in the shell'); return; }
  const map = await get(`${scripts[0]}.map`);
  const mapBody = await text(map);
  check(!(map.status === 200 && mapBody.includes('"mappings"')), 'No public source maps', `${scripts[0]}.map → ${map.status}`);
  const js = await text(await get(scripts[0]));
  check(!/sourceMappingURL=/.test(js.slice(-300)), 'Bundle does not point at a source map');
  const secretish = js.match(/(AIza[0-9A-Za-z_-]{30,}|sk_live_[0-9a-zA-Z]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|eyJhbGciOi[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{20,})/);
  check(!secretish, 'No API keys or tokens in the client bundle', secretish ? secretish[0].slice(0, 12) + '…' : '');
};

// ── 4. Staff-only API refuses strangers ───────────────────────
const PROTECTED = [
  ['GET', '/api/me'], ['GET', '/api/users'], ['GET', '/api/products'], ['GET', '/api/stock'],
  ['GET', '/api/suppliers'], ['GET', '/api/purchase-orders'], ['GET', '/api/picking'],
  ['GET', '/api/dispatch'], ['GET', '/api/reporting/catalog'], ['GET', '/api/finance/report'],
  ['GET', '/api/admin/activity'], ['GET', '/api/volunteers'], ['GET', '/api/volunteers/gate-code'],
  ['GET', '/api/donations'], ['GET', '/api/beneficiaries'], ['GET', '/api/settings'],
  ['GET', '/api/notifications'], ['GET', '/api/notifications/floor'], ['GET', '/api/photos/1/image'],
  ['GET', '/api/certificate-settings'], ['GET', '/api/communications/messages'], ['GET', '/api/dashboard/summary'],
  ['GET', '/api/push/public-key'], ['POST', '/api/push/subscribe'], ['GET', '/api/slip/available'],
  ['GET', '/api/gmail/status'], ['GET', '/api/quickbooks/status'], ['POST', '/api/assistant/ask'],
];

const unauthenticated = async () => {
  const forged = (claims, alg = 'HS256', secret = 'not-the-secret') => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b64({ alg, typ: 'JWT' });
    const body = b64({ id: 1, username: 'admin', role: 'admin', iat: Math.floor(Date.now() / 1000), ...claims });
    const sig = alg === 'none' ? '' : crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
  };
  const cookies = {
    'no cookie': null,
    'a token signed with a guessed secret': forged({}),
    'an unsigned (alg none) token': forged({}, 'none'),
    'an expired-shaped garbage token': 'eyJhbGciOiJIUzI1NiJ9.e30.x',
  };
  // A deploy that kept a placeholder or a common word as JWT_SECRET
  // would accept these. env.example's placeholder is first.
  for (const secret of ['your_jwt_secret_here', 'secret', 'changeme', 'jwt_secret', 'password', 'wms', 'ladlesoflove']) {
    cookies[`a token signed with "${secret}"`] = forged({}, 'HS256', secret);
  }

  for (const [method, path] of PROTECTED) {
    const bad = [];
    for (const [label, token] of Object.entries(cookies)) {
      const res = await send(method, path, method === 'GET' ? undefined : {},
        token ? { Cookie: `wms_token=${token}` } : {});
      // 429: a rate limiter refused first, which is still a refusal.
      if (![401, 403, 429].includes(res.status)) bad.push(`${label} → ${res.status}`);
      const body = await text(res);
      if (LEAK.test(body)) bad.push(`${label} leaks internals`);
    }
    check(!bad.length, `${method} ${path} refuses strangers and forged tokens`, bad.join('; '));
  }
};

// ── 5. Public routes give nothing away ────────────────────────
const publicRoutes = async () => {
  const random = crypto.randomBytes(32).toString('base64url');
  const uuid = crypto.randomUUID();
  const cases = [
    ['GET', `/api/finance/public/${random}/report`, [404]],
    ['GET', `/api/slip/${uuid}`, [404]],
    ['GET', '/api/slip/code/zzzzzz', [400, 404]],
    ['GET', `/api/invites/${random}`, [400, 404, 410]],
    ['GET', `/api/password-reset/${random}`, [400, 404, 410]],
    ['GET', `/api/donations/section-18a/form/${random}`, [400, 404, 410]],
    // Injection-shaped input must be turned away, not reach the database.
    ['GET', `/api/slip/${encodeURIComponent("' OR '1'='1")}`, [400, 404]],
    ['GET', `/api/finance/public/${encodeURIComponent("x' OR 1=1--")}/report`, [400, 404]],
    ['GET', '/api/slip/code/%27%3B--', [400, 404]],
    ['GET', `/api/photos/${encodeURIComponent('../../etc/passwd')}/image`, [400, 401, 404]],
  ];
  for (const [method, path, okStatuses] of cases) {
    const res = await send(method, path);
    const body = await text(res);
    const problems = [];
    // Cloudflare (in front of Render) turns away injection-shaped URLs
    // before they reach the app. That counts: nothing got through.
    const edgeBlocked = res.status === 403 && /cloudflare/i.test(res.headers.get('server') || '');
    if (!okStatuses.includes(res.status) && !edgeBlocked) problems.push(`status ${res.status}`);
    if (!edgeBlocked && LEAK.test(body)) problems.push('leaks internals');
    check(!problems.length, `${method} ${path.slice(0, 60)} gives nothing away`,
      problems.join('; ') || (edgeBlocked ? 'blocked by Cloudflare' : String(res.status)));
  }

  // The public warehouse list and impact summary are meant to be open,
  // but should carry no personal or stock detail.
  for (const path of ['/api/public/warehouses', '/api/public/impact-summary']) {
    const res = await get(path);
    const body = await text(res);
    check(!/(@|password|phone|email|address|token)/i.test(body), `${path} holds no personal detail`, `${res.status}, ${body.length} bytes`);
  }

  // Login must not say which of username or password was wrong.
  const user = `nobody-${crypto.randomBytes(6).toString('hex')}`;
  const a = await send('POST', '/api/login', { username: user, password: 'wrong-password-1' });
  const aBody = await text(a);
  check(a.status === 401 && !/username|user not found|no such/i.test(aBody.replace('Invalid username or password', '')),
    'Login does not reveal whether a username exists', `${a.status} ${aBody.slice(0, 80)}`);

  // Password reset answers the same for any address.
  const r = await send('POST', '/api/password-reset/request', { email: `${user}@example.invalid` });
  const rBody = await text(r);
  check(r.status === 200 || r.status === 202, 'Password reset gives the same answer for any address', `${r.status} ${rBody.slice(0, 80)}`);
};

// ── 6. Rate limiters count each visitor once ──────────────────
// Every request from this machine must land in the same bucket. If the
// key changes between requests, the server is keying on a proxy's
// address, and the whole internet shares a few buckets: anyone can
// lock everyone out. Costs three wrong short-code guesses.
const limiterKey = async () => {
  const keys = new Set();
  const left = [];
  for (let i = 0; i < 3; i += 1) {
    const res = await get(`/api/slip/code/${crypto.randomBytes(3).toString('hex')}`);
    const policy = res.headers.get('ratelimit-policy') || '';
    const key = (policy.match(/pk=:([^:]+):/) || [])[1];
    if (!key) { warn('Rate limiter counts each visitor once', 'no ratelimit-policy key to compare'); return; }
    keys.add(key);
    left.push((res.headers.get('ratelimit') || '').match(/r=(\d+)/)?.[1]);
  }
  check(keys.size === 1, 'Rate limiter counts each visitor once',
    keys.size === 1 ? `one key, ${left.join(' → ')} left` : `${keys.size} different keys for one machine`);
};

// ── 7. CORS ───────────────────────────────────────────────────
const cors = async () => {
  const res = await get('/api/health', { headers: { Origin: 'https://evil.example' } });
  const allowed = res.headers.get('access-control-allow-origin');
  check(allowed !== 'https://evil.example' && allowed !== '*', 'Another site cannot read the API (CORS)', allowed || 'no allow-origin');

  const pre = await get('/api/users', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
  });
  const preAllowed = pre.headers.get('access-control-allow-origin');
  check(preAllowed !== 'https://evil.example', 'Preflight from another site is refused', `${pre.status} ${preAllowed || ''}`);
};

// ── 8. Rate limits (opt-in) ───────────────────────────────────
// Each sends wrong guesses until the server refuses. Nothing matches,
// so nothing is changed; the IP running this is locked out of that
// endpoint for 15 minutes.
const until429 = async (max, attempt) => {
  for (let i = 0; i < max; i += 1) {
    const res = await attempt(i);
    if (res.status === 429) return i + 1;
  }
  return null;
};

const rateLimit = async () => {
  if (!withRateLimit) { warn('Rate limits', 'skipped; pass --rate-limit (locks this IP out of login, slip codes and reset for 15 minutes)'); return; }
  const tag = crypto.randomBytes(6).toString('hex');

  const login = await until429(15, (i) => send('POST', '/api/login', { username: `ratelimit-${tag}`, password: `wrong-${i}` }));
  check(login !== null && login <= 12, 'Login refuses after repeated failures', login ? `429 after ${login}` : 'never refused');

  // Short codes are 6 hex characters: the limiter is what makes guessing one hopeless.
  const codes = await until429(70, (i) => get(`/api/slip/code/${(0xa00000 + i).toString(16)}`));
  check(codes !== null && codes <= 62, 'Pallet short-code guessing is refused', codes ? `429 after ${codes}` : 'never refused');

  const reset = await until429(30, (i) => send('POST', '/api/password-reset/request', { email: `ratelimit-${tag}-${i}@example.invalid` }));
  check(reset !== null, 'Password reset requests are limited', reset ? `429 after ${reset}` : 'never refused');
};

// ── Run ───────────────────────────────────────────────────────
console.log(`Checking ${base}${isLocal ? ' (local)' : ''}\n`);
for (const step of [transport, headers, exposedFiles, unauthenticated, publicRoutes, limiterKey, cors, rateLimit]) {
  try { await step(); } catch (err) { fail(step.name, `check crashed: ${err.message}`); }
}

for (const r of results) {
  const mark = r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'SKIP';
  console.log(`${mark}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
const failed = results.filter((r) => r.ok === false).length;
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed} failed, ${results.filter((r) => r.ok === null).length} skipped`);
process.exit(failed ? 1 : 0);
