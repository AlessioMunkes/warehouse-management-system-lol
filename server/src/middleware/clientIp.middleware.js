// ─────────────────────────────────────────────────────────────
// server/src/middleware/clientIp.middleware.js
//
// Makes req.ip the visitor's own address on a host that puts Cloudflare
// in front of its proxy, as Render does.
//
// On Render, 'trust proxy' 1 gave req.ip as one of a handful of proxy
// addresses, not the visitor's. Seen from outside: one machine's
// requests landed in three different rate-limit buckets, and so did
// everyone else's. Every limiter (login, slip codes, password reset)
// was then shared by the whole internet: ten wrong passwords from
// anyone locked a third of all staff out of logging in.
//
// Cloudflare puts the visitor's address in CF-Connecting-IP and refuses
// any request that tries to set that header itself (403), so behind
// Cloudflare it cannot be forged. Anywhere else it could be, which is
// why this only reads the header named in TRUSTED_CLIENT_IP_HEADER, set
// in render.yaml. Unset, req.ip is left as Express worked it out.
//
// req.ip feeds the rate limiters and the IP recorded on password-reset
// and donation-form audit rows, so all of them see the real visitor.
// ─────────────────────────────────────────────────────────────
import net from 'node:net';

export const clientIp = (headerName = process.env.TRUSTED_CLIENT_IP_HEADER) => (req, _res, next) => {
  if (headerName) {
    const value = String(req.get(headerName) || '').trim();
    if (net.isIP(value)) {
      Object.defineProperty(req, 'ip', { value, configurable: true, enumerable: true });
    }
  }
  next();
};

export default clientIp;
