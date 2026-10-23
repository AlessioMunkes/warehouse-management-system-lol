// req.ip is the visitor's address behind Cloudflare, and only the
// header the deployment names is ever believed.
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { clientIp } from '../src/middleware/clientIp.middleware.js';

const appWith = (header) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(clientIp(header));
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  return app;
};

describe('clientIp', () => {
  it('uses the named header when it holds an address', async () => {
    const res = await request(appWith('cf-connecting-ip')).get('/ip').set('CF-Connecting-IP', '203.0.113.7');
    expect(res.body.ip).toBe('203.0.113.7');
    const v6 = await request(appWith('cf-connecting-ip')).get('/ip').set('CF-Connecting-IP', '2001:db8::1');
    expect(v6.body.ip).toBe('2001:db8::1');
  });

  it('ignores the header when the deployment has not named it, so it cannot be forged', async () => {
    const res = await request(appWith(undefined)).get('/ip').set('CF-Connecting-IP', '203.0.113.7');
    expect(res.body.ip).not.toBe('203.0.113.7');
  });

  it('ignores anything that is not an address', async () => {
    const res = await request(appWith('cf-connecting-ip')).get('/ip').set('CF-Connecting-IP', 'admin; drop table');
    expect(res.body.ip).not.toBe('admin; drop table');
  });
});
