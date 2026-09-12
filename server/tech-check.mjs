// Diagnostic script: try to import the server and test login
import 'dotenv/config';

if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://postgres:team22@localhost:5432/warehouse_db';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test';
if (!process.env.PORT) process.env.PORT = '5000';

const startTime = Date.now();

console.log('[tech-check] Starting server import test...');

try {
  const mod = await import('./index.js');
  console.log('[tech-check] Server module imported successfully');

  // Wait for DB connection and server to start
  setTimeout(async () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[tech-check] ${elapsed}s elapsed, attempting login...`);
    try {
      const res = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      });
      console.log('[tech-check] LOGIN STATUS:', res.status);
      const text = await res.text();
      console.log('[tech-check] LOGIN BODY:', text.substring(0, 500));
    } catch(e) {
      console.error('[tech-check] FETCH ERROR:', e.message);
    }
    process.exit(0);
  }, 10000);
} catch(e) {
  console.error('[tech-check] SERVER IMPORT ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
}
